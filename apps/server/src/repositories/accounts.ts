import { randomUUID } from 'node:crypto';
import type {
  Account,
  AccountStatus,
  AnalyticsStatus,
  ContentStatus,
  HistoryPoint,
  Metric,
  MetricAvailability,
  MetricKey,
  MetricScope,
  Platform,
} from '@creator-center/shared';
import { PLATFORM_ORDER, isoNow } from '@creator-center/shared';
import type { DB } from '../db.js';
import { PLATFORM_LINKS, profileUrlFor } from '../platforms.js';

interface AccountRow {
  id: string;
  platform: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  studio_url: string | null;
  status: string;
  status_detail: string;
  analytics_status: string;
  analytics_detail: string;
  content_status: string;
  content_detail: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  stale: number;
  captured_at: string | null;
  is_demo: number;
  position: number;
  created_at: string;
  updated_at: string;
}

interface MetricRow {
  account_id: string;
  key: string;
  scope: string;
  availability: string;
  value: number | null;
  period: string;
  source: string;
  reason: string | null;
  measured_at: string | null;
}

export interface AccountInput {
  id?: string;
  platform: Platform;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  studioUrl?: string | null;
  status?: AccountStatus;
  statusDetail?: string;
  analyticsStatus?: AnalyticsStatus;
  analyticsDetail?: string;
  contentStatus?: ContentStatus;
  contentDetail?: string;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  stale?: boolean;
  capturedAt?: string | null;
  isDemo?: boolean;
}

export interface AccountUpdate {
  displayName?: string;
  handle?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  studioUrl?: string | null;
  position?: number;
}

export interface MetricInput {
  key: MetricKey;
  scope: MetricScope;
  availability: MetricAvailability;
  value: number | null;
  period: string;
  source: string;
  reason: string | null;
  measuredAt: string | null;
}

export function listAccounts(db: DB): Account[] {
  const rows = db
    .prepare('SELECT * FROM accounts ORDER BY platform, position, created_at')
    .all() as AccountRow[];
  const metricRows = db.prepare('SELECT * FROM account_metrics').all() as MetricRow[];
  const metricsByAccount = new Map<string, Metric[]>();
  for (const row of metricRows) {
    const list = metricsByAccount.get(row.account_id) ?? [];
    list.push(mapMetric(row));
    metricsByAccount.set(row.account_id, list);
  }
  const order = new Map(PLATFORM_ORDER.map((platform, index) => [platform, index]));
  rows.sort(
    (left, right) =>
      (order.get(left.platform as Platform) ?? 99) - (order.get(right.platform as Platform) ?? 99) ||
      left.position - right.position,
  );
  return rows.map((row) => mapAccount(row, metricsByAccount.get(row.id) ?? []));
}

export function getAccount(db: DB, id: string): Account | null {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
  if (!row) return null;
  const metrics = (
    db.prepare('SELECT * FROM account_metrics WHERE account_id = ?').all(id) as MetricRow[]
  ).map(mapMetric);
  return mapAccount(row, metrics);
}

export function createAccount(db: DB, input: AccountInput): Account {
  const id = input.id ?? randomUUID();
  const now = isoNow();
  const position = (
    db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM accounts').get() as { next: number }
  ).next;
  const handle = input.handle?.trim() || null;
  const studioUrl = input.studioUrl?.trim() || PLATFORM_LINKS[input.platform].studioUrl;
  const profileUrl = input.profileUrl?.trim() || profileUrlFor(input.platform, handle);
  db.prepare(
    `INSERT INTO accounts (
      id, platform, display_name, handle, avatar_url, profile_url, studio_url,
      status, status_detail, analytics_status, analytics_detail, content_status, content_detail,
      last_attempt_at, last_success_at, stale, captured_at, is_demo, position, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.platform,
    input.displayName.trim(),
    handle,
    input.avatarUrl?.trim() || null,
    profileUrl,
    studioUrl,
    input.status ?? 'setup_required',
    input.statusDetail ?? 'Connect a signed-in platform session to start collecting.',
    input.analyticsStatus ?? 'setup_required',
    input.analyticsDetail ?? 'Analytics will appear after the first successful collection.',
    input.contentStatus ?? 'unavailable',
    input.contentDetail ?? 'No content collected yet.',
    input.lastAttemptAt ?? null,
    input.lastSuccessAt ?? null,
    input.stale ? 1 : 0,
    input.capturedAt ?? null,
    input.isDemo ? 1 : 0,
    position,
    now,
    now,
  );
  return getAccount(db, id) as Account;
}

export function updateAccount(db: DB, id: string, patch: AccountUpdate): Account | null {
  const existing = getAccount(db, id);
  if (!existing) return null;
  const displayName =
    patch.displayName !== undefined && patch.displayName.trim()
      ? patch.displayName.trim()
      : existing.displayName;
  const handle = patch.handle !== undefined ? patch.handle?.trim() || null : existing.handle;
  const profileUrl =
    patch.profileUrl !== undefined
      ? patch.profileUrl?.trim() || null
      : existing.profileUrl ?? profileUrlFor(existing.platform, handle);
  db.prepare(
    `UPDATE accounts SET display_name = ?, handle = ?, avatar_url = ?, profile_url = ?, studio_url = ?, position = ?, updated_at = ? WHERE id = ?`,
  ).run(
    displayName,
    handle,
    patch.avatarUrl !== undefined ? patch.avatarUrl?.trim() || null : existing.avatarUrl,
    profileUrl,
    patch.studioUrl !== undefined ? patch.studioUrl?.trim() || null : existing.studioUrl,
    patch.position !== undefined ? patch.position : (db.prepare('SELECT position FROM accounts WHERE id = ?').get(id) as { position: number }).position,
    isoNow(),
    id,
  );
  return getAccount(db, id);
}

export function deleteAccount(db: DB, id: string): boolean {
  const run = db.transaction(() => {
    // These tables predate a foreign key to accounts; remove the account's
    // references rather than leaving orphaned links and plan targets.
    db.prepare('DELETE FROM publications WHERE account_id = ?').run(id);
    db.prepare('DELETE FROM plan_targets WHERE account_id = ?').run(id);
    return db.prepare('DELETE FROM accounts WHERE id = ?').run(id).changes > 0;
  });
  return run();
}

export function updateAccountState(
  db: DB,
  id: string,
  state: Partial<Pick<Account,
    | 'status'
    | 'statusDetail'
    | 'analyticsStatus'
    | 'analyticsDetail'
    | 'contentStatus'
    | 'contentDetail'
    | 'lastAttemptAt'
    | 'lastSuccessAt'
    | 'stale'
    | 'capturedAt'
  >>,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  const mapping: Record<string, string> = {
    status: 'status',
    statusDetail: 'status_detail',
    analyticsStatus: 'analytics_status',
    analyticsDetail: 'analytics_detail',
    contentStatus: 'content_status',
    contentDetail: 'content_detail',
    lastAttemptAt: 'last_attempt_at',
    lastSuccessAt: 'last_success_at',
    stale: 'stale',
    capturedAt: 'captured_at',
  };
  for (const [key, value] of Object.entries(state)) {
    const column = mapping[key];
    if (!column) continue;
    fields.push(`${column} = ?`);
    values.push(key === 'stale' ? (value ? 1 : 0) : value);
  }
  if (!fields.length) return;
  fields.push('updated_at = ?');
  values.push(isoNow(), id);
  db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function replaceMetrics(db: DB, accountId: string, metrics: readonly MetricInput[]): void {
  const remove = db.prepare('DELETE FROM account_metrics WHERE account_id = ?');
  const insert = db.prepare(
    `INSERT INTO account_metrics(account_id, key, scope, availability, value, period, source, reason, measured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const run = db.transaction(() => {
    remove.run(accountId);
    for (const metric of metrics) {
      insert.run(
        accountId,
        metric.key,
        metric.scope,
        metric.availability,
        metric.value,
        metric.period,
        metric.source,
        metric.reason,
        metric.measuredAt,
      );
    }
  });
  run();
}

export function saveHistoryPoint(db: DB, point: HistoryPoint): void {
  db.prepare(
    `INSERT INTO account_history(account_id, day, followers, posts, views, likes, comments, shares, saves)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, day) DO UPDATE SET
       followers=excluded.followers, posts=excluded.posts, views=excluded.views,
       likes=excluded.likes, comments=excluded.comments, shares=excluded.shares, saves=excluded.saves`,
  ).run(
    point.accountId,
    point.day,
    point.followers,
    point.posts,
    point.views,
    point.likes,
    point.comments,
    point.shares,
    point.saves,
  );
}

export function listHistory(db: DB, accountIds?: readonly string[]): HistoryPoint[] {
  if (accountIds !== undefined && accountIds.length === 0) return [];
  const rows = accountIds?.length
    ? (db
        .prepare(
          `SELECT * FROM account_history WHERE account_id IN (${accountIds.map(() => '?').join(',')}) ORDER BY day`,
        )
        .all(...accountIds) as HistoryRow[])
    : (db.prepare('SELECT * FROM account_history ORDER BY day').all() as HistoryRow[]);
  return rows.map((row) => ({
    accountId: row.account_id,
    day: row.day,
    followers: row.followers,
    posts: row.posts,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
  }));
}

export function deleteHistoryBefore(db: DB, day: string): number {
  return db.prepare('DELETE FROM account_history WHERE day < ?').run(day).changes;
}

function mapAccount(row: AccountRow, metrics: Metric[]): Account {
  return {
    id: row.id,
    platform: row.platform as Platform,
    displayName: row.display_name,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    profileUrl: row.profile_url,
    studioUrl: row.studio_url,
    status: row.status as AccountStatus,
    statusDetail: row.status_detail,
    analyticsStatus: row.analytics_status as AnalyticsStatus,
    analyticsDetail: row.analytics_detail,
    contentStatus: row.content_status as ContentStatus,
    contentDetail: row.content_detail,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    stale: row.stale === 1,
    capturedAt: row.captured_at,
    isDemo: row.is_demo === 1,
    metrics,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMetric(row: MetricRow): Metric {
  return {
    key: row.key as MetricKey,
    scope: row.scope as MetricScope,
    availability: row.availability as MetricAvailability,
    value: row.value,
    period: row.period,
    source: row.source,
    reason: row.reason,
    measuredAt: row.measured_at,
  };
}

interface HistoryRow {
  account_id: string;
  day: string;
  followers: number | null;
  posts: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}
