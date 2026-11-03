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

export interface ParsedBilibiliPage {
  posts: PostInput[];
  terminal: boolean;
  uncertain: boolean;
  explicitEmpty: boolean;
  rowCount: number;
  total: number | null;
}

const METRIC_KEYS: readonly MetricKey[] = [
  'followers', 'following', 'posts', 'views', 'likes', 'comments', 'shares', 'saves',
  'watch_hours', 'avg_view_seconds', 'completion_rate',
];
const POST_TOTAL_KEYS: readonly MetricKey[] = ['views', 'likes', 'comments', 'shares', 'saves'];
const UNSUPPORTED: readonly MetricKey[] = PLATFORMS.bilibili.unsupportedMetrics;
const CONTENT_WINDOW_DAYS = 60;
const HOME = 'https://member.bilibili.com/platform/home';
const INDEX_SOURCE = 'https://member.bilibili.com/x/web/data/index/stat';
const FANS_SOURCE = 'https://member.bilibili.com/x/relation/followers';
const POSTS_SOURCE = 'https://member.bilibili.com/x/web/archives';
const OVERVIEW_SOURCE = 'https://member.bilibili.com/x/web/data/v2/overview/stat/num';
const MANAGER = 'https://member.bilibili.com/platform/upload-manager/article';

const USER = /\/x\/web-interface\/nav/;
const INDEX = /\/x\/web\/data\/index\/stat/;
const FANS = /\/x\/relation\/followers/;
const POSTS = /\/x\/web\/archives/;
const OVERVIEW = /\/x\/web\/data\/v2\/overview\/stat\/num/;

interface MetricDraft {
  value: number;
  scope: MetricScope;
  period: string;
  source: string;
  reason: string | null;
}

export class BilibiliLoginRequiredError extends Error {
  constructor(message = 'Sign in to Bilibili in the embedded window, then sync again.') {
    super(message);
    this.name = 'BilibiliLoginRequiredError';
  }
}

export function parseBilibiliCapture(capture: BrowserCapture, account: Account): AdapterSnapshot {
  if (capture.loginRequired) throw new BilibiliLoginRequiredError();
  const capturedAt = isoOrNow(capture.capturedAt);
  const user = unwrap(findResponse(capture, USER));
  if (!isRecord(user) || user.isLogin !== true) throw new BilibiliLoginRequiredError();

  const drafts = new Map<MetricKey, MetricDraft>();
  const set = (key: MetricKey, value: unknown, scope: MetricScope, period: string, source: string, reason: string | null = null) => {
    const number = numberValue(value);
    if (number === null) return;
    drafts.set(key, { value: number, scope, period, source: sourceUrl(source), reason });
  };

  const handle = stringValue(user.uname) || null;
  const index = unwrap(findResponse(capture, INDEX));
  if (index) {
    set('views', index.total_click, 'lifetime', 'Lifetime total', INDEX_SOURCE,
      'Running total shown on the creator home page.');
    set('likes', index.total_like, 'lifetime', 'Lifetime total', INDEX_SOURCE);
    set('comments', index.total_reply, 'lifetime', 'Lifetime total', INDEX_SOURCE);
    set('shares', index.total_share, 'lifetime', 'Lifetime total', INDEX_SOURCE);
    set('saves', index.total_fav, 'lifetime', 'Lifetime total', INDEX_SOURCE);
  }

  const fans = unwrap(findResponse(capture, FANS));
  if (fans) set('followers', fans.total, 'current', 'Current account total', FANS_SOURCE);

  const pages = findResponses(capture, POSTS).map((body) => parseBilibiliPage(body, account.id, capturedAt));
  const firstPageBody = unwrap(findResponse(capture, POSTS));
  const firstPage = pages[0] ?? null;
  const classCount = firstPageBody && isRecord(firstPageBody.class) ? numberValue(firstPageBody.class.pubed) : null;
  const postCount = classCount ?? firstPage?.total ?? null;
  if (postCount !== null) {
    set('posts', postCount, 'current', 'Current published video count', POSTS_SOURCE,
      'Video submissions only; articles are outside this count.');
  }

  const allPosts = [...new Map(pages.flatMap((page) => page.posts).map((post) => [post.remoteId, post])).values()];
  const uncertain = pages.some((page) => page.uncertain);
  const complete = pages.length > 0 && pages.every((page) => page.terminal);
  const trusted = pages.length > 0 && complete && !uncertain;
  applyPostTotals(drafts, allPosts, trusted);

  const analytics = readAnalytics(capture);
  if (analytics.populated) {
    const period = analytics.period;
    for (const key of ['views', 'likes', 'comments', 'shares', 'saves'] as const) {
      set(key, analytics.values[key], 'window', period, OVERVIEW_SOURCE,
        'Video analytics only; articles are outside this window.');
    }
  }

  const scheduled = parseBilibiliScheduled(findResponses(capture, POSTS), account.id, capturedAt);
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
      'Published Bilibili videos; last 60 days and today (Shanghai).';

  return {
    success: true,
    capturedAt,
    status: 'connected',
    statusDetail: 'Connected to the signed-in Bilibili creator account.',
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

export function parseBilibiliPage(value: unknown, accountId: string, capturedAt: string): ParsedBilibiliPage {
  const empty: ParsedBilibiliPage = {
    posts: [], terminal: false, uncertain: false, explicitEmpty: false, rowCount: 0, total: null,
  };
  const data = unwrap(value);
  if (!isRecord(data) || !isRecord(data.page)) return empty;
  const total = numberValue(data.page.count);
  const pn = numberValue(data.page.pn);
  const ps = numberValue(data.page.ps);
  if (total === null || pn === null || ps === null || pn < 1 || ps < 1) return empty;
  let rows = data.arc_audits;
  if (rows === null && total === 0) rows = [];
  if (!Array.isArray(rows)) return empty;
  const terminal = pn * ps >= total;
  const posts: PostInput[] = [];
  let uncertain = false;

  for (const row of rows) {
    if (!isRecord(row)) {
      uncertain = true;
      continue;
    }
    const archive = row.Archive;
    if (!isRecord(archive)) {
      uncertain = true;
      continue;
    }
    if (archive.state !== 0 && archive.state !== -50) {
      if (!('state' in archive)) uncertain = true;
      continue;
    }
    const attrs = archive.attrs;
    if (isRecord(attrs) && attrs.is_premiere === true && attrs.is_played !== true) continue;
    let identifier = stringValue(archive.bvid);
    let url: string;
    if (/^BV[\w]+$/.test(identifier)) {
      url = `https://www.bilibili.com/video/${identifier}`;
    } else if (/^\d+$/.test(String(archive.aid ?? ''))) {
      identifier = String(archive.aid);
      url = `https://www.bilibili.com/video/av${identifier}`;
    } else {
      uncertain = true;
      continue;
    }
    const labels: Record<string, MetricKey> = {
      播放: 'views', 播放量: 'views', 点赞: 'likes', 评论: 'comments', 分享: 'shares', 收藏: 'saves',
    };
    const metrics: Partial<Record<MetricKey, number | null>> = {};
    const display = Array.isArray(row.display_fields) ? row.display_fields : [];
    for (const field of display) {
      if (!isRecord(field) || typeof field.desc !== 'string') continue;
      const key = labels[field.desc];
      if (key) metrics[key] = numberValue(field.value);
    }
    const post = makePost({
      accountId,
      identifier,
      capturedAt,
      title: archive.title,
      url,
      publishedAt: publicationTime(archive.ptime),
      scheduledAt: null,
      metrics,
      status: 'published',
    });
    if (post === null) {
      uncertain = true;
      continue;
    }
    posts.push(post);
    if (post.publishedAt === null) uncertain = true;
  }

  uncertain ||= rows.length === 0 && total > 0;
  return {
    posts,
    terminal,
    uncertain,
    explicitEmpty: !uncertain && rows.length === 0 && terminal && total === 0,
    rowCount: rows.length,
    total,
  };
}

function parseBilibiliScheduled(
  values: readonly unknown[],
  accountId: string,
  capturedAt: string,
): { posts: PostInput[]; read: boolean } {
  const now = new Date(capturedAt);
  const seen = new Map<string, PostInput>();
  let read = false;
  for (const value of values) {
    const data = unwrap(value);
    const rows = data && Array.isArray(data.arc_audits)
      ? data.arc_audits
      : data && isRecord(data.page) && numberValue(data.page.count) === 0
        ? []
        : null;
    if (rows === null) continue;
    read = true;
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const archive = row.Archive;
      if (!isRecord(archive)) continue;
      if ([-2, -4, -16].includes(Number(archive.state))) continue;
      const when = publicationTime(archive.dtime);
      if (!when || new Date(when).getTime() <= now.getTime()) continue;
      const identifier = stringValue(archive.bvid) || String(archive.aid ?? '');
      if (!identifier) continue;
      const post = makePost({
        accountId,
        identifier,
        capturedAt,
        title: archive.title,
        url: MANAGER,
        publishedAt: null,
        scheduledAt: when,
        metrics: {},
        status: 'scheduled',
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
} {
  const body = findResponse(capture, OVERVIEW);
  const data = unwrap(body);
  if (data === null) {
    return {
      populated: false,
      status: body && Number(isRecord(body) ? body.code : NaN) === 0 ? 'no_data' : 'unknown',
      detail: "Bilibili's video analytics returned no data. Its visible zero placeholders are not measured activity.",
      period: 'Selected video analytics window (source date bounds unavailable)',
      values: {},
    };
  }
  const text = capture.texts.analytics ?? '';
  const overviewText = text.split('核心数据概览')[1] ?? text;
  const top = overviewText.split('收益数据')[0] ?? overviewText;
  const periodMatch = /近\s*(\d+)\s*天/.exec(overviewText);
  const period = periodMatch
    ? `Last ${periodMatch[1] ?? ''} days (source date bounds unavailable)`
    : 'Selected video analytics window (source date bounds unavailable)';
  const values = {
    views: labelNumber(top, '播放量'),
    likes: labelNumber(top, '点赞'),
    comments: labelNumber(top, '评论'),
    shares: labelNumber(top, '分享'),
    saves: labelNumber(top, '收藏'),
  };
  const populated = Object.values(values).some((value) => value !== null);
  return {
    populated,
    status: populated ? 'ready' : 'unknown',
    detail: populated
      ? 'Bilibili video analytics are available; article metrics are outside this coverage.'
      : 'Bilibili returned analytics, but the metric labels could not be verified.',
    period,
    values,
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
        ? 'Bilibili does not report this metric for videos.'
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
      period: 'Lifetime, every published post added up',
      source: sourceUrl(POSTS_SOURCE),
      reason: 'Added up from the posts in the creator manager.',
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
  title: unknown;
  url: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  metrics: Partial<Record<MetricKey, number | null>>;
  status: 'published' | 'scheduled';
}): PostInput | null {
  if (!input.identifier) return null;
  if (typeof input.title !== 'string') return null;
  const metrics: Partial<Record<MetricKey, number | null>> = {};
  for (const [key, value] of Object.entries(input.metrics)) {
    if (METRIC_KEYS.includes(key as MetricKey)) metrics[key as MetricKey] = value;
  }
  return {
    accountId: input.accountId,
    platform: 'bilibili',
    remoteId: input.identifier,
    title: input.title,
    url: input.url,
    format: 'video',
    status: input.status,
    publishedAt: input.publishedAt,
    scheduledAt: input.scheduledAt,
    metrics,
    collectedAt: input.capturedAt,
  };
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

function unwrap(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || Number(value.code) !== 0 || !isRecord(value.data)) return null;
  return value.data;
}

function sourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
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
