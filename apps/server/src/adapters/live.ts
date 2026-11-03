import type { Account, BrowserCapture, CollectorResponse, DouyinCapture, Platform } from '@creator-center/shared';
import { BilibiliLoginRequiredError, parseBilibiliCapture } from '../collectors/bilibili.js';
import { DouyinLoginRequiredError, parseDouyinCapture } from '../collectors/douyin.js';
import { WechatLoginRequiredError, parseWechatCapture } from '../collectors/wechat.js';
import { XiaohongshuLoginRequiredError, parseXiaohongshuCapture } from '../collectors/xiaohongshu.js';
import type { AdapterContext, AdapterResult, PlatformAdapter } from './types.js';

/**
 * Collects through the desktop app, which owns the isolated browser session.
 * The sidecar never reads cookies or drives a browser itself.
 */
export class LiveCollectorAdapter implements PlatformAdapter {
  implemented = true;

  constructor(
    public readonly platform: Platform,
    private readonly bridgeUrl: string,
  ) {}

  async sync(context: AdapterContext): Promise<AdapterResult> {
    const capturedAt = new Date().toISOString();
    try {
      const response = await fetch(`${this.bridgeUrl.replace(/\/$/, '')}/collect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: context.account.id,
          platform: this.platform,
          studioUrl: context.account.studioUrl,
          displayName: context.account.displayName,
        }),
        signal: AbortSignal.timeout(75_000),
      });
      if (!response.ok) throw new Error(`The desktop collector returned HTTP ${response.status}.`);
      const body = (await response.json()) as CollectorResponse;
      if (!body.ok) {
        const login = body.loginRequired === true;
        return {
          success: false,
          capturedAt,
          status: login ? 'login_required' : 'error',
          keepPrevious: Boolean(context.account.lastSuccessAt),
          detail: body.detail ?? (login
            ? `Sign in to the ${this.platform} creator console, then sync again.`
            : 'The live collector could not read this creator console.'),
        };
      }
      if (!body.payload) throw new Error('The desktop collector returned no account data.');
      if (this.platform === 'douyin') return parseDouyinCapture(body.payload as DouyinCapture, context.account);
      if (this.platform === 'bilibili') return parseBilibiliCapture(body.payload as BrowserCapture, context.account);
      if (this.platform === 'xiaohongshu') return parseXiaohongshuCapture(body.payload as BrowserCapture, context.account);
      if (this.platform === 'wechat') return parseWechatCapture(body.payload as BrowserCapture, context.account);
      throw new Error('This platform has no live parser in this build yet.');
    } catch (error) {
      if (
        error instanceof DouyinLoginRequiredError ||
        error instanceof BilibiliLoginRequiredError ||
        error instanceof XiaohongshuLoginRequiredError ||
        error instanceof WechatLoginRequiredError
      ) {
        return {
          success: false,
          capturedAt,
          status: 'login_required',
          keepPrevious: Boolean(context.account.lastSuccessAt),
          detail: error.message,
        };
      }
      const message = error instanceof Error ? error.message : 'The live collector failed.';
      const detail = /abort|timeout/i.test(message)
        ? 'The desktop collector did not respond in time. Restart the app if it stays stuck, then sync again.'
        : /fetch failed|ECONNREFUSED|connect/i.test(message)
          ? 'The desktop collector bridge is not reachable. Restart the desktop app and sync again.'
          : message;
      return {
        success: false,
        capturedAt,
        status: 'error',
        keepPrevious: Boolean(context.account.lastSuccessAt),
        detail,
      };
    }
  }
}

export function liveCollectorFor(account: Account): PlatformAdapter | null {
  const bridgeUrl = process.env.CREATOR_CENTER_COLLECTOR_URL?.trim();
  if (!bridgeUrl || account.isDemo) return null;
  // Only platforms with a real capture and parser get the live adapter.
  if (!['douyin', 'bilibili', 'xiaohongshu', 'wechat'].includes(account.platform)) return null;
  return new LiveCollectorAdapter(account.platform, bridgeUrl);
}
