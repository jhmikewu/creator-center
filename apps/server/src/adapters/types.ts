import type {
  Account,
  AccountStatus,
  AnalyticsStatus,
  ContentStatus,
  HistoryPoint,
  Post,
} from '@creator-center/shared';
import type { MetricInput } from '../repositories/accounts.js';
import type { PostInput } from '../repositories/posts.js';

export interface AdapterContext {
  account: Account;
  posts: readonly Post[];
  history: readonly HistoryPoint[];
  now: Date;
}

export interface AdapterSnapshot {
  success: true;
  capturedAt: string;
  status: AccountStatus;
  statusDetail: string;
  analyticsStatus: AnalyticsStatus;
  analyticsDetail: string;
  contentStatus: ContentStatus;
  contentDetail: string;
  metrics: MetricInput[];
  history: HistoryPoint | null;
  posts: PostInput[];
  scheduled: PostInput[];
}

export interface AdapterFailure {
  success: false;
  capturedAt: string;
  detail: string;
  status: AccountStatus;
  /** True when an earlier good reading is kept and should be marked stale. */
  keepPrevious: boolean;
}

export type AdapterResult = AdapterSnapshot | AdapterFailure;

export interface PlatformAdapter {
  platform: Account['platform'];
  /** The collection is a placeholder until the real collector lands. */
  implemented: boolean;
  sync(context: AdapterContext): Promise<AdapterResult>;
}
