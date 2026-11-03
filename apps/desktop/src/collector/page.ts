import { BrowserWindow, session } from 'electron';

export interface CapturedJson {
  url: string;
  body: unknown;
}

/**
 * A hidden Electron page in one account's persistent session. Responses are
 * observed through the Chrome DevTools Protocol; only JSON from the creator
 * console is retained, and nothing leaves the desktop process except the
 * explicitly mapped capture the bridge returns.
 */
export class CollectorPage {
  private readonly win: BrowserWindow;
  private readonly captured: CapturedJson[] = [];
  private readonly pending = new Map<string, string>();
  private handler: ((event: unknown, method: string, params: Record<string, unknown>) => void) | null = null;
  private attached = false;

  constructor(partition: string) {
    this.win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
  }

  currentUrl(): string {
    try {
      return this.win.webContents.getURL();
    } catch {
      return '';
    }
  }

  async open(url: string, settleMs = 2500): Promise<void> {
    await this.attach();
    if (!this.attached) throw new Error('The browser response observer could not start.');
    try {
      await this.win.loadURL(url);
    } catch {
      // A site-side redirect or aborted navigation is handled by the caller.
    }
    await wait(settleMs);
  }

  async text(): Promise<string> {
    try {
      return (await this.win.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true)) as string;
    } catch {
      return '';
    }
  }

  async clickText(...labels: string[]): Promise<string | null> {
    const script = `(() => {
      const labels = ${JSON.stringify(labels)};
      const nodes = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[class*="option"],[class*="select"] span,span,div')];
      for (const label of labels) {
        const exact = nodes.find((node) => node.textContent && node.textContent.trim() === label && node.offsetParent !== null);
        if (exact) { exact.click(); return label; }
      }
      for (const label of labels) {
        const partial = nodes.find((node) => node.textContent && node.textContent.trim().includes(label) && node.offsetParent !== null);
        if (partial) { partial.click(); return label; }
      }
      return null;
    })()`;
    try {
      return (await this.win.webContents.executeJavaScript(script, true)) as string | null;
    } catch {
      return null;
    }
  }

  async scrollAll(): Promise<void> {
    const script = `(() => {
      const elements = [document.scrollingElement, ...document.querySelectorAll('div')];
      for (const element of elements) {
        if (!element) continue;
        const style = getComputedStyle(element);
        const scrollable = element === document.scrollingElement || /auto|scroll/.test(style.overflowY);
        if (scrollable && element.scrollHeight > element.clientHeight + 50) {
          element.scrollTop = element.scrollHeight;
        }
      }
    })()`;
    try {
      await this.win.webContents.executeJavaScript(script, true);
    } catch {
      // Scrolling is best-effort; the first page is still useful.
    }
  }

  hasJson(pattern: RegExp): boolean {
    return this.captured.some((entry) => pattern.test(entry.url));
  }

  async waitForJson(pattern: RegExp, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.hasJson(pattern)) return true;
      await wait(150);
    }
    return this.hasJson(pattern);
  }

  json(pattern: RegExp): CapturedJson[] {
    return this.captured.filter((entry) => pattern.test(entry.url));
  }

  lastJson(pattern: RegExp): unknown | null {
    const matches = this.json(pattern);
    return matches.length ? matches[matches.length - 1]!.body : null;
  }

  close(): void {
    try {
      if (this.attached) this.win.webContents.debugger.detach();
    } catch {
      // The window may already be gone.
    }
    if (!this.win.isDestroyed()) this.win.destroy();
  }

  private async attach(): Promise<void> {
    if (this.attached) return;
    const debuggerApi = this.win.webContents.debugger;
    try {
      debuggerApi.attach('1.3');
    } catch {
      return;
    }
    this.handler = (_event, method, params) => {
      if (method === 'Network.responseReceived') {
        const response = params.response as { url?: string; mimeType?: string; status?: number } | undefined;
        const url = response?.url ?? '';
        if (
          response?.status === 200 &&
          /^https:\/\/creator\.douyin\.com\//.test(url) &&
          /json/i.test(response.mimeType ?? '')
        ) {
          this.pending.set(String(params.requestId), url);
        }
      } else if (method === 'Network.loadingFinished') {
        const requestId = String(params.requestId);
        const url = this.pending.get(requestId);
        if (!url) return;
        this.pending.delete(requestId);
        void this.readBody(requestId, url);
      }
    };
    debuggerApi.on('message', this.handler);
    try {
      await debuggerApi.sendCommand('Network.enable');
      this.attached = true;
    } catch {
      this.attached = false;
    }
  }

  private async readBody(requestId: string, url: string): Promise<void> {
    try {
      const result = (await this.win.webContents.debugger.sendCommand('Network.getResponseBody', { requestId })) as {
        body: string;
        base64Encoded: boolean;
      };
      const text = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body;
      this.captured.push({ url, body: JSON.parse(text) });
    } catch {
      // Bodies can disappear when a navigation cancels the request.
    }
  }
}

/** True when this account's partition has any unexpired cookie. */
export async function hasSessionCookies(partition: string): Promise<boolean> {
  try {
    const cookies = await session.fromPartition(partition).cookies.get({});
    return cookies.some((cookie) => cookie.expirationDate === undefined || cookie.expirationDate * 1000 > Date.now());
  } catch {
    return false;
  }
}

export function accountPartition(accountId: string): string {
  return `persist:cc-account-${accountId}`;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
