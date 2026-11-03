import type { Account, CollectorResponse, Platform } from '@creator-center/shared';
import { DouyinLoginRequiredError, parseDouyinCapture } from '../collectors/douyin.js';
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
        signal: AbortSignal.timeout(120_000),
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
      if (this.platform !== 'douyin') throw new Error('This platform has no live parser in this build yet.');
      return parseDouyinCapture(body.payload, context.account);
    } catch (error) {
      if (error instanceof DouyinLoginRequiredError) {
        return {
          success: false,
          capturedAt,
          status: 'login_required',
          keepPrevious: Boolean(context.account.lastSuccessAt),
          detail: error.message,
        };
      }
      return {
        success: false,
        capturedAt,
        status: 'error',
        keepPrevious: Boolean(context.account.lastSuccessAt),
        detail: error instanceof Error ? error.message : 'The live collector failed.',
      };
    }
  }
}

export function liveCollectorFor(account: Account): PlatformAdapter | null {
  const bridgeUrl = process.env.CREATOR_CENTER_COLLECTOR_URL?.trim();
  if (!bridgeUrl || account.isDemo) return null;
  // One platform is ported so far; the rest stay truthful stubs instead of guessing.
  if (account.platform !== 'douyin') return null;
  return new LiveCollectorAdapter(account.platform, bridgeUrl);
}
