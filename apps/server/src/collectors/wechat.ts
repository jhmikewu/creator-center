import type {
  Account,
  BrowserCapture,
  HistoryPoint,
  MetricAvailability,
  MetricKey,
  MetricScope,
  PostFormat,
} from '@creator-center/shared';
import { PLATFORMS, addDays, shanghaiDay } from '@creator-center/shared';
import type { AdapterSnapshot } from '../adapters/types.js';
import type { MetricInput } from '../repositories/accounts.js';
import type { PostInput } from '../repositories/posts.js';

export interface ParsedWechatPage {
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
const UNSUPPORTED: readonly MetricKey[] = PLATFORMS.wechat.unsupportedMetrics;
const CONTENT_WINDOW_DAYS = 60;
const WECHAT_PAGE_SIZE = 10;
const HOME_SOURCE = 'https://mp.weixin.qq.com/cgi-bin/home';
const PUBLISH_SOURCE = 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish';
const PUBLISH = /\/cgi-bin\/appmsgpublish/;
const USER = /\/misc\/useranalysis/;
const ARTICLE = /^https?:\/\/mp\.weixin\.qq\.com\/s(?:[/?]|$)/;
const TIME_HINTS = ['time', 'date', 'sent', 'publish', 'create', 'update'];

interface MetricDraft {
  value: number;
  scope: MetricScope;
  period: string;
  source: string;
  reason: string | null;
}

export class WechatLoginRequiredError extends Error {
  constructor(message = 'Sign in to the 公众号 console in the embedded window, then sync again.') {
    super(message);
    this.name = 'WechatLoginRequiredError';
  }
}

export function parseWechatCapture(capture: BrowserCapture, account: Account): AdapterSnapshot {
  if (capture.loginRequired) throw new WechatLoginRequiredError();
  const capturedAt = isoOrNow(capture.capturedAt);
  const homeText = capture.texts.home ?? '';
  if (/请重新登录|重新登录/.test(homeText)) throw new WechatLoginRequiredError();

  const drafts = new Map<MetricKey, MetricDraft>();
  const set = (key: MetricKey, value: unknown, scope: MetricScope, period: string, source: string, reason: string | null = null) => {
    const number = numberValue(value);
    if (number === null) return;
    drafts.set(key, { value: number, scope, period, source: sourceUrl(source), reason });
  };

  const windowMatch = /数据统计时间[:：]\s*([^\n]+)/.exec(homeText);
  const period = windowMatch
    ? `Source statistics window ${windowMatch[1]?.trim() ?? ''}`
    : 'Source-reported window (bounds unavailable)';
  set('followers', labelNumber(homeText, '总用户数'), 'current', 'Current account total', HOME_SOURCE);
  set('views', labelNumber(homeText, '昨日阅读(人)'), 'window', period, HOME_SOURCE,
    'Reads the console reports for its own statistics window.');
  set('shares', labelNumber(homeText, '昨日分享(人)'), 'window', period, HOME_SOURCE,
    'Shares the console reports for its own statistics window.');

  const publishPages = findResponses(capture, PUBLISH);
  const pages = publishPages
    .map((body) => parseWechatPage(body, account.id, capturedAt))
    .filter((page) => page.total !== null);
  const firstPage = pages[0] ?? null;
  const postCount = firstPage?.total ?? null;
  if (postCount !== null) {
    set('posts', postCount, 'current', 'Current published-content count', PUBLISH_SOURCE,
      'Published items in the console, across every content type.');
  }

  const allPosts = [...new Map(pages.flatMap((page) => page.posts).map((post) => [post.remoteId, post])).values()];
  const uncertain = pages.some((page) => page.uncertain);
  const complete = pages.length > 0 && pages.every((page) => page.terminal);
  const trusted = pages.length > 0 && complete && !uncertain;
  applyPostTotals(drafts, allPosts, trusted);

  const userPayload = wechatPayload(findResponse(capture, USER));
  const user = userPayload && isRecord(userPayload.user_info) ? userPayload.user_info : null;
  const handle = user && typeof user.nick_name === 'string' ? user.nick_name.trim() : null;
  const unverified = user !== null && user.is_wx_verify === 0;
  const statusDetail = unverified
    ? 'Connected to the signed-in 公众号 account. The account is not verified (未认证).'
    : 'Connected to the signed-in 公众号 account.';

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
    ? 'Published content could not be verified in the 公众号 console.'
    : `${contentStatus === 'partial' ? 'Collection did not reach every terminal page; coverage is incomplete. ' : ''}` +
      'Published 公众号 articles; last 60 days and today (Shanghai).';

  const ready = drafts.has('views') || drafts.has('shares') || drafts.has('posts');
  return {
    success: true,
    capturedAt,
    status: 'connected',
    statusDetail,
    analyticsStatus: ready ? 'ready' : 'unknown',
    analyticsDetail: ready
      ? 'The console reports its own account and content statistics for the signed-in 公众号.'
      : 'The console did not report usable 公众号 statistics.',
    contentStatus,
    contentDetail,
    metrics,
    history,
    posts: published,
    scheduled: [],
    scheduledAuthoritative: false,
    handle,
  };
}

export function parseWechatPage(value: unknown, accountId: string, capturedAt: string): ParsedWechatPage {
  const empty: ParsedWechatPage = {
    posts: [], terminal: false, uncertain: false, explicitEmpty: false, rowCount: 0, total: null,
  };
  const page = wechatList(value);
  if (!page || !Array.isArray(page.publish_list)) return empty;
  const rows = page.publish_list;
  const total = numberValue(page.total_count);
  if (total === null || total < rows.length) return empty;
  const terminal = total === 0 || rows.length >= total || rows.length < WECHAT_PAGE_SIZE;
  const posts: PostInput[] = [];
  let uncertain = false;
  for (const row of rows) {
    if (!isRecord(row)) {
      uncertain = true;
      continue;
    }
    const post = parseWechatPost(row, accountId, capturedAt);
    if (post === null) {
      uncertain = true;
      continue;
    }
    posts.push(post);
  }
  return {
    posts,
    terminal,
    uncertain,
    explicitEmpty: !uncertain && rows.length === 0 && terminal && total === 0,
    rowCount: rows.length,
    total,
  };
}

function parseWechatPost(row: Record<string, unknown>, accountId: string, capturedAt: string): PostInput | null {
  const fields = [...wechatFields(row)];
  const url = fields.map(([, value]) => value).find(
    (value): value is string => typeof value === 'string' && ARTICLE.test(value),
  );
  if (!url) return null;
  const titled = fields.filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string' && entry[1].trim().length > 0,
  );
  let title = titled.find(([key, value]) => key.toLowerCase().includes('title') && !ARTICLE.test(value))?.[1];
  if (!title) {
    const candidates = titled
      .map(([, value]) => value)
      .filter((value) => value !== url && !value.startsWith('http'))
      .sort((left, right) => right.length - left.length);
    title = candidates[0];
  }
  if (!title) return null;
  let published: string | null = null;
  for (const [key, value] of fields) {
    if (!TIME_HINTS.some((hint) => key.toLowerCase().includes(hint))) continue;
    published = publicationTime(value);
    if (published) break;
  }
  if (!published) return null;
  let identifier = url;
  try {
    const query = new URL(url).searchParams;
    const sn = query.get('sn');
    const mid = query.get('mid');
    const idx = query.get('idx');
    identifier = sn || (mid && idx ? `${mid}-${idx}` : url);
  } catch {
    // Keep the URL as the identifier when it cannot be parsed.
  }
  return makePost({
    accountId,
    identifier,
    capturedAt,
    title,
    url,
    publishedAt: published,
    scheduledAt: null,
    metrics: {},
    status: 'published',
    format: 'article',
  });
}

function* wechatFields(
  row: Record<string, unknown>,
  depth = 0,
): Generator<[string, string | number]> {
  if (depth > 4) return;
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' || typeof value === 'number') {
      yield [key, value];
    } else if (isRecord(value)) {
      yield* wechatFields(value, depth + 1);
    } else if (Array.isArray(value)) {
      for (const nested of value) {
        if (isRecord(nested)) yield* wechatFields(nested, depth + 1);
      }
    }
  }
}

function wechatPayload(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const base = value.base_resp;
  return isRecord(base) && Number(base.ret) === 0 ? value : null;
}

function wechatList(value: unknown): Record<string, unknown> | null {
  const body = wechatPayload(value);
  if (!body) return null;
  let page = body.publish_page;
  if (typeof page === 'string') {
    try {
      page = JSON.parse(page);
    } catch {
      return null;
    }
  }
  return isRecord(page) ? page : null;
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
      source: sourceUrl(account.studioUrl ?? HOME_SOURCE),
      reason: unsupported
        ? 'The 公众号 console does not report this metric.'
        : 'The signed-in 公众号 console did not return this metric.',
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
      period: 'Lifetime, every published article added up',
      source: sourceUrl(PUBLISH_SOURCE),
      reason: 'Added up from the articles in the console.',
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
  format: PostFormat;
}): PostInput | null {
  if (!input.identifier) return null;
  const metrics: Partial<Record<MetricKey, number | null>> = {};
  for (const [key, value] of Object.entries(input.metrics)) {
    if (METRIC_KEYS.includes(key as MetricKey)) metrics[key as MetricKey] = value;
  }
  return {
    accountId: input.accountId,
    platform: 'wechat',
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
