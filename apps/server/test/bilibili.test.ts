import { describe, expect, it } from 'vitest';
import type { Account, BrowserCapture } from '@creator-center/shared';
import {
  BilibiliLoginRequiredError,
  parseBilibiliCapture,
  parseBilibiliPage,
} from '../src/collectors/bilibili.js';

const account = {
  id: 'legacy-bilibili',
  platform: 'bilibili',
  displayName: 'Bilibili',
  studioUrl: 'https://member.bilibili.com/platform/home',
} as Account;

const CAPTURED_AT = '2026-10-13T10:00:00+08:00';
const PTIME = Date.parse('2026-10-11T04:00:00Z') / 1000;
const FUTURE = Date.parse('2026-10-15T04:00:00Z') / 1000;

function video(changes: Record<string, unknown> = {}) {
  return {
    Archive: { bvid: 'BV1Synthetic', aid: 123, title: '真实发布的讲解', state: 0, ptime: PTIME, ...changes },
    display_fields: [{ desc: '播放', value: 0 }, { desc: '点赞', value: 4 }],
  };
}

function page(rows: unknown[], pn = 1, ps = 10, count = rows.length) {
  return { code: 0, data: { arc_audits: rows, page: { pn, ps, count }, class: { pubed: count } } };
}

function capture(overrides: { rows?: unknown[]; pageBody?: unknown; analytics?: string; login?: boolean } = {}): BrowserCapture {
  return {
    capturedAt: CAPTURED_AT,
    responses: [
      {
        url: 'https://api.bilibili.com/x/web-interface/nav',
        body: { code: 0, data: { isLogin: overrides.login ?? true, uname: '测试账号', mid: 123 } },
      },
      {
        url: 'https://member.bilibili.com/x/web/data/index/stat',
        body: { code: 0, data: { total_click: 100, total_like: 20, total_reply: 3, total_share: 4, total_fav: 5 } },
      },
      { url: 'https://member.bilibili.com/x/relation/followers?pn=1', body: { code: 0, data: { total: 9 } } },
      {
        url: 'https://member.bilibili.com/x/web/archives?status=pubed&pn=1',
        body: overrides.pageBody ?? page(overrides.rows ?? [video()]),
      },
      { url: 'https://member.bilibili.com/x/web/data/v2/overview/stat/num', body: { code: 0, data: {} } },
    ],
    texts: {
      analytics: overrides.analytics
        ?? '核心数据概览\n近 7 天\n播放量 123\n点赞 4\n评论 5\n分享 6\n收藏 7\n收益数据',
    },
  };
}

function metric(snapshot: ReturnType<typeof parseBilibiliCapture>, key: string) {
  return snapshot.metrics.find((entry) => entry.key === key);
}

describe('parseBilibiliCapture', () => {
  it('maps the signed-in profile, lifetime totals and displayed analytics', () => {
    const snapshot = parseBilibiliCapture(capture(), account);
    expect(snapshot.handle).toBe('测试账号');
    expect(metric(snapshot, 'followers')).toMatchObject({ value: 9, scope: 'current' });
    expect(metric(snapshot, 'posts')).toMatchObject({ value: 1 });
    expect(metric(snapshot, 'views')).toMatchObject({ value: 123, scope: 'window' });
    expect(metric(snapshot, 'likes')).toMatchObject({ value: 4, scope: 'window' });
    expect(metric(snapshot, 'comments')).toMatchObject({ value: 5, scope: 'window' });
    expect(metric(snapshot, 'shares')).toMatchObject({ value: 6, scope: 'window' });
    expect(metric(snapshot, 'saves')).toMatchObject({ value: 7, scope: 'window' });
    expect(snapshot.analyticsStatus).toBe('ready');
    expect(snapshot.contentStatus).toBe('ready');
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0]).toMatchObject({
      remoteId: 'BV1Synthetic',
      url: 'https://www.bilibili.com/video/BV1Synthetic',
      publishedAt: '2026-10-11T12:00:00+08:00',
    });
    expect(snapshot.posts[0]?.metrics).toMatchObject({ views: 0, likes: 4 });
    expect(snapshot.scheduled).toEqual([]);
    expect(snapshot.history?.followers).toBe(9);
  });

  it('requires a signed-in nav response', () => {
    expect(() => parseBilibiliCapture(capture({ login: false }), account)).toThrow(BilibiliLoginRequiredError);
  });

  it('keeps review, rejected and premiere rows out of published content', () => {
    const snapshot = parseBilibiliCapture(capture({
      rows: [
        video({ bvid: 'BVreview001', state: -1 }),
        video({ bvid: 'BVreject01', state: -2 }),
        video({ bvid: 'BVreject02', state: -4 }),
        video({ bvid: 'BVpremiere1', attrs: { is_premiere: true, is_played: false } }),
      ],
    }), account);
    expect(snapshot.posts).toEqual([]);
  });

  it('reads timed releases as scheduled content and marks the list authoritative', () => {
    const snapshot = parseBilibiliCapture(capture({
      rows: [video({ bvid: 'BVtimed001', state: -40, dtime: FUTURE, ptime: 0, title: '定时发布' })],
    }), account);
    expect(snapshot.scheduled).toHaveLength(1);
    expect(snapshot.scheduled[0]).toMatchObject({
      remoteId: 'BVtimed001',
      status: 'scheduled',
      scheduledAt: '2026-10-15T12:00:00+08:00',
    });
    expect(snapshot.scheduledAuthoritative).toBe(true);
  });

  it('treats a nonterminal page as partial coverage', () => {
    const first = parseBilibiliPage(page([video()], 1, 10, 11), account.id, CAPTURED_AT);
    expect(first.terminal).toBe(false);
    expect(first.total).toBe(11);
    const second = parseBilibiliPage(page([video()], 2, 10, 11), account.id, CAPTURED_AT);
    expect(second.terminal).toBe(true);
    const snapshot = parseBilibiliCapture(capture({ pageBody: page([video()], 1, 10, 11) }), account);
    expect(snapshot.contentStatus).toBe('partial');
  });
});
