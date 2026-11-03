import type { Platform } from '@creator-center/shared';
import type { AdapterContext, AdapterResult, PlatformAdapter } from './types.js';

export class UnavailableAdapter implements PlatformAdapter {
  implemented = false;

  constructor(public readonly platform: Platform) {}

  async sync(context: AdapterContext): Promise<AdapterResult> {
    const hadReading = Boolean(context.account.lastSuccessAt);
    return {
      success: false,
      capturedAt: new Date().toISOString(),
      status: hadReading ? 'connected' : 'setup_required',
      keepPrevious: hadReading,
      detail: hadReading
        ? 'This platform has no live collector in this build yet. The last good reading is kept and marked stale.'
        : 'This platform has no live collector in this build yet. Sign in is available for 抖音 only so far.',
    };
  }
}
