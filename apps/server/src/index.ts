import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { openDatabase } from './db.js';
import { getSettings } from './repositories/settings.js';
import { SyncService } from './services/sync.js';
import { createApp } from './api.js';

export const APP_VERSION = '0.1.7';

export interface LocalServerOptions {
  dataDir?: string;
  port?: number;
  webDist?: string;
  desktop?: boolean;
}

export interface LocalServer {
  url: string;
  port: number;
  dataDir: string;
  close: () => Promise<void>;
}

export function defaultDataDir(): string {
  return process.env.CREATOR_CENTER_DATA_DIR || path.join(os.homedir(), '.creator-center');
}

export async function startLocalServer(options: LocalServerOptions = {}): Promise<LocalServer> {
  const dataDir = path.resolve(options.dataDir ?? defaultDataDir());
  const port = options.port ?? Number(process.env.CREATOR_CENTER_PORT ?? 4317);
  const db = openDatabase(dataDir);
  const settings = () => getSettings(db, dataDir);
  const sync = new SyncService(db, settings);
  const app = createApp({
    db,
    dataDir,
    version: APP_VERSION,
    sync,
    ...(options.webDist ? { webDist: options.webDist } : {}),
    ...(options.desktop ? { desktop: true } : {}),
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://127.0.0.1:${resolvedPort}`;
  sync.startAuto();
  return {
    url,
    port: resolvedPort,
    dataDir,
    close: async () => {
      sync.stopAuto();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const webDist = process.env.CREATOR_CENTER_WEB_DIST
    ? path.resolve(process.env.CREATOR_CENTER_WEB_DIST)
    : path.resolve(process.cwd(), 'apps/web/dist');
  const server = await startLocalServer({
    webDist,
    ...(process.env.CREATOR_CENTER_DESKTOP === '1' ? { desktop: true } : {}),
  });
  console.log(`Creator Center API on ${server.url}`);
  console.log(`Data directory: ${server.dataDir}`);
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

export { createApp } from './api.js';
