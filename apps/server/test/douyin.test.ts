import { describe, expect, it } from 'vitest';
import type { Account } from '@creator-center/shared';
import {
  DouyinLoginRequiredError,
  parseDouyinCapture,
  parsePublishedPage,
  parseScheduledPosts,
  publicationTime,
  type DouyinCapture,
} from '../src/collectors/douyin.js';

const CAPTURED_AT = '2026-10-11T04:00:00.000Z';
const seconds = (value: string) => Math.floor(new Date(value).getTime() / 1000);
const PUBLISHED_AT = seconds('2026-10-11T12:00:00+08:00');
const LATER = seconds('2026-10-12T10:03:00+08:00');
const EARLIER = seconds('2026-10-11T09:00:00+08:00');

const account = {
  id: 'legacy-douyin',
  platform: 'douyin',
  displayName: '抖音',
  studioUrl: 'https://creator.douyin.com/creator-micro/home',
  lastSuccessAt: null,
} as unknown as Account;

function video(identifier = '1234567890123456789', changes: Record<string, unknown> = {}) {
  return {
    aweme_id: identifier,
    item_id: identifier,
    desc: '作品介绍',
    create_time: PUBLISHED_AT,
    status_value: 102,
    statistics: { play_count: 20, digg_count: 0 },
    ...changes,
  };
}

function page(rows: unknown[] = [], changes: Record<string, unknown> = {}) {
  return { status_code: 0, aweme_list: rows, items: [], total: rows.length, has_more: false, max_cursor: 0, ...changes };
}

function capture(overrides: Partial<DouyinCapture> = {}): DouyinCapture {
  return {
    capturedAt: CAPTURED_AT,
    profile: {
      status_code: 0,
      user_profile: { unique_id: 'physics', nick_name: 'Liam', follower_count: 100, following_count: 2, total_favorited: 50 },
      has_data_mgmt_perm: true,
    },
    postsPages: [page([video()])],
    schedulePages: [page([])],
    overview: { status_code: 0, metrics: [{ view_count: 20 }] },
    homeText: '数据将于10月12日 12点更新',
    analyticsText: '数据总览\n播放量 1,799\n完播率 1.5%\n统计周期：2026-10-27 至 2026-11-02',
    contentText: '已发布',
    scheduleRead: true,
    ...overrides,
  };
}

describe('douyin capture parser', () => {
  it('parses profile, analytics, published posts and history', () => {
    const snapshot = parseDouyinCapture(capture(), account);
    expect(snapshot.success).toBe(true);
    expect(snapshot.status).toBe('connected');
    expect(snapshot.handle).toBe('physics');
    const metric = (key: string) => snapshot.metrics.find((entry) => entry.key === key);
    expect(metric('followers')).toMatchObject({ availability: 'value', value: 100, scope: 'current' });
    expect(metric('following')).toMatchObject({ value: 2 });
    expect(metric('likes')).toMatchObject({ value: 50, scope: 'lifetime' });
    expect(metric('posts')).toMatchObject({ value: 1 });
    expect(metric('views')).toMatchObject({ value: 20, scope: 'lifetime' });
    expect(metric('completion_rate')).toMatchObject({ value: 1.5, scope: 'window' });
    expect(metric('watch_hours')).toMatchObject({ availability: 'unsupported', value: null });
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0]).toMatchObject({
      accountId: 'legacy-douyin',
      platform: 'douyin',
      remoteId: '1234567890123456789',
      title: '作品介绍',
      url: 'https://www.douyin.com/video/1234567890123456789',
      publishedAt: '2026-10-11T12:00:00+08:00',
      status: 'published',
    });
    expect(snapshot.history).toMatchObject({ accountId: 'legacy-douyin', day: '2026-10-11', followers: 100 });
    expect(snapshot.analyticsStatus).toBe('ready');
    expect(snapshot.contentStatus).toBe('ready');
  });

  it('excludes review, rejected and timed rows from published content', () => {
    const rows = [
      video('141', { status_value: 141 }),
      video('144', { status_value: 144 }),
      video('timed', { timer: { status: 0, public_time: LATER } }),
      video('review', { status_value: 143, review_struct: { status: 6 } }),
    ];
    const parsed = parsePublishedPage(page(rows), account.id, CAPTURED_AT);
    expect(parsed.posts).toEqual([]);
  });

  it('matches item metrics by aweme id and keeps observed fallbacks', () => {
    const row = video('123', { statis: { share_vv: '7' } });
    const body = page([row], {
      items: [
        { id: 'unrelated', metrics: { view_count: 999 } },
        { id: '123', metrics: { view_count: 30, like_count: null, favorite_count: 0 } },
      ],
    });
    const [, post] = [null, parsePublishedPage(body, account.id, CAPTURED_AT).posts[0]];
    expect(post?.metrics).toEqual({ views: 30, likes: 0, shares: 7, saves: 0 });
    expect(post?.metrics.comments).toBeUndefined();
  });

  it('does not treat an unknown status or an incomplete page as empty', () => {
    const unknown = parsePublishedPage(page([video('999', { status_value: 999 })]), account.id, CAPTURED_AT);
    expect(unknown.posts).toEqual([]);
    expect(unknown.uncertain).toBe(true);
    expect(unknown.explicitEmpty).toBe(false);
    const more = parsePublishedPage(page([video()], { has_more: true, max_cursor: 9 }), account.id, CAPTURED_AT);
    expect(more.terminal).toBe(false);
    const unknownSchema = parsePublishedPage({}, account.id, CAPTURED_AT);
    expect(unknownSchema.posts).toEqual([]);
    expect(unknownSchema.terminal).toBe(false);
  });

  it('reads future timed posts and ignores lapsed or published timers', () => {
    const future = parseScheduledPosts([page([video('future', { timer: { status: 0, public_time: LATER } })])], account.id, CAPTURED_AT);
    expect(future).toHaveLength(1);
    expect(future[0]).toMatchObject({ remoteId: 'future', status: 'scheduled', scheduledAt: '2026-10-12T10:03:00+08:00' });
    const ignored = parseScheduledPosts([
      page([
        video('published'),
        video('earlier', { timer: { status: 0, public_time: EARLIER } }),
        video('wrong-status', { timer: { status: 1, public_time: LATER } }),
        video('review', { status_value: 141, timer: { status: 0, public_time: LATER } }),
      ]),
    ], account.id, CAPTURED_AT);
    expect(ignored).toEqual([]);
    expect(parseScheduledPosts([{ status_code: 9 }], account.id, CAPTURED_AT)).toEqual([]);
  });

  it('marks scheduled posts as non-authoritative when the schedule list was not read', () => {
    const snapshot = parseDouyinCapture(capture({ schedulePages: [], scheduleRead: false }), account);
    expect(snapshot.scheduledAuthoritative).toBe(false);
    expect(snapshot.scheduled).toEqual([]);
  });

  it('sums lifetime post totals only from a complete trusted walk', () => {
    const rows = [
      video('1', { statistics: { play_count: 20, digg_count: 0, comment_count: 0, share_count: 0, collect_count: 0 } }),
      video('2', { statistics: { play_count: 30, digg_count: 4, comment_count: 2, share_count: 3, collect_count: 5 } }),
    ];
    const snapshot = parseDouyinCapture(capture({ postsPages: [page(rows)] }), account);
    const metric = (key: string) => snapshot.metrics.find((entry) => entry.key === key);
    expect(metric('views')).toMatchObject({ value: 50, scope: 'lifetime' });
    expect(metric('comments')).toMatchObject({ value: 2, scope: 'lifetime' });
    expect(metric('shares')).toMatchObject({ value: 3, scope: 'lifetime' });
    expect(metric('saves')).toMatchObject({ value: 5 });
    expect(metric('likes')).toMatchObject({ value: 50, scope: 'lifetime' });
  });

  it('reads the displayed analytics when the old overview JSON is absent', () => {
    const snapshot = parseDouyinCapture(capture({
      postsPages: [],
      schedulePages: [],
      overview: null,
      analyticsText: '数据总览\n播放量 1,799\n完播率 1.5%\n统计周期：2026-10-27 至 2026-11-02',
    }), account);
    expect(snapshot.analyticsStatus).toBe('ready');
    expect(snapshot.metrics.find((entry) => entry.key === 'views')).toMatchObject({ value: 1799, scope: 'window' });
    expect(snapshot.metrics.find((entry) => entry.key === 'completion_rate')?.value).toBe(1.5);
  });

  it('keeps the profile reading when analytics is not populated', () => {
    const snapshot = parseDouyinCapture(capture({ overview: { status_code: 0, metrics: [{}] }, analyticsText: '' }), account);
    const metric = (key: string) => snapshot.metrics.find((entry) => entry.key === key);
    expect(snapshot.analyticsStatus).toBe('no_data');
    expect(snapshot.metrics.find((entry) => entry.key === 'followers')?.value).toBe(100);
  });

  it('rejects a capture from a signed-out session', () => {
    expect(() => parseDouyinCapture(capture({ loginRequired: true }), account)).toThrow(DouyinLoginRequiredError);
  });

  it('filters published posts outside the 60-day window', () => {
    const old = video('111', { create_time: seconds('2026-08-01T12:00:00+08:00') });
    const snapshot = parseDouyinCapture(capture({ postsPages: [page([old, video('222')])] }), account);
    expect(snapshot.posts.map((post) => post.remoteId)).toEqual(['222']);
  });

  it('formats publication times in Shanghai and rejects missing values', () => {
    expect(publicationTime(PUBLISHED_AT)).toBe('2026-10-11T12:00:00+08:00');
    expect(publicationTime(0)).toBeNull();
    expect(publicationTime(null)).toBeNull();
  });
});
