/**
 * The vocabulary of the workspace. These types are shared by the local API,
 * the desktop shell and the renderer so a platform adapter cannot quietly
 * invent a different shape.
 */

export type Platform = 'douyin' | 'xiaohongshu' | 'wechat' | 'bilibili' | 'youtube';

export type ContentType =
  | 'paper_walkthrough'
  | 'short_lecture'
  | 'question_video'
  | 'text_guide'
  | 'exam_info';

export type Format = 'video' | 'print';

export type MetricKey =
  | 'followers'
  | 'following'
  | 'posts'
  | 'views'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saves'
  | 'watch_hours'
  | 'avg_view_seconds'
  | 'completion_rate';

export const METRIC_KEYS: readonly MetricKey[] = [
  'followers',
  'following',
  'posts',
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'watch_hours',
  'avg_view_seconds',
  'completion_rate',
];

export type MetricScope = 'lifetime' | 'current' | 'window';
export type MetricAvailability = 'value' | 'pending' | 'unsupported';

export interface Metric {
  key: MetricKey;
  /** Lifetime running total, a current snapshot, or a recent reporting window. */
  scope: MetricScope;
  availability: MetricAvailability;
  value: number | null;
  /** Human-readable reporting period such as "last 7 days" or "lifetime". */
  period: string;
  /** Where the number came from, e.g. "creator console" or "YouTube Analytics". */
  source: string;
  reason: string | null;
  measuredAt: string | null;
}

export type AccountStatus =
  | 'connected'
  | 'login_required'
  | 'setup_required'
  | 'error'
  | 'pending';

export type AnalyticsStatus =
  | 'ready'
  | 'no_data'
  | 'access_pending'
  | 'login_required'
  | 'setup_required'
  | 'unknown';

export type ContentStatus = 'ready' | 'empty' | 'partial' | 'unavailable';

export interface Account {
  id: string;
  platform: Platform;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  studioUrl: string | null;
  status: AccountStatus;
  statusDetail: string;
  analyticsStatus: AnalyticsStatus;
  analyticsDetail: string;
  contentStatus: ContentStatus;
  contentDetail: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  stale: boolean;
  capturedAt: string | null;
  isDemo: boolean;
  metrics: Metric[];
  createdAt: string;
  updatedAt: string;
}

export type PostStatus = 'published' | 'scheduled';
export type PostFormat = 'video' | 'text' | 'article' | 'livestream' | string | null;

export interface Post {
  id: string;
  accountId: string;
  platform: Platform;
  remoteId: string;
  title: string;
  url: string;
  format: PostFormat;
  status: PostStatus;
  publishedAt: string | null;
  scheduledAt: string | null;
  metrics: Partial<Record<MetricKey, number | null>>;
  collectedAt: string;
}

export interface HistoryPoint {
  accountId: string;
  day: string;
  followers: number | null;
  posts: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

export interface PlanTarget {
  platform: Platform;
  /** null means "every account on this platform", including accounts added later. */
  accountId: string | null;
}

export interface PublicationLink {
  accountId: string;
  platform: Platform;
  postId: string;
  title: string | null;
  publishedAt: string | null;
}

export interface Plan {
  id: string;
  title: string;
  notes: string;
  contentType: ContentType;
  format: Format;
  targets: PlanTarget[];
  tags: string[];
  scheduledFor: string | null;
  publications: PublicationLink[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanDraft {
  title: string;
  notes: string;
  contentType: ContentType;
  format: Format;
  targets: PlanTarget[];
  tags: string[];
  scheduledFor: string | null;
  publications: { accountId: string; postId: string }[];
}

export interface MergeMember {
  accountId: string;
  platform: Platform;
  postId: string;
  title: string | null;
  publishedAt: string | null;
  status: PostStatus;
}

export interface Merge {
  id: string;
  members: MergeMember[];
  titleFrom: { accountId: string; postId: string } | null;
  customTitle: string;
  createdAt: string;
  updatedAt: string;
}

export type DiscourseCountKey =
  | 'topics'
  | 'posts'
  | 'words'
  | 'formulas'
  | 'images'
  | 'graphs'
  | 'animations'
  | 'videos';

export type Counts = Partial<Record<DiscourseCountKey, number | null>>;

export interface WorkerHealth {
  unit: string;
  label: string;
  description: string;
  kind: 'service' | 'timer';
  state: string;
  health: string;
  lastRun: string | null;
  nextRun: string | null;
  statusText: string | null;
}

export interface CommunitySnapshot {
  capturedAt: string;
  sourceDate: string;
  status: 'connected' | 'error' | 'pending';
  reachable: boolean;
  authenticated: boolean;
  latencyMs: number | null;
  endpoint: string;
  error: string | null;
  catalogueStatus: string;
  catalogueComplete: boolean;
  catalogueStale: boolean;
  totals: Counts;
  last24Hours: Counts;
  last7Days: Counts;
  workers: WorkerHealth[];
  mentionJobs: { available: boolean; total: number | null; retryable: number | null; byStatus: Record<string, number> };
  drawings: { available: boolean; trackedPosts: number | null; publishedGraphs: number | null; publishedAnimations: number | null };
  pdfs: { available: boolean; trackedTopics: number | null; published: number | null; pending: number | null };
}

export interface CommunityHistoryPoint {
  day: string;
  topics: number | null;
  formulas: number | null;
  graphs: number | null;
  animations: number | null;
}

export interface CommunityState {
  configured: boolean;
  endpoint: string;
  snapshot: CommunitySnapshot | null;
  history: CommunityHistoryPoint[];
  stale: boolean;
}

export interface SyncState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  nextRunAt: string | null;
  error: string | null;
  lastResults: SyncResult[];
}

export interface SyncResult {
  accountId: string;
  platform: Platform;
  displayName: string;
  status: 'ok' | 'error';
  detail: string;
  at: string;
}

export interface Dashboard {
  generatedAt: string;
  today: string;
  timezone: 'Asia/Shanghai';
  scope: { kind: 'all' | 'platform' | 'account'; accountId: string | null; platform: Platform | null };
  accounts: Account[];
  history: HistoryPoint[];
  posts: Post[];
  plans: Plan[];
  merges: Merge[];
  community: CommunityState;
  sync: SyncState;
  totals: {
    audience: number;
    audienceAccounts: number;
    followers7dGain: number | null;
    publishedPosts: number;
    upcoming: number;
    latestMeasurementAt: string | null;
  };
  platformBreakdown: {
    platform: Platform;
    accounts: number;
    followers: number;
    posts: number;
    views: number | null;
    likes: number | null;
  }[];
}

export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  dataDir: string;
  communityEndpoint: string;
  communityEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  /** Multiplier applied to every text size, including the settings preview. */
  fontScale: number;
  demoMode: boolean;
  accountOrder: string[];
  mediaInbox: string | null;
  mediaOutput: string | null;
  mediaArchive: string | null;
  externalWorkerUrl: string | null;
  firstRunCompleted: boolean;
}

export interface Capabilities {
  readMetrics: boolean;
  readContent: boolean;
  readScheduled: boolean;
  write: boolean;
}

export interface PlatformInfo {
  key: Platform;
  label: string;
  shortLabel: string;
  region: 'china' | 'international';
  color: string;
  tint: string;
  access: string;
  capabilities: Capabilities;
  unsupportedMetrics: readonly MetricKey[];
  defaultPostFormat: 'video' | 'print';
}

export interface DownloadTarget {
  name: string;
  href: string;
}

export interface MigrationCounts {
  accounts: number;
  history: number;
  content: number;
  scheduled: number;
  plans: number;
  merges: number;
  todos: number;
  tags: number;
  communityDays: number;
  mediaJobs: number;
}

export interface MigrationPreview {
  sourcePath: string;
  valid: boolean;
  error: string | null;
  tables: string[];
  missingTables: string[];
  counts: MigrationCounts;
  destinationReady: boolean;
  destinationAccounts: number;
  warnings: string[];
}

export interface MigrationResult extends MigrationPreview {
  imported: MigrationCounts;
  skipped: {
    plans: number;
    merges: number;
    content: number;
    publications: number;
  };
  backupPath: string;
}
