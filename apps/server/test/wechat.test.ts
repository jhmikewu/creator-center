import { describe, expect, it } from 'vitest';
import type { Account, BrowserCapture } from '@creator-center/shared';
import {
  WechatLoginRequiredError,
  parseWechatCapture,
  parseWechatPage,
} from '../src/collectors/wechat.js';

const account = {
  id: 'legacy-wechat',
  platform: 'wechat',
  displayName: '公众号',
  studioUrl: 'https://mp.weixin.qq.com/',
} as Account;

const CAPTURED_AT = '2026-10-13T10:00:00+08:00';
const SENT = Date.parse('2026-10-11T04:00:00Z') / 1000;
const PUBLISH = 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish';
const USER = 'https://mp.weixin.qq.com/misc/useranalysis';

function item(changes: Record<string, unknown> = {}) {
  return {
    appmsgid: 100000000000000001,
    itemidx: 1,
    sent_time: SENT,
    title: '为什么摆钟能走时准确',
    appmsgex: [{
      title: '为什么摆钟能走时准确',
      digest: '短评',
      content_url: 'https://mp.weixin.qq.com/s?__biz=MzA5&mid=2650000001&idx=1&sn=synthetic0001',
    }],
    ...changes,
  };
}

function publishPage(rows: unknown[] = [], total = rows.length, ret = 0) {
  return {
    base_resp: { ret },
    is_admin: true,
    publish_page: JSON.stringify({ total_count: total, publish_list: rows }),
  };
}

function capture(overrides: {
  home?: string;
  user?: unknown;
  pages?: unknown[];
} = {}): BrowserCapture {
  return {
    capturedAt: CAPTURED_AT,
    responses: [
      ...(overrides.pages ?? [publishPage([item()])]).map((body) => ({ url: PUBLISH, body })),
      {
        url: USER,
        body: overrides.user ?? {
          base_resp: { ret: 0 },
          user_info: { nick_name: '测试号', is_wx_verify: 0 },
        },
      },
    ],
    texts: {
      home: overrides.home
        ?? '总用户数 123\n昨日阅读(人) 45\n昨日分享(人) 6\n数据统计时间：2026-10-12',
    },
  };
}

function metric(snapshot: ReturnType<typeof parseWechatCapture>, key: string) {
  return snapshot.metrics.find((entry) => entry.key === key);
}

describe('parseWechatCapture', () => {
  it('maps the console totals and a published article', () => {
    const snapshot = parseWechatCapture(capture(), account);
    expect(snapshot.handle).toBe('测试号');
    expect(snapshot.statusDetail).toContain('未认证');
    expect(metric(snapshot, 'followers')).toMatchObject({ value: 123, scope: 'current' });
    expect(metric(snapshot, 'views')).toMatchObject({ value: 45, scope: 'window' });
    expect(metric(snapshot, 'shares')).toMatchObject({ value: 6, scope: 'window' });
    expect(metric(snapshot, 'posts')).toMatchObject({ value: 1 });
    expect(snapshot.analyticsStatus).toBe('ready');
    expect(snapshot.contentStatus).toBe('ready');
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0]).toMatchObject({
      remoteId: 'synthetic0001',
      title: '为什么摆钟能走时准确',
      url: 'https://mp.weixin.qq.com/s?__biz=MzA5&mid=2650000001&idx=1&sn=synthetic0001',
      format: 'article',
      publishedAt: '2026-10-11T12:00:00+08:00',
    });
    expect(snapshot.scheduled).toEqual([]);
    expect(snapshot.scheduledAuthoritative).toBe(false);
    expect(snapshot.history?.followers).toBe(123);
  });

  it('requires a signed-in console session', () => {
    expect(() => parseWechatCapture(capture({ home: '请重新登录' }), account)).toThrow(WechatLoginRequiredError);
  });

  it('reports an explicit empty publish list', () => {
    const snapshot = parseWechatCapture(capture({ pages: [publishPage([], 0)] }), account);
    expect(snapshot.contentStatus).toBe('empty');
    expect(metric(snapshot, 'posts')).toMatchObject({ value: 0 });
  });

  it('keeps rows that cannot prove an article as partial coverage', () => {
    const page = parseWechatPage(publishPage([{ appmsgid: 1, itemidx: 1 }]), account.id, CAPTURED_AT);
    expect(page.posts).toEqual([]);
    expect(page.uncertain).toBe(true);
    expect(parseWechatPage(publishPage([item()], 1), account.id, CAPTURED_AT).terminal).toBe(true);
    expect(parseWechatPage(publishPage(Array.from({ length: 10 }, () => item()), 11), account.id, CAPTURED_AT).terminal).toBe(false);
  });

  it('treats a base_resp failure as unsupported content', () => {
    const snapshot = parseWechatCapture(capture({ pages: [publishPage([item()], 1, 1)] }), account);
    expect(snapshot.contentStatus).toBe('unavailable');
    expect(metric(snapshot, 'posts')).toMatchObject({ availability: 'pending', value: null });
  });

  it('keeps unknown rows out and records the verification detail', () => {
    const snapshot = parseWechatCapture(capture({
      user: { base_resp: { ret: 0 }, user_info: { nick_name: '测试号', is_wx_verify: 1 } },
      pages: [publishPage([item({ appmsgex: [] })])],
    }), account);
    expect(snapshot.statusDetail).toBe('Connected to the signed-in 公众号 account.');
    expect(snapshot.contentStatus).toBe('partial');
    expect(snapshot.posts).toEqual([]);
  });
});
