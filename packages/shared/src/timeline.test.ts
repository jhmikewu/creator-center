import { describe, expect, it } from 'vitest';
import { MergeValidationError, validateMergeInput } from './merges.js';
import { buildTimelineModel, defaultTimelineWindow, postLane } from './timeline.js';
import type { Account, Merge, Metric, Plan, Post } from './types.js';

const today = '2026-11-03';

function makeAccount(id: string, platform: Account['platform'], displayName: string): Account {
  const metrics: Metric[] = [];
  return {
    id,
    platform,
    displayName,
    handle: displayName.toLowerCase().replace(/\s+/g, ''),
    avatarUrl: null,
    profileUrl: null,
    studioUrl: null,
    status: 'connected',
    statusDetail: '',
    analyticsStatus: 'ready',
    analyticsDetail: '',
    contentStatus: 'ready',
    contentDetail: '',
    lastAttemptAt: null,
    lastSuccessAt: null,
    stale: false,
    capturedAt: null,
    isDemo: true,
    metrics,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

const douyin = makeAccount('dy-main', 'douyin', 'Liam Physics');
const shorts = makeAccount('dy-shorts', 'douyin', 'Liam Shorts');
const xhs = makeAccount('xhs', 'xiaohongshu', 'Liam Notes');
const bili = makeAccount('bili', 'bilibili', 'Liam Bilibili');
const yt = makeAccount('yt', 'youtube', 'Liam YouTube');

function makePost(id: string, account: Account, day: string | null, status: Post['status'] = 'published'): Post {
  return {
    id,
    accountId: account.id,
    platform: account.platform,
    remoteId: id,
    title: `Post ${id}`,
    url: '',
    format: account.platform === 'xiaohongshu' ? 'text' : 'video',
    status,
    publishedAt: status === 'published' && day ? `${day}T02:00:00.000Z` : null,
    scheduledAt: status === 'scheduled' && day ? `${day}T02:00:00.000Z` : null,
    metrics: { views: 100, likes: 10 },
    collectedAt: `${today}T00:00:00.000Z`,
  };
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    title: 'A plan',
    notes: '',
    contentType: 'short_lecture',
    format: 'video',
    targets: [{ platform: 'douyin', accountId: null }],
    tags: [],
    scheduledFor: '2026-11-05',
    publications: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('timeline model', () => {
  it('places a dated plan in the video lane for every platform account', () => {
    const plan = makePlan();
    const model = buildTimelineModel({
      accounts: [douyin, shorts],
      posts: [],
      plans: [plan],
      merges: [],
      today,
    });
    const day = model.day('2026-11-05');
    expect(day.items).toHaveLength(1);
    expect(day.items[0]?.kind).toBe('plan');
    expect(day.items[0]?.lane).toBe('video');
    if (day.items[0]?.kind === 'plan') {
      expect(day.items[0].targets.map((target) => target.account.id)).toEqual(['dy-main', 'dy-shorts']);
    }
  });

  it('pins a linked plan to its publication date', () => {
    const post = makePost('dy-post', douyin, '2026-11-01');
    const plan = makePlan({
      scheduledFor: '2026-11-05',
      publications: [
        {
          accountId: douyin.id,
          platform: douyin.platform,
          postId: post.id,
          title: post.title,
          publishedAt: post.publishedAt,
        },
      ],
    });
    const model = buildTimelineModel({
      accounts: [douyin],
      posts: [post],
      plans: [plan],
      merges: [],
      today,
    });
    expect(model.day('2026-11-01').items[0]?.kind).toBe('plan');
    expect(model.day('2026-11-05').items).toHaveLength(0);
    expect(model.pinned.has(plan.id)).toBe(true);
  });

  it('shows a published post only up to today and a scheduled post from today forward', () => {
    const published = makePost('published', douyin, '2026-11-02');
    const future = makePost('future', douyin, '2026-11-08');
    const scheduled = makePost('scheduled', douyin, '2026-11-07', 'scheduled');
    const model = buildTimelineModel({
      accounts: [douyin],
      posts: [published, future, scheduled],
      plans: [],
      merges: [],
      today,
    });
    expect(model.day('2026-11-02').items).toHaveLength(1);
    expect(model.day('2026-11-08').items).toHaveLength(0);
    expect(model.day('2026-11-07').items[0]?.kind).toBe('scheduled');
  });

  it('draws a merge once on its earliest publication date and absorbs its members', () => {
    const first = makePost('first', douyin, '2026-11-01');
    const second = makePost('second', xhs, '2026-11-02');
    const merge: Merge = {
      id: 'merge-1',
      members: [
        { accountId: douyin.id, platform: 'douyin', postId: first.id, title: first.title, publishedAt: first.publishedAt, status: 'published' },
        { accountId: xhs.id, platform: 'xiaohongshu', postId: second.id, title: second.title, publishedAt: second.publishedAt, status: 'published' },
      ],
      titleFrom: null,
      customTitle: 'Cross-posted',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const model = buildTimelineModel({
      accounts: [douyin, xhs],
      posts: [first, second],
      plans: [],
      merges: [merge],
      today,
    });
    expect(model.day('2026-11-01').items).toHaveLength(1);
    expect(model.day('2026-11-02').items).toHaveLength(0);
    expect(model.mergedPostIds.has(first.id)).toBe(true);
    expect(model.mergedPostIds.has(second.id)).toBe(true);
    expect(model.day('2026-11-01').items[0]?.kind).toBe('merge');
  });

  it('does not draw a merge whose member is already shown inside a linked plan', () => {
    const first = makePost('first', douyin, '2026-11-01');
    const second = makePost('second', xhs, '2026-11-01');
    const plan = makePlan({
      targets: [{ platform: 'douyin', accountId: null }],
      publications: [
        {
          accountId: douyin.id,
          platform: 'douyin',
          postId: first.id,
          title: first.title,
          publishedAt: first.publishedAt,
        },
      ],
    });
    const merge: Merge = {
      id: 'merge-1',
      members: [
        { accountId: douyin.id, platform: 'douyin', postId: first.id, title: first.title, publishedAt: first.publishedAt, status: 'published' },
        { accountId: xhs.id, platform: 'xiaohongshu', postId: second.id, title: second.title, publishedAt: second.publishedAt, status: 'published' },
      ],
      titleFrom: null,
      customTitle: '',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const model = buildTimelineModel({
      accounts: [douyin, xhs],
      posts: [first, second],
      plans: [plan],
      merges: [merge],
      today,
    });
    expect(model.day('2026-11-01').items.some((item) => item.kind === 'merge')).toBe(false);
    expect(model.day('2026-11-01').items.some((item) => item.kind === 'post')).toBe(true);
  });

  it('keeps undated plans as ideas and undated posts in their own list', () => {
    const plan = makePlan({ scheduledFor: null, targets: [{ platform: 'bilibili', accountId: null }] });
    const post = makePost('undated', yt, null);
    const model = buildTimelineModel({
      accounts: [bili, yt],
      posts: [post],
      plans: [plan],
      merges: [],
      today,
    });
    expect(model.ideas.map((entry) => entry.id)).toEqual([plan.id]);
    expect(model.undatedPosts.map((entry) => entry.post.id)).toEqual(['undated']);
  });

  it('assigns print and video lanes by format and platform fallback', () => {
    expect(postLane(makePost('text', xhs, today), xhs)).toBe('print');
    expect(postLane(makePost('video', bili, today), bili)).toBe('video');
    expect(postLane({ ...makePost('unknown', xhs, today), format: null }, xhs)).toBe('print');
    expect(postLane({ ...makePost('unknown', bili, today), format: null }, bili)).toBe('video');
  });

  it('computes a 15-day default window around today', () => {
    const window = defaultTimelineWindow(today);
    expect(window.days).toBe(15);
    expect(window.start).toBe('2026-10-31');
    expect(window.end).toBe('2026-11-14');
  });
});

describe('merge validation', () => {
  const posts = [makePost('one', douyin, today), makePost('two', xhs, today), makePost('three', bili, today)];

  it('accepts one post per account and rejects duplicate accounts', () => {
    const input = validateMergeInput(
      {
        members: [
          { accountId: douyin.id, postId: 'one' },
          { accountId: xhs.id, postId: 'two' },
        ],
        customTitle: 'Same content',
      },
      posts,
      [douyin, xhs, bili],
    );
    expect(input.members).toHaveLength(2);
    expect(() =>
      validateMergeInput(
        {
          members: [
            { accountId: douyin.id, postId: 'one' },
            { accountId: douyin.id, postId: 'one' },
          ],
        },
        posts,
        [douyin, xhs],
      ),
    ).toThrow(MergeValidationError);
  });

  it('rejects fewer than two and more than five members', () => {
    expect(() =>
      validateMergeInput({ members: [{ accountId: douyin.id, postId: 'one' }] }, posts, [douyin]),
    ).toThrow(MergeValidationError);
  });
});
