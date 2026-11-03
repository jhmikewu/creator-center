import { describe, expect, it } from 'vitest';
import {
  MERGE_SHADE_COUNT,
  buildPostCalendar,
  buildPostDateGraph,
  mergeShadeForIndex,
  postCalendarLevel,
  weekStart,
} from './activity.js';
import type { Account, Merge, Metric, Post } from './types.js';

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
const xhs = makeAccount('xhs', 'xiaohongshu', 'Liam Notes');
const bili = makeAccount('bili', 'bilibili', 'Liam Bilibili');

function makePost(
  id: string,
  account: Account,
  day: string | null,
  status: Post['status'] = 'published',
  hour = 10,
): Post {
  const stamp = day ? `${day}T${String(hour).padStart(2, '0')}:00:00+08:00` : null;
  return {
    id,
    accountId: account.id,
    platform: account.platform,
    remoteId: id,
    title: `Post ${id}`,
    url: '',
    format: 'video',
    status,
    publishedAt: status === 'published' ? stamp : null,
    scheduledAt: status === 'scheduled' ? stamp : null,
    metrics: { views: 100, likes: 10 },
    collectedAt: `${today}T00:00:00.000Z`,
  };
}

function makeMerge(id: string, posts: Post[]): Merge {
  return {
    id,
    members: posts.map((post) => ({
      accountId: post.accountId,
      platform: post.platform,
      postId: post.id,
      title: post.title,
      publishedAt: post.publishedAt,
      status: post.status,
    })),
    titleFrom: null,
    customTitle: '',
    createdAt: `${today}T00:00:00.000Z`,
    updatedAt: `${today}T00:00:00.000Z`,
  };
}

describe('post date graph', () => {
  it('buckets published posts by Shanghai day across a trailing 30-day window', () => {
    const graph = buildPostDateGraph({
      accounts: [douyin, xhs],
      posts: [
        makePost('recent', douyin, '2026-11-02'),
        makePost('same-day', xhs, '2026-11-02', 'published', 18),
        makePost('old', douyin, '2026-10-04'),
        makePost('scheduled', xhs, '2026-11-05', 'scheduled'),
      ],
      merges: [],
      today,
    });
    expect(graph.start).toBe('2026-10-05');
    expect(graph.end).toBe(today);
    expect(graph.days).toHaveLength(30);
    expect(graph.posts).toBe(2);
    const day = graph.days.find((entry) => entry.day === '2026-11-02');
    expect(day?.blocks.map((block) => block.post.id)).toEqual(['recent', 'same-day']);
    expect(graph.platforms).toEqual(['douyin', 'xiaohongshu']);
  });

  it('drops posts from accounts outside the current scope', () => {
    const graph = buildPostDateGraph({
      accounts: [douyin],
      posts: [makePost('mine', douyin, '2026-11-01'), makePost('other', xhs, '2026-11-01')],
      merges: [],
      today,
    });
    expect(graph.posts).toBe(1);
    expect(graph.platforms).toEqual(['douyin']);
  });

  it('marks merged posts and counts the distinct groups', () => {
    const first = makePost('first', douyin, '2026-10-20');
    const second = makePost('second', xhs, '2026-10-20', 'published', 18);
    const third = makePost('third', bili, '2026-10-21');
    const graph = buildPostDateGraph({
      accounts: [douyin, xhs, bili],
      posts: [first, second, third],
      merges: [makeMerge('merge-a', [first, second])],
      today,
    });
    expect(graph.mergedPosts).toBe(2);
    expect(graph.mergedGroups).toBe(1);
    const merged = graph.days.flatMap((day) => day.blocks).filter((block) => block.merge !== null);
    expect(merged).toHaveLength(2);
    expect(merged.map((block) => block.mergeShade)).toEqual([0, 0]);
    const plain = graph.days.flatMap((day) => day.blocks).find((block) => block.merge === null);
    expect(plain?.mergeShade).toBeNull();
  });

  it('rotates a distinct shading slot through merged groups', () => {
    expect(MERGE_SHADE_COUNT).toBeGreaterThan(5);
    expect([0, 1, 5, 6, 7, -1].map(mergeShadeForIndex)).toEqual([0, 1, 5, 0, 1, 5]);
    const first = makePost('one', douyin, '2026-10-20');
    const second = makePost('two', xhs, '2026-10-20');
    const third = makePost('three', bili, '2026-10-21');
    const fourth = makePost('four', douyin, '2026-10-21');
    const graph = buildPostDateGraph({
      accounts: [douyin, xhs, bili],
      posts: [first, second, third, fourth],
      merges: [makeMerge('merge-a', [first, second]), makeMerge('merge-b', [third, fourth])],
      today,
    });
    const shades = new Map(
      graph.days
        .flatMap((day) => day.blocks)
        .filter((block) => block.merge !== null)
        .map((block) => [block.post.id, block.mergeShade]),
    );
    expect(shades.get('one')).toBe(0);
    expect(shades.get('two')).toBe(0);
    expect(shades.get('three')).toBe(1);
    expect(shades.get('four')).toBe(1);
  });
});

describe('post calendar', () => {
  it('starts on a Monday and ends with the current week', () => {
    const calendar = buildPostCalendar({ posts: [], today, weeks: 13 });
    expect(weekStart(today)).toBe('2026-11-02');
    expect(calendar.start).toBe('2026-08-10');
    expect(calendar.end).toBe('2026-11-08');
    expect(calendar.weeks).toHaveLength(13);
    expect(calendar.weeks.at(-1)?.days.map((day) => day.day)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(calendar.weeks.at(-1)?.days.map((day) => day.future)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('counts published posts per day and ignores scheduled ones', () => {
    const calendar = buildPostCalendar({
      posts: [
        makePost('one', douyin, '2026-11-02'),
        makePost('two', douyin, '2026-11-02', 'published', 18),
        makePost('three', douyin, '2026-10-30'),
        makePost('later', douyin, '2026-11-06', 'scheduled'),
      ],
      today,
      weeks: 13,
    });
    const days = calendar.weeks.flatMap((week) => week.days);
    const byDay = new Map(days.map((day) => [day.day, day]));
    expect(byDay.get('2026-11-02')).toMatchObject({ count: 2, level: 2 });
    expect(byDay.get('2026-10-30')).toMatchObject({ count: 1, level: 1 });
    expect(byDay.get('2026-11-06')).toMatchObject({ count: 0, level: 0, future: true });
    expect(calendar.posts).toBe(3);
    expect(calendar.activeDays).toBe(2);
  });

  it('maps counts to four intensity levels', () => {
    expect(postCalendarLevel(0)).toBe(0);
    expect(postCalendarLevel(1)).toBe(1);
    expect(postCalendarLevel(2)).toBe(2);
    expect(postCalendarLevel(7)).toBe(3);
  });
});
