import type {
  Account,
  BrowserCapture,
  HistoryPoint,
  MetricAvailability,
  MetricKey,
  MetricScope,
} from '@creator-center/shared';
import { PLATFORMS, addDays, shanghaiDay } from '@creator-center/shared';
import type { AdapterSnapshot } from '../adapters/types.js';
import type { MetricInput } from '../repositories/accounts.js';
import type { PostInput } from '../repositories/posts.js';

export interface ParsedXhsPage {
  posts: PostInput[];
  terminal: boolean;
  uncertain: boolean;
  explicitEmpty: boolean;
  rowCount: number;
}

const METRIC_KEYS: readonly MetricKey[] = [
  'followers', 'following', 'posts', 'views', 'likes', 'comments', 'shares', 'saves',
  'watch_hours', 'avg_view_seconds', 'completion_rate',
];
const POST_TOTAL_KEYS: readonly MetricKey[] = ['views', 'likes', 'comments', 'shares', 'saves'];
const UNSUPPORTED: readonly MetricKey[] = PLATFORMS.xiaohongshu.unsupportedMetrics;
const CONTENT_WINDOW_DAYS = 60;
const HOME = 'https://creator.xiaohongshu.com/creator/home';
const MANAGER = 'https://creator.xiaohongshu.com/new/note-manager';
const PROFILE_SOURCE = 'https://creator.xiaohongshu.com/api/galaxy/creator/home/personal_info';
const OVERVIEW_SOURCE = 'https://creator.xiaohongshu.com/api/galaxy/v2/creator/datacenter/account/base';
const POSTS_SOURCE = 'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted';

const PROFILE = /\/api\/galaxy\/creator\/home\/personal_info/;
const OVERVIEW = /\/api\/galaxy\/v2\/creator\/datacenter\/account\/base/;
const POSTS = /\/api\/galaxy\/v2\/creator\/note\/user\/posted/;

interface MetricDraft {
  value: number;
  scope: MetricScope;
  period: string;
  source: string;
  reason: string | null;
}

export class XiaohongshuLoginRequiredError extends Error {
  constructor(message = 'Sign in to 小红书 in the embedded window, then sync again.') {
    super(message);
    this.name = 'XiaohongshuLoginRequiredError';
  }
}

export function parseXiaohongshuCapture(capture: BrowserCapture, account: Account): AdapterSnapshot {
  if (capture.loginRequired) throw new XiaohongshuLoginRequiredError();
  const capturedAt = isoOrNow(capture.capturedAt);
  const profile = unwrapXhs(findResponse(capture, PROFILE));
  if (!profile) throw new XiaohongshuLoginRequiredError();

  const drafts = new Map<MetricKey, MetricDraft>();
  const set = (key: MetricKey, value: unknown, scope: MetricScope, period: string, source: string, reason: string | null = null) => {
    const number = numberValue(value);
    if (number === null) return;
    drafts.set(key, { value: number, scope, period, source: sourceUrl(source), reason });
  };

  const handle = stringValue(profile.red_num) || stringValue(profile.name) || null;
  set('followers', profile.fans_count, 'current', 'Current account total', PROFILE_SOURCE);
  set('following', profile.follow_count, 'current', 'Current account total', PROFILE_SOURCE);

  const contentPages = findResponses(capture, POSTS).map((body) => parseXhsPage(body, account.id, capturedAt));
  const firstPage = contentPages[0] ?? null;
  const managerTotal = labelNumber(capture.texts.manager ?? '', '全部');
  let postCount = managerTotal;
  if (postCount === null && firstPage?.explicitEmpty) postCount = 0;
  if (postCount !== null) {
    set('posts', postCount, 'current', 'Current creator note count', POSTS_SOURCE,
      'All notes in the creator manager, including any review states.');
  }

  const allPosts = [...new Map(contentPages.flatMap((page) => page.posts).map((post) => [post.remoteId, post])).values()];
  const uncertain = contentPages.some((page) => page.uncertain);
  const complete = contentPages.length > 0 && contentPages.every((page) => page.terminal);
  const trusted = contentPages.length > 0 && complete && !uncertain;
  applyPostTotals(drafts, allPosts, trusted);

  const analytics = readAnalytics(capture);
  if (analytics.populated) {
    for (const key of ['views', 'likes', 'comments', 'shares', 'saves'] as const) {
      set(key, analytics.values[key], 'window', analytics.period, OVERVIEW_SOURCE,
        'Seven-day note analytics; profile likes-and-saves are combined upstream.');
    }
    if (analytics.completion !== null) {
      set('completion_rate', analytics.completion, 'window', analytics.period, OVERVIEW_SOURCE,
        'Video completion percentage as displayed by 小红书.');
    }
  }

  const scheduled = parseXhsScheduled(scheduleBodies(capture), account.id, capturedAt);
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

  const published = contentWindow(allPosts, capturedAt);
  const contentStatus = contentPages.length === 0
    ? 'unavailable'
    : uncertain || !complete
      ? 'partial'
      : contentPages.every((page) => page.explicitEmpty)
        ? 'empty'
        : 'ready';
  const contentDetail = contentStatus === 'unavailable'
    ? 'Published content could not be verified in the creator manager.'
    : `${contentStatus === 'partial' ? 'Collection did not reach every terminal page; coverage is incomplete. ' : ''}` +
      'Published creator notes; last 60 days and today (Shanghai).';

  return {
    success: true,
    capturedAt,
    status: 'connected',
    statusDetail: 'Connected to the signed-in 小红书 creator account.',
    analyticsStatus: analytics.status,
    analyticsDetail: analytics.detail,
    contentStatus,
    contentDetail,
    metrics,
    history,
    posts: published,
    scheduled: scheduled.posts,
    scheduledAuthoritative: scheduled.read,
    handle,
  };
}

export function parseXhsPage(value: unknown, accountId: string, capturedAt: string): ParsedXhsPage {
  const empty: ParsedXhsPage = {
    posts: [], terminal: false, uncertain: false, explicitEmpty: false, rowCount: 0,
  };
  const data = unwrapXhs(value);
  if (!isRecord(data) || !Array.isArray(data.notes) || typeof data.page !== 'number') return empty;
  const rows = data.notes;
  const terminal = data.page === -1;
  const posts: PostInput[] = [];
  let uncertain = false;

  for (const row of rows) {
    if (!isRecord(row)) {
      uncertain = true;
      continue;
    }
    if (row.tab_status !== 1) {
      if (![2, 3, 4].includes(Number(row.tab_status))) uncertain = true;
      continue;
    }
    if (row.schedule_post_time !== null && row.schedule_post_time !== undefined && row.schedule_post_time !== 0) continue;
    const identifier = stringValue(row.id);
    if (!/^[0-9a-fA-F]{24}$/.test(identifier)) {
      uncertain = true;
      continue;
    }
    const title = typeof row.display_title === 'string' ? row.display_title : '';
    const metrics: Partial<Record<MetricKey, number | null>> = {
      views: numberValue(row.view_count),
      likes: numberValue(row.likes),
      comments: numberValue(row.comments_count),
      shares: numberValue(row.shared_count),
      saves: numberValue(row.collected_count),
    };
    const post = makePost({
      accountId,
      identifier,
      capturedAt,
      title,
      url: `https://www.xiaohongshu.com/explore/${identifier}`,
      publishedAt: publicationTime(row.time),
      scheduledAt: null,
      metrics,
      status: 'published',
      format: row.type === 'video' ? 'video' : 'text',
    });
    if (post === null) {
      uncertain = true;
      continue;
    }
    posts.push(post);
    if (post.publishedAt === null) uncertain = true;
  }

  return {
    posts,
    terminal,
    uncertain,
    explicitEmpty: !uncertain && rows.length === 0 && terminal,
    rowCount: rows.length,
  };
}

function parseXhsScheduled(
  values: readonly unknown[],
  accountId: string,
  capturedAt: string,
): { posts: PostInput[]; read: boolean } {
  const now = new Date(capturedAt);
  const seen = new Map<string, PostInput>();
  let read = false;
  for (const value of values) {
    const data = unwrapXhs(value);
    if (!isRecord(data) || !Array.isArray(data.notes)) continue;
    read = true;
    for (const row of data.notes) {
      if (!isRecord(row) || [2, 3].includes(Number(row.tab_status))) continue;
      const when = publicationTime(row.schedule_post_time);
      if (!when || new Date(when).getTime() <= now.getTime()) continue;
      const identifier = stringValue(row.id);
      if (!/^[0-9a-fA-F]{24}$/.test(identifier)) continue;
      const post = makePost({
        accountId,
        identifier,
        capturedAt,
        title: typeof row.display_title === 'string' ? row.display_title : '',
        url: MANAGER,
        publishedAt: null,
        scheduledAt: when,
        metrics: {},
        status: 'scheduled',
        format: row.type === 'video' ? 'video' : 'text',
      });
      if (post) seen.set(post.remoteId, post);
    }
  }
  return {
    posts: [...seen.values()].sort((left, right) => (left.scheduledAt ?? '').localeCompare(right.scheduledAt ?? '')),
    read,
  };
}

function readAnalytics(capture: BrowserCapture): {
  populated: boolean;
  status: AdapterSnapshot['analyticsStatus'];
  detail: string;
  period: string;
  values: Partial<Record<'views' | 'likes' | 'comments' | 'shares' | 'saves', number | null>>;
  completion: number | null;
} {
  const data = unwrapXhs(findResponse(capture, OVERVIEW));
  const seven = data && isRecord(data.seven) ? data.seven : null;
  if (!seven) {
    return {
      populated: false,
      status: data ? 'no_data' : 'unknown',
      detail: 'The creator account is connected, but its seven-day analytics have not been supplied.',
      period: 'Last 7 days (source date bounds unavailable)',
      values: {},
      completion: null,
    };
  }
  const start = epochDate(seven.begin_time);
  const end = epochDate(seven.end_time);
  const period = start && end ? `${start} to ${end} (7 days)` : 'Last 7 days (source date bounds unavailable)';
  const values = {
    views: numberValue(seven.view_count),
    likes: numberValue(seven.like_count),
    comments: numberValue(seven.comment_count),
    shares: numberValue(seven.share_count),
    saves: numberValue(seven.collect_count),
  };
  const populated = Object.values(values).some((value) => value !== null);
  const rate = /(?:^|\n)视频完播率\s+(\d+(?:\.\d+)?)%/.exec(capture.texts.home ?? '');
  const completion = values.views !== null && values.views > 0 && rate ? numberValue(rate[1]) : null;
  return {
    populated,
    status: populated ? 'ready' : 'unknown',
    detail: 'The creator dashboard provides seven-day note analytics. Profile likes-and-saves are combined upstream and are not used as separate totals.',
    period,
    values,
    completion,
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
      source: sourceUrl(account.studioUrl ?? HOME),
      reason: unsupported
        ? '小红书 does not report this metric.'
        : 'The signed-in creator console did not return this metric.',
      measuredAt: capturedAt,
    };
  });
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
      period: 'Lifetime, every published note added up',
      source: sourceUrl(POSTS_SOURCE),
      reason: 'Added up from the notes in the creator manager.',
    });
  }
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
  title: string;
  url: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  metrics: Partial<Record<MetricKey, number | null>>;
  status: 'published' | 'scheduled';
  format: 'text' | 'video';
}): PostInput | null {
  if (!input.identifier) return null;
  const metrics: Partial<Record<MetricKey, number | null>> = {};
  for (const [key, value] of Object.entries(input.metrics)) {
    if (METRIC_KEYS.includes(key as MetricKey)) metrics[key as MetricKey] = value;
  }
  return {
    accountId: input.accountId,
    platform: 'xiaohongshu',
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

function scheduleBodies(capture: BrowserCapture): unknown[] {
  return capture.responses
    .filter((entry) => POSTS.test(entry.url) && tabOf(entry.url) === '0')
    .map((entry) => entry.body);
}

function tabOf(url: string): string | null {
  try {
    return new URL(url).searchParams.get('tab');
  } catch {
    return null;
  }
}

function findResponse(capture: BrowserCapture, path: RegExp): unknown {
  for (let index = capture.responses.length - 1; index >= 0; index -= 1) {
    const entry = capture.responses[index];
    if (entry && path.test(entry.url)) return entry.body;
  }
  return undefined;
}

function findResponses(capture: BrowserCapture, path: RegExp): unknown[] {
  return capture.responses.filter((entry) => path.test(entry.url)).map((entry) => entry.body);
}

function unwrapXhs(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (Number(value.code) !== 0 && value.success !== true) return null;
  return isRecord(value.data) ? value.data : null;
}

function sourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function epochDate(value: unknown): string | null {
  const number = numberValue(value);
  if (number === null) return null;
  const date = new Date(number);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
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

function labelNumber(text: string, label: string): number | null {
  const match = new RegExp(`(?:^|\\n)${escapeRegExp(label)}[ \\t\\n]+(\\d[\\d,]*(?:\\.\\d+)?)(?=\\s|$)`).exec(text);
  return match ? numberValue(match[1]) : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
