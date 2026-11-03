import type {
  Account,
  DouyinCapture,
  HistoryPoint,
  MetricAvailability,
  MetricKey,
  MetricScope,
} from '@creator-center/shared';
import { addDays, shanghaiDay } from '@creator-center/shared';
import type { AdapterSnapshot } from '../adapters/types.js';
import type { MetricInput } from '../repositories/accounts.js';
import type { PostInput } from '../repositories/posts.js';

export type { DouyinCapture } from '@creator-center/shared';

export interface ParsedPublishedPage {
  posts: PostInput[];
  terminal: boolean;
  uncertain: boolean;
  explicitEmpty: boolean;
  rowCount: number;
  total: number | null;
}

const METRIC_KEYS: readonly MetricKey[] = [
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

const POST_TOTAL_KEYS: readonly MetricKey[] = ['views', 'likes', 'comments', 'shares', 'saves'];
const UNSUPPORTED: readonly MetricKey[] = ['watch_hours'];
const CONTENT_WINDOW_DAYS = 60;
const STUDIO_URL = 'https://creator.douyin.com/creator-micro/home';
const USER_SOURCE = 'https://creator.douyin.com/aweme/v1/creator/user/info/';
const POSTS_SOURCE = 'https://creator.douyin.com/janus/douyin/creator/pc/work_list';
const OVERVIEW_SOURCE = 'https://creator.douyin.com/janus/douyin/creator/data/overview/dashboard';

interface MetricDraft {
  value: number;
  scope: MetricScope;
  period: string;
  source: string;
  reason: string | null;
}

export class DouyinLoginRequiredError extends Error {
  constructor(message = 'Sign in to the 抖音 creator console, then sync again.') {
    super(message);
    this.name = 'DouyinLoginRequiredError';
  }
}

export function parseDouyinCapture(capture: DouyinCapture, account: Account): AdapterSnapshot {
  if (capture.loginRequired) throw new DouyinLoginRequiredError();
  const capturedAt = isoOrNow(capture.capturedAt);
  const body = readBody(capture.profile);
  const profile = body && isRecord(body.user_profile) ? body.user_profile : null;
  if (!body || !profile) {
    throw new Error('The 抖音 creator dashboard did not return verified account data. Sign in again and retry.');
  }

  const drafts = new Map<MetricKey, MetricDraft>();
  const set = (key: MetricKey, value: unknown, scope: MetricScope, period: string, source: string, reason: string | null = null) => {
    const number = numberValue(value);
    if (number === null) return;
    drafts.set(key, { value: number, scope, period, source: sourceUrl(source), reason });
  };

  const handle = stringValue(profile.unique_id) || stringValue(profile.nick_name) || null;
  set('followers', profile.follower_count, 'current', 'Current account total', USER_SOURCE);
  set('following', profile.following_count, 'current', 'Current account total', USER_SOURCE);
  set('likes', profile.total_favorited, 'lifetime', 'Lifetime received likes', USER_SOURCE);

  const pages: ParsedPublishedPage[] = capture.postsPages.map((page: unknown) =>
    parsePublishedPage(page, account.id, capturedAt),
  );
  const firstPage = pages[0] ?? null;
  const total = firstPage?.total ?? null;

  const allPosts = [...new Map(pages.flatMap((page) => page.posts).map((post) => [post.remoteId, post])).values()];
  const profilePosts = numberValue(profile.aweme_count);
  const postCount = profilePosts ?? total ?? (pages.length > 0 && pages.every((page) => page.terminal) ? allPosts.length : null);
  if (postCount !== null) {
    set('posts', postCount, 'current', 'Current creator content count', POSTS_SOURCE,
      'All content returned by the creator manager, including any review states.');
  }
  const uncertain = pages.some((page) => page.uncertain);
  const complete = pages.length > 0 && pages.every((page) => page.terminal);
  const published = contentWindow(allPosts, capturedAt);
  const trusted = pages.length > 0 && complete && !uncertain;
  applyPostTotals(drafts, allPosts, trusted);

  const analytics = body.has_data_mgmt_perm === true
    ? readAnalytics(capture.overview, capture.analyticsText)
    : {
        populated: false,
        status: 'setup_required' as const,
        detail: '抖音 has not granted analytics access to this account. Enable it in the creator center if desired.',
        views: null,
        completionRate: null,
        period: 'Unknown',
        reason: 'Analytics access has not been granted.',
      };
  if (analytics.populated) {
    const lifetimeViews = drafts.get('views')?.scope === 'lifetime';
    if (!lifetimeViews) {
      set('views', analytics.views, 'window', analytics.period, OVERVIEW_SOURCE, analytics.reason);
    }
    set('completion_rate', analytics.completionRate, 'window', analytics.period, OVERVIEW_SOURCE,
      'Percentage as displayed by 抖音 for its overview window.');
  }

  const scheduled = parseScheduledPosts(capture.schedulePages, account.id, capturedAt);
  const metrics = buildMetrics(drafts, account, capturedAt);
  const followers = drafts.get('followers')?.value ?? null;
  const history: HistoryPoint | null = followers === null
    ? null
    : {
        accountId: account.id,
        day: shanghaiDay(capturedAt) ?? capturedAt.slice(0, 10),
        followers,
        posts: drafts.get('posts')?.value ?? null,
        views: drafts.get('views')?.value ?? null,
        likes: drafts.get('likes')?.value ?? null,
        comments: drafts.get('comments')?.value ?? null,
        shares: drafts.get('shares')?.value ?? null,
        saves: drafts.get('saves')?.value ?? null,
      };

  const contentStatus = pages.length === 0
    ? 'unavailable'
    : uncertain || !complete
      ? 'partial'
      : pages.every((page) => page.explicitEmpty)
        ? 'empty'
        : 'ready';
  const contentDetail = contentStatus === 'unavailable'
    ? 'Published content could not be verified in the creator manager.'
    : `${contentStatus === 'partial' ? 'Collection did not reach every terminal page; coverage is incomplete. ' : ''}` +
      'Published creator posts; last 60 days and today (Shanghai).';

  return {
    success: true,
    capturedAt,
    status: 'connected',
    statusDetail: 'Connected to the signed-in creator account.',
    analyticsStatus: analytics.status,
    analyticsDetail: analytics.detail,
    contentStatus,
    contentDetail,
    metrics,
    history,
    posts: published,
    scheduled,
    scheduledAuthoritative: capture.scheduleRead,
    handle,
  };
}

function readBody(value: unknown): Record<string, unknown> | null {
  return isRecord(value) && value.status_code === 0 ? value : null;
}

export function parsePublishedPage(value: unknown, accountId: string, capturedAt: string): ParsedPublishedPage {
  const empty: ParsedPublishedPage = {
    posts: [], terminal: false, uncertain: false, explicitEmpty: false, rowCount: 0, total: null,
  };
  if (!isRecord(value) || value.status_code !== 0 || typeof value.has_more !== 'boolean') return empty;
  const rows = value.aweme_list;
  if (!Array.isArray(rows)) return empty;
  const total = numberValue(value.total);
  const terminal = value.has_more === false;
  const posts: PostInput[] = [];
  let uncertain = false;
  for (const row of rows) {
    if (!isRecord(row)) {
      uncertain = true;
      continue;
    }
    const state = row.status_value;
    if (state !== 102 && state !== 140 && state !== 143) {
      if (state !== 22 && state !== 23 && state !== 141 && state !== 144) uncertain = true;
      continue;
    }
    if (isRecord(row.timer) && row.timer.status === 0) continue;
    if (state === 143 && isRecord(row.review_struct) && row.review_struct.status === 6) continue;
    const identifier = row.aweme_id;
    if (!/^\d+$/.test(String(identifier ?? ''))) {
      uncertain = true;
      continue;
    }
    const item = Array.isArray(value.items)
      ? value.items.find((entry) => isRecord(entry) && entry.id !== undefined &&
          [String(row.aweme_id), String(row.item_id)].includes(String(entry.id)))
      : undefined;
    const observed = isRecord(item) && isRecord(item.metrics) ? item.metrics : {};
    const statistics = isRecord(row.statistics) ? row.statistics : {};
    const statis = isRecord(row.statis) ? row.statis : {};
    const metrics: Partial<Record<MetricKey, number | null>> = {};
    const mapping: [MetricKey, string, string, string][] = [
      ['views', 'view_count', 'play_vv', 'play_count'],
      ['likes', 'like_count', 'digg_vv', 'digg_count'],
      ['comments', 'comment_count', 'comment_vv', 'comment_count'],
      ['shares', 'share_count', 'share_vv', 'share_count'],
      ['saves', 'favorite_count', 'collect_vv', 'collect_count'],
    ];
    for (const [key, field, legacy, fallback] of mapping) {
      const candidate = firstNumber(observed[field], statis[legacy], statistics[fallback]);
      if (candidate !== null) metrics[key] = candidate;
    }
    const post = makePost({
      accountId,
      identifier: String(identifier),
      capturedAt,
      title: row.desc,
      url: `https://www.douyin.com/video/${String(identifier)}`,
      publishedAt: publicationTime(row.create_time),
      metrics,
      status: 'published',
      scheduledAt: null,
      format: 'video',
    });
    if (!post) {
      uncertain = true;
      continue;
    }
    posts.push(post);
    if (!post.publishedAt) uncertain = true;
  }
  const rowCount = rows.length;
  const explicitEmpty = !uncertain && rowCount === 0 && terminal && total === 0;
  return {
    posts,
    terminal,
    uncertain: uncertain || (!rows.length && total !== null && total > 0),
    explicitEmpty,
    rowCount,
    total,
  };
}

export function parseScheduledPosts(values: readonly unknown[], accountId: string, capturedAt: string): PostInput[] {
  const now = new Date(capturedAt);
  const seen = new Map<string, PostInput>();
  let read = false;
  for (const value of values) {
    if (!isRecord(value) || value.status_code !== 0 || !Array.isArray(value.aweme_list)) continue;
    read = true;
    for (const row of value.aweme_list) {
      if (!isRecord(row)) continue;
      const timer = row.timer;
      if (!isRecord(timer) || timer.status !== 0) continue;
      if ([22, 23, 141, 144].includes(Number(row.status_value))) continue;
      const when = publicationTime(timer.public_time);
      if (!when || new Date(when).getTime() <= now.getTime()) continue;
      const post = makePost({
        accountId,
        identifier: String(row.aweme_id ?? ''),
        capturedAt,
        title: row.desc,
        url: 'https://creator.douyin.com/creator-micro/content/manage',
        publishedAt: null,
        scheduledAt: when,
        metrics: {},
        status: 'scheduled',
        format: 'video',
      });
      if (post) seen.set(post.remoteId, post);
    }
  }
  return read
    ? [...seen.values()].sort((left, right) => (left.scheduledAt ?? '').localeCompare(right.scheduledAt ?? ''))
    : [];
}

function applyPostTotals(
  drafts: Map<MetricKey, MetricDraft>,
  posts: readonly PostInput[],
  trusted: boolean,
): void {
  if (!trusted) return;
  for (const key of POST_TOTAL_KEYS) {
    const values = posts.map((post) => post.metrics[key]);
    if (values.some((value) => value === null || value === undefined)) continue;
    let total = 0;
    let complete = true;
    for (const value of values) {
      if (typeof value !== 'number') {
        complete = false;
        break;
      }
      total += value;
    }
    if (!complete) continue;
    const current = drafts.get(key);
    if (current?.scope === 'lifetime') {
      if (total > current.value) {
        drafts.set(key, { ...current, value: total, period: 'Lifetime total, raised to the sum of its posts' });
      }
      continue;
    }
    drafts.set(key, {
      value: total,
      scope: 'lifetime',
      period: 'Lifetime, every published post added up',
      source: sourceUrl(POSTS_SOURCE),
      reason: 'Added up from the posts in the creator manager.',
    });
  }
}

function readAnalytics(value: unknown, text: string): {
  populated: boolean;
  status: AdapterSnapshot['analyticsStatus'];
  detail: string;
  views: number | null;
  completionRate: number | null;
  period: string;
  reason: string | null;
} {
  const record = isRecord(value) ? value : {};
  const metrics = Array.isArray(record.metrics) ? record.metrics : [];
  const periodMatch = /统计周期[：:]\s*(\d{4}-\d{2}-\d{2})\s*至\s*(\d{4}-\d{2}-\d{2})/.exec(text);
  const period = periodMatch
    ? `${periodMatch[1] ?? ''} to ${periodMatch[2] ?? ''}`
    : 'Selected overview window (source date bounds unavailable)';
  const overviewText = text.split('数据总览')[1] ?? text;
  const top = overviewText.split('我的指标')[0] ?? overviewText;
  const views = labelNumber(top, '播放量');
  const rateMatch = /(?:^|\n)完播率\s+(\d+(?:\.\d+)?)%/.exec(top);
  const completionRate = rateMatch ? numberValue(rateMatch[1]) : null;
  // The current console no longer requests the old overview JSON; its displayed
  // overview carries the same labelled values. Only trust it when a value parsed.
  const textOverview = /数据总览/.test(text) && /(播放量|完播率|统计周期)/.test(text);
  const jsonPopulated = record.status_code === 0 &&
    metrics.some((entry) => isRecord(entry) && Object.keys(entry).length > 0);
  const populated = jsonPopulated || (textOverview && (views !== null || completionRate !== null));
  if (populated) {
    return {
      populated: true,
      status: 'ready',
      detail: '抖音 overview metrics use the displayed date window; received likes are a separate lifetime account total.',
      views,
      completionRate,
      period,
      reason: null,
    };
  }
  const pending = text.includes('开通成功') || text.includes('数据将于');
  const update = /数据将于\s*(\d+)月(\d+)日.*?(\d+)点/.exec(text);
  const suffix = update
    ? ` The site expects its first update on ${update[1] ?? ''}/${update[2] ?? ''} at about ${update[3] ?? ''}:00 (China time).`
    : '';
  return {
    populated: false,
    status: record.status_code === 0 ? (pending ? 'access_pending' : 'no_data') : 'unknown',
    detail: 'Analytics access is enabled, but 抖音 has not produced the overview data yet.' + suffix,
    views: null,
    completionRate: null,
    period,
    reason: 'Analytics access is enabled; the source has not supplied this metric yet.',
  };
}

function buildMetrics(
  drafts: Map<MetricKey, MetricDraft>,
  account: Account,
  capturedAt: string,
): MetricInput[] {
  return METRIC_KEYS.map((key) => {
    const draft = drafts.get(key);
    if (draft) {
      return {
        key,
        scope: draft.scope,
        availability: 'value' as MetricAvailability,
        value: draft.value,
        period: draft.period,
        source: draft.source,
        reason: draft.reason,
        measuredAt: capturedAt,
      };
    }
    const unsupported = UNSUPPORTED.includes(key);
    return {
      key,
      scope: 'current',
      availability: unsupported ? 'unsupported' : 'pending',
      value: null,
      period: 'Unknown',
      source: sourceUrl(account.studioUrl ?? STUDIO_URL),
      reason: unsupported
        ? '抖音 does not report this metric.'
        : 'The signed-in creator console did not return this metric.',
      measuredAt: capturedAt,
    };
  });
}

function contentWindow(posts: readonly PostInput[], capturedAt: string): PostInput[] {
  const today = shanghaiDay(capturedAt) ?? capturedAt.slice(0, 10);
  const start = addDays(today, -CONTENT_WINDOW_DAYS);
  const seen = new Map<string, PostInput>();
  for (const post of posts) {
    const day = post.publishedAt?.slice(0, 10) ?? null;
    if (day === null) continue;
    if (day < start || day > today) continue;
    seen.set(post.remoteId, post);
  }
  return [...seen.values()].sort((left, right) => (right.publishedAt ?? '').localeCompare(left.publishedAt ?? ''));
}

function makePost(input: {
  accountId: string;
  identifier: string;
  capturedAt: string;
  title: unknown;
  url: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  metrics: Partial<Record<MetricKey, number | null>>;
  status: 'published' | 'scheduled';
  format: 'video';
}): PostInput | null {
  if (!input.identifier) return null;
  if (typeof input.title !== 'string') return null;
  const metrics: Partial<Record<MetricKey, number | null>> = {};
  for (const [key, value] of Object.entries(input.metrics)) {
    if (METRIC_KEYS.includes(key as MetricKey)) metrics[key as MetricKey] = value;
  }
  return {
    accountId: input.accountId,
    platform: 'douyin',
    remoteId: input.identifier,
    title: input.title,
    url: input.url,
    format: input.format,
    status: input.status,
    publishedAt: input.publishedAt,
    scheduledAt: input.scheduledAt,
    metrics,
    collectedAt: input.capturedAt,
  };
}

export function publicationTime(value: unknown): string | null {
  const numeric = numberValue(value);
  if (numeric !== null) {
    if (numeric === 0) return null;
    const millis = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : shanghaiIso(date);
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : shanghaiIso(parsed);
}

function shanghaiIso(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}+08:00`;
}

function isoOrNow(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function sourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function labelNumber(text: string, label: string): number | null {
  const match = new RegExp(`(?:^|\\n)${escapeRegExp(label)}[ \\t\\n]+(\\d[\\d,]*(?:\\.\\d+)?)(?=\\s|$)`).exec(text);
  return match ? numberValue(match[1]) : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = numberValue(value);
    if (number !== null) return number;
  }
  return null;
}

export function numberValue(value: unknown): number | null {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const cleaned = value.trim().replaceAll(',', '');
    if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
    value = cleaned;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

