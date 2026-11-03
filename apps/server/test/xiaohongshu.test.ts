import { describe, expect, it } from 'vitest';
import type { Account, BrowserCapture } from '@creator-center/shared';
import {
  XiaohongshuLoginRequiredError,
  parseXhsPage,
  parseXiaohongshuCapture,
} from '../src/collectors/xiaohongshu.js';

const account = {
  id: 'legacy-xiaohongshu',
  platform: 'xiaohongshu',
  displayName: '小红书',
  studioUrl: 'https://creator.xiaohongshu.com/creator/home',
} as Account;

const CAPTURED_AT = '2026-10-13T10:00:00+08:00';
const NOTE_TIME = Date.parse('2026-10-11T04:00:00Z');
const FUTURE = Date.parse('2026-10-15T04:00:00Z');
const PROFILE = 'https://creator.xiaohongshu.com/api/galaxy/creator/home/personal_info';
const OVERVIEW = 'https://creator.xiaohongshu.com/api/galaxy/v2/creator/datacenter/account/base';
const POSTS = 'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted';

function note(changes: Record<string, unknown> = {}) {
  return {
    id: 'abcdef0123456789abcdef01',
    display_title: '笔记标题',
    tab_status: 1,
    time: NOTE_TIME,
    type: 'normal',
    schedule_post_time: 0,
    view_count: 8,
    likes: 0,
    xsec_token: 'synthetic-access-token-never-retain',
    ...changes,
  };
}

function page(rows: unknown[], pageNumber = -1) {
  return { code: 0, success: true, data: { notes: rows, page: pageNumber, tags: [] } };
}

function capture(overrides: {
  profile?: unknown;
  posts?: unknown[];
  manager?: string;
  home?: string;
} = {}): BrowserCapture {
  return {
    capturedAt: CAPTURED_AT,
    responses: [
      {
        url: PROFILE,
        body: overrides.profile ?? {
          code: 0,
          data: { name: '测试', red_num: 'red123', fans_count: 9, follow_count: 2 },
        },
      },
      {
        url: OVERVIEW,
        body: {
          code: 0,
          success: true,
          data: {
            seven: {
              begin_time: Date.parse('2026-10-06T00:00:00+08:00'),
              end_time: Date.parse('2026-10-12T00:00:00+08:00'),
              view_count: 100,
              like_count: 20,
              comment_count: 3,
              share_count: 4,
              collect_count: 5,
            },
          },
        },
      },
      ...(overrides.posts ?? [{ url: `${POSTS}?tab=1`, body: page([note()]) }]),
    ],
    texts: {
      manager: overrides.manager ?? '全部\n8',
      home: overrides.home ?? '视频完播率 42.5%',
    },
  };
}

function metric(snapshot: ReturnType<typeof parseXiaohongshuCapture>, key: string) {
  return snapshot.metrics.find((entry) => entry.key === key);
}

describe('parseXiaohongshuCapture', () => {
  it('maps the signed-in profile, seven-day analytics and notes', () => {
    const snapshot = parseXiaohongshuCapture(capture(), account);
    expect(snapshot.handle).toBe('red123');
    expect(metric(snapshot, 'followers')).toMatchObject({ value: 9, scope: 'current' });
    expect(metric(snapshot, 'following')).toMatchObject({ value: 2, scope: 'current' });
    expect(metric(snapshot, 'posts')).toMatchObject({ value: 8 });
    expect(metric(snapshot, 'views')).toMatchObject({ value: 100, scope: 'window' });
    expect(metric(snapshot, 'likes')).toMatchObject({ value: 20, scope: 'window' });
    expect(metric(snapshot, 'comments')).toMatchObject({ value: 3, scope: 'window' });
    expect(metric(snapshot, 'shares')).toMatchObject({ value: 4, scope: 'window' });
    expect(metric(snapshot, 'saves')).toMatchObject({ value: 5, scope: 'window' });
    expect(metric(snapshot, 'completion_rate')).toMatchObject({ value: 42.5, scope: 'window' });
    expect(snapshot.analyticsStatus).toBe('ready');
    expect(snapshot.contentStatus).toBe('ready');
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0]).toMatchObject({
      remoteId: 'abcdef0123456789abcdef01',
      url: 'https://www.xiaohongshu.com/explore/abcdef0123456789abcdef01',
      format: 'text',
      publishedAt: '2026-10-11T12:00:00+08:00',
    });
    expect(snapshot.scheduled).toEqual([]);
    expect(snapshot.scheduledAuthoritative).toBe(false);
    expect(snapshot.history?.followers).toBe(9);
  });

  it('requires the signed-in profile response', () => {
    expect(() => parseXiaohongshuCapture(capture({ profile: { code: 0, data: null } }), account))
      .toThrow(XiaohongshuLoginRequiredError);
  });

  it('keeps review states and future scheduled notes out of published content', () => {
    const snapshot = parseXiaohongshuCapture(capture({
      posts: [{
        url: `${POSTS}?tab=1`,
        body: page([
          note({ tab_status: 2 }),
          note({ tab_status: 3 }),
          note({ tab_status: 4, schedule_post_time: FUTURE }),
        ]),
      }],
    }), account);
    expect(snapshot.posts).toEqual([]);
  });

  it('reads the scheduled tab and marks it authoritative', () => {
    const snapshot = parseXiaohongshuCapture(capture({
      posts: [{
        url: `${POSTS}?tab=0`,
        body: page([note({ tab_status: 4, schedule_post_time: FUTURE, display_title: '定时笔记' })]),
      }],
    }), account);
    expect(snapshot.scheduled).toHaveLength(1);
    expect(snapshot.scheduled[0]).toMatchObject({
      remoteId: 'abcdef0123456789abcdef01',
      status: 'scheduled',
      scheduledAt: '2026-10-15T12:00:00+08:00',
      format: 'text',
    });
    expect(snapshot.scheduledAuthoritative).toBe(true);
  });

  it('preserves an empty title and drops the access token from the note URL', () => {
    const snapshot = parseXiaohongshuCapture(capture({
      posts: [{ url: `${POSTS}?tab=1`, body: page([note({ display_title: '' })]) }],
    }), account);
    expect(snapshot.posts[0]?.title).toBe('');
    expect(snapshot.posts[0]?.url).not.toContain('?');
    expect(JSON.stringify(snapshot)).not.toContain('synthetic-access-token');
  });

  it('treats a nonterminal page as partial coverage', () => {
    expect(parseXhsPage(page([note()], 1), account.id, CAPTURED_AT).terminal).toBe(false);
    expect(parseXhsPage(page([note()], -1), account.id, CAPTURED_AT).terminal).toBe(true);
    const snapshot = parseXiaohongshuCapture(capture({
      posts: [{ url: `${POSTS}?tab=1`, body: page([note()], 1) }],
    }), account);
    expect(snapshot.contentStatus).toBe('partial');
  });

  it('reports an explicit empty terminal page as empty content', () => {
    const snapshot = parseXiaohongshuCapture(capture({
      posts: [{ url: `${POSTS}?tab=1`, body: page([]) }],
      manager: '',
    }), account);
    expect(snapshot.contentStatus).toBe('empty');
    expect(metric(snapshot, 'posts')).toMatchObject({ value: 0 });
  });
});
