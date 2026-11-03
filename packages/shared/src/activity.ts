import { PLATFORM_ORDER } from './platforms.js';
import { addDays, dayAsDate, dayRange, shanghaiDay } from './time.js';
import type { Account, Merge, Platform, Post } from './types.js';

export interface PostDateBlock {
  post: Post;
  account: Account;
  /** The merge this post belongs to, when it is part of a cross-post group. */
  merge: Merge | null;
  /** Stable shading slot for the merge group, so groups stay distinguishable. */
  mergeShade: number | null;
}

export interface PostDateDay {
  day: string;
  blocks: PostDateBlock[];
}

export interface PostDateGraph {
  start: string;
  end: string;
  days: PostDateDay[];
  posts: number;
  mergedPosts: number;
  mergedGroups: number;
  /** Platform colours the graph actually uses, in display order. */
  platforms: Platform[];
}

export interface PostDateGraphInput {
  accounts: readonly Account[];
  posts: readonly Post[];
  merges: readonly Merge[];
  today: string;
  days?: number;
}

export const DEFAULT_POST_DATE_DAYS = 30;

/** Distinct merged-group shading patterns rotated through the merge list. */
export const MERGE_SHADE_COUNT = 6;

export function mergeShadeForIndex(index: number): number {
  return ((index % MERGE_SHADE_COUNT) + MERGE_SHADE_COUNT) % MERGE_SHADE_COUNT;
}

/**
 * Bottom-to-top platform order inside a merged group. The owner's order ends at
 * 公众号; YouTube is appended at the top because merges can include it too.
 */
export const MERGE_PLATFORM_STACK_ORDER: readonly Platform[] = [
  'xiaohongshu',
  'douyin',
  'bilibili',
  'wechat',
  'youtube',
];

export function platformStackRank(platform: Platform): number {
  const index = MERGE_PLATFORM_STACK_ORDER.indexOf(platform);
  return index === -1 ? MERGE_PLATFORM_STACK_ORDER.length : index;
}

/**
 * Published posts in the trailing window, bucketed by Shanghai calendar day and
 * stacked within each day. Merged posts keep their platform block and carry the
 * merge id so the graph can shade the group.
 */
export function buildPostDateGraph({
  accounts,
  posts,
  merges,
  today,
  days = DEFAULT_POST_DATE_DAYS,
}: PostDateGraphInput): PostDateGraph {
  const span = Math.max(1, Math.floor(days));
  const end = today;
  const start = addDays(today, -(span - 1));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const mergeByPostId = new Map<string, Merge>();
  const mergeShadeById = new Map<string, number>();
  const mergeRankById = new Map<string, number>();
  merges.forEach((merge, index) => {
    mergeShadeById.set(merge.id, mergeShadeForIndex(index));
    mergeRankById.set(merge.id, index);
    for (const member of merge.members) mergeByPostId.set(member.postId, merge);
  });

  const blocks: PostDateBlock[] = [];
  for (const post of posts) {
    if (post.status !== 'published') continue;
    const account = accountById.get(post.accountId);
    if (!account) continue;
    const day = shanghaiDay(post.publishedAt);
    if (!day || day < start || day > end) continue;
    const merge = mergeByPostId.get(post.id) ?? null;
    blocks.push({
      post,
      account,
      merge,
      mergeShade: merge ? mergeShadeById.get(merge.id) ?? 0 : null,
    });
  }
  // Bottom-to-top order: merged groups first (in merge order), then unmerged
  // posts, so each group stays one contiguous block. Inside a group the
  // platform stack order is the primary sort.
  const unmergedRank = merges.length;
  const rankOf = (block: PostDateBlock): number =>
    block.merge ? mergeRankById.get(block.merge.id) ?? unmergedRank : unmergedRank;
  blocks.sort((left, right) => {
    const byGroup = rankOf(left) - rankOf(right);
    if (byGroup !== 0) return byGroup;
    if (left.merge && right.merge) {
      const byPlatform = platformStackRank(left.account.platform) - platformStackRank(right.account.platform);
      if (byPlatform !== 0) return byPlatform;
    }
    const byTime = (left.post.publishedAt ?? '').localeCompare(right.post.publishedAt ?? '');
    if (byTime !== 0) return byTime;
    const byPlatform =
      PLATFORM_ORDER.indexOf(left.account.platform) - PLATFORM_ORDER.indexOf(right.account.platform);
    if (byPlatform !== 0) return byPlatform;
    const byAccount = left.account.displayName.localeCompare(right.account.displayName);
    if (byAccount !== 0) return byAccount;
    return left.post.title.localeCompare(right.post.title);
  });

  const byDay = new Map<string, PostDateBlock[]>();
  const platformSet = new Set<Platform>();
  const mergeIds = new Set<string>();
  for (const block of blocks) {
    const day = shanghaiDay(block.post.publishedAt) as string;
    const dayBlocks = byDay.get(day) ?? [];
    dayBlocks.push(block);
    byDay.set(day, dayBlocks);
    platformSet.add(block.account.platform);
    if (block.merge) mergeIds.add(block.merge.id);
  }

  return {
    start,
    end,
    days: dayRange(start, end).map((day) => ({ day, blocks: byDay.get(day) ?? [] })),
    posts: blocks.length,
    mergedPosts: blocks.filter((block) => block.merge !== null).length,
    mergedGroups: mergeIds.size,
    platforms: PLATFORM_ORDER.filter((platform) => platformSet.has(platform)),
  };
}

export interface PostCalendarDay {
  day: string;
  count: number;
  level: 0 | 1 | 2 | 3;
  /** Days later than today in the current week column; rendered as empty tracks. */
  future: boolean;
}

export interface PostCalendarWeek {
  days: PostCalendarDay[];
}

export interface PostCalendar {
  start: string;
  end: string;
  weeks: PostCalendarWeek[];
  posts: number;
  activeDays: number;
}

export interface PostCalendarInput {
  posts: readonly Post[];
  today: string;
  weeks?: number;
}

export const DEFAULT_POST_CALENDAR_WEEKS = 13;

export function postCalendarLevel(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

/** The Monday on or before a day, so week columns run Monday to Sunday. */
export function weekStart(day: string): string {
  const weekday = (dayAsDate(day).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

/**
 * A GitHub-style contribution grid of published posts: one cell per day, week
 * columns starting Monday, the current week last. Future days stay as empty
 * tracks so the last column keeps its seven rows.
 */
export function buildPostCalendar({
  posts,
  today,
  weeks = DEFAULT_POST_CALENDAR_WEEKS,
}: PostCalendarInput): PostCalendar {
  const columnCount = Math.max(1, Math.floor(weeks));
  const start = addDays(weekStart(today), -(columnCount - 1) * 7);
  const end = addDays(start, columnCount * 7 - 1);
  const counts = new Map<string, number>();
  for (const post of posts) {
    if (post.status !== 'published') continue;
    const day = shanghaiDay(post.publishedAt);
    if (!day || day < start || day > end) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const days = dayRange(start, end).map((day) => {
    const count = counts.get(day) ?? 0;
    return { day, count, level: postCalendarLevel(count), future: day > today };
  });
  const output: PostCalendarWeek[] = [];
  for (let index = 0; index < columnCount; index += 1) {
    output.push({ days: days.slice(index * 7, index * 7 + 7) });
  }
  return {
    start,
    end,
    weeks: output,
    posts: days.reduce((total, day) => total + day.count, 0),
    activeDays: days.filter((day) => day.count > 0).length,
  };
}
