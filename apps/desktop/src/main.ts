import { app, BrowserWindow, dialog, ipcMain, Notification, nativeTheme, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { startCollectorBridge, type CollectorBridge } from './collector/bridge.js';
import { accountPartition } from './collector/page.js';

const here = __dirname;
const APP_NAME = 'Creator Center';

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let collectorBridge: CollectorBridge | null = null;
let windowState: WindowState = { width: 1440, height: 940 };

function stateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState(): WindowState {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as Partial<WindowState>;
    return {
      width: Math.max(1024, Number(parsed.width) || 1440),
      height: Math.max(700, Number(parsed.height) || 940),
      ...(typeof parsed.x === 'number' ? { x: parsed.x } : {}),
      ...(typeof parsed.y === 'number' ? { y: parsed.y } : {}),
      ...(parsed.maximized ? { maximized: true } : {}),
    };
  } catch {
    return { width: 1440, height: 940 };
  }
}

function saveWindowState(): void {
  if (!mainWindow) return;
  const bounds = mainWindow.getNormalBounds();
  const next: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: mainWindow.isMaximized(),
  };
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(next));
  } catch (error) {
    console.warn('Could not save window state', error);
  }
}

function webDist(): string {
  if (process.env.CREATOR_CENTER_WEB_DIST) return process.env.CREATOR_CENTER_WEB_DIST;
  if (app.isPackaged) return path.join(process.resourcesPath, 'web');
  return path.resolve(here, '../../web/dist');
}

function serverEntry(): string {
  if (process.env.CREATOR_CENTER_SERVER_ENTRY) return process.env.CREATOR_CENTER_SERVER_ENTRY;
  if (app.isPackaged) return path.join(process.resourcesPath, 'server', 'index.js');
  return path.resolve(here, '../../server/dist/index.js');
}

function dataDir(): string {
  if (process.env.CREATOR_CENTER_DATA_DIR) return process.env.CREATOR_CENTER_DATA_DIR;
  return app.getPath('userData');
}

function nodeBinary(): string {
  if (process.env.CREATOR_CENTER_NODE) return process.env.CREATOR_CENTER_NODE;
  if (app.isPackaged) return path.join(process.resourcesPath, 'node');
  return 'node';
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // The child is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  throw new Error('The local backend did not start in time.');
}

async function startBackend(): Promise<string> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const entry = serverEntry();
  if (!fs.existsSync(entry)) throw new Error(`The local backend is missing at ${entry}. Run the build first.`);
  serverProcess = spawn(nodeBinary(), [entry], {
    cwd: app.isPackaged ? path.dirname(entry) : path.resolve(here, '../../..'),
    env: {
      ...process.env,
      CREATOR_CENTER_DATA_DIR: dataDir(),
      CREATOR_CENTER_PORT: String(port),
      CREATOR_CENTER_WEB_DIST: webDist(),
      CREATOR_CENTER_DESKTOP: '1',
      ...(collectorBridge ? { CREATOR_CENTER_COLLECTOR_URL: collectorBridge.url } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout?.on('data', (chunk: Buffer) => {
    if (process.env.CREATOR_CENTER_LOGS === '1') process.stdout.write(`[backend] ${chunk.toString()}`);
  });
  serverProcess.stderr?.on('data', (chunk: Buffer) => {
    console.error(`[backend] ${chunk.toString()}`);
  });
  serverProcess.once('exit', (code) => {
    if (code && code !== 0) {
      dialog.showErrorBox('Creator Center backend stopped', `The local backend exited with code ${code}.`);
    }
  });
  await waitForHealth(url);
  if (!app.isPackaged) console.log(`Creator Center API ${url}`);
  return url;
}

async function createWindow(): Promise<void> {
  const url = await startBackend();
  nativeTheme.themeSource = 'system';
  windowState = readWindowState();
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    ...(windowState.x !== undefined ? { x: windowState.x } : {}),
    ...(windowState.y !== undefined ? { y: windowState.y } : {}),
    minWidth: 1024,
    minHeight: 700,
    title: APP_NAME,
    backgroundColor: '#0e1714',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (windowState.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!url || !target.startsWith(url)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
    }
  });

  await mainWindow.loadURL(url);
  if (process.env.CREATOR_CENTER_DEVTOOLS === '1') mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function stopBackend(): void {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

ipcMain.handle('creator-center:connect-session', async (_event, payload: {
  accountId?: unknown;
  studioUrl?: unknown;
}) => {
  const accountId = typeof payload?.accountId === 'string' ? payload.accountId : '';
  const studioUrl = typeof payload?.studioUrl === 'string' ? payload.studioUrl : '';
  if (!accountId) return { ok: false, detail: 'No account selected.' };
  const partition = accountPartition(accountId);
  const loginWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    show: true,
    title: 'Sign in',
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  try {
    await loginWindow.loadURL(studioUrl || 'https://creator.douyin.com/creator-micro/home');
  } catch {
    // Keep the window open; the user can navigate or close it.
  }
  return await new Promise<{ ok: boolean; detail?: string }>((resolve) => {
    loginWindow.on('closed', () => {
      void Promise.race([
        session.fromPartition(partition).cookies.get({}),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The saved session could not be checked.')), 5000)),
      ]).then((cookies) => {
        const saved = cookies.some(
          (cookie) => cookie.expirationDate === undefined || cookie.expirationDate * 1000 > Date.now(),
        );
        resolve(saved ? { ok: true } : { ok: false, detail: 'The sign-in window closed without a saved session.' });
      }).catch((error) => resolve({
        ok: false,
        detail: error instanceof Error ? error.message : 'The saved session could not be checked.',
      }));
    });
  });
});

ipcMain.handle('creator-center:choose-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose the old Creator Center database',
    properties: ['openFile'],
    filters: [{ name: 'SQLite database', extensions: ['sqlite3', 'sqlite', 'db'] }],
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
});

ipcMain.handle('creator-center:info', () => ({
  platform: process.platform,
  version: app.getVersion(),
  dataDir: dataDir(),
  packaged: app.isPackaged,
}));

ipcMain.handle('creator-center:notify', (_event, payload: { title?: unknown; body?: unknown }) => {
  const title = typeof payload?.title === 'string' ? payload.title.slice(0, 120) : APP_NAME;
  const body = typeof payload?.body === 'string' ? payload.body.slice(0, 300) : '';
  if (Notification.isSupported()) new Notification({ title, body }).show();
  return true;
});

ipcMain.handle('creator-center:open-external', (_event, url: unknown) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url);
  return true;
});

if (process.env.CREATOR_CENTER_REMOTE_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.CREATOR_CENTER_REMOTE_DEBUG);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setName(APP_NAME);
    try {
      collectorBridge = await startCollectorBridge();
    } catch (error) {
      console.warn('Live collector bridge unavailable', error);
    }
    try {
      await createWindow();
    } catch (error) {
      dialog.showErrorBox(
        'Creator Center could not start',
        error instanceof Error ? error.message : 'The local workspace could not start.',
      );
      app.quit();
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });

  app.on('window-all-closed', () => {
    stopBackend();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    saveWindowState();
    stopBackend();
    collectorBridge?.close();
    collectorBridge = null;
  });
}
