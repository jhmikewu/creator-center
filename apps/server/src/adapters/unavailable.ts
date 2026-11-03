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
        ? 'This build has no live collector for this platform yet. The last good reading is kept and marked stale.'
        : 'Live collection is not part of this first increment yet. Add a demo workspace or wait for the collector update.',
    };
  }
}
