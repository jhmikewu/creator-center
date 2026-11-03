import type { Account } from '@creator-center/shared';
import { SimulatorAdapter } from './simulator.js';
import { UnavailableAdapter } from './unavailable.js';
import { liveCollectorFor } from './live.js';
import type { PlatformAdapter } from './types.js';

export function adapterFor(account: Account): PlatformAdapter {
  if (account.isDemo) return new SimulatorAdapter(account.platform);
  return liveCollectorFor(account) ?? new UnavailableAdapter(account.platform);
}

export * from './types.js';
