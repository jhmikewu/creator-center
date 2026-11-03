import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Account, DouyinCapture } from '@creator-center/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveCollectorAdapter } from '../src/adapters/live.js';
import type { AdapterContext } from '../src/adapters/types.js';

const account = {
  id: 'legacy-douyin',
  platform: 'douyin',
  displayName: '抖音',
  studioUrl: 'https://creator.douyin.com/creator-micro/home',
  status: 'setup_required',
  stale: false,
  lastSuccessAt: null,
  metrics: [],
  isDemo: false,
} as unknown as Account;

const capture: DouyinCapture = {
  capturedAt: '2026-10-11T04:00:00.000Z',
  profile: {
    status_code: 0,
    user_profile: { unique_id: 'physics', follower_count: 100, following_count: 2, total_favorited: 50 },
    has_data_mgmt_perm: true,
  },
  postsPages: [
    {
      status_code: 0,
      has_more: false,
      total: 1,
      aweme_list: [
        {
          aweme_id: '123',
          desc: 'Post',
          create_time: 1791691200,
          status_value: 102,
          statistics: { play_count: 20, digg_count: 1 },
        },
      ],
    },
  ],
  schedulePages: [],
  overview: { status_code: 0, metrics: [{ view_count: 20 }] },
  homeText: '',
  analyticsText: '',
  contentText: '',
  scheduleRead: false,
};

const servers: http.Server[] = [];
afterEach(() => {
  while (servers.length) servers.pop()?.close();
});

function context(): AdapterContext {
  return { account, posts: [], history: [], now: new Date('2026-10-11T04:00:00.000Z') };
}

async function bridge(response: unknown): Promise<string> {
  const server = http.createServer((request, result) => {
    request.resume();
    request.on('end', () => {
      result.writeHead(200, { 'content-type': 'application/json' });
      result.end(JSON.stringify(response));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('live collector bridge adapter', () => {
  it('collects through the desktop bridge and parses the capture', async () => {
    const adapter = new LiveCollectorAdapter('douyin', await bridge({ ok: true, payload: capture }));
    const result = await adapter.sync(context());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.handle).toBe('physics');
    expect(result.metrics.find((metric) => metric.key === 'followers')?.value).toBe(100);
    expect(result.posts.map((post) => post.remoteId)).toEqual(['123']);
    expect(result.scheduledAuthoritative).toBe(false);
  });

  it('maps a signed-out bridge response to a login-required failure', async () => {
    const adapter = new LiveCollectorAdapter('douyin', await bridge({ ok: false, loginRequired: true, detail: 'Sign in.' }));
    const result = await adapter.sync(context());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.status).toBe('login_required');
    expect(result.detail).toBe('Sign in.');
  });

  it('keeps the previous reading when the bridge cannot be reached', async () => {
    const adapter = new LiveCollectorAdapter('douyin', 'http://127.0.0.1:1');
    const result = await adapter.sync({ ...context(), account: { ...account, lastSuccessAt: '2026-10-10T00:00:00.000Z' } });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.keepPrevious).toBe(true);
  });
});
