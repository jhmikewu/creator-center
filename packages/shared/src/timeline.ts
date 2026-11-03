import { mergeTitle } from './merges.js';
import { resolveTargetAccounts } from './planning.js';
import { PLATFORMS } from './platforms.js';
import { addDays, dayRange, shanghaiDay } from './time.js';
import type { Account, Merge, Plan, Platform, Post } from './types.js';

export type Lane = 'video' | 'print';

export interface TimelinePlanTarget {
  account: Account;
  linkedPost: Post | null;
  date: string | null;
}

export interface TimelinePlanItem {
  kind: 'plan';
  key: string;
  plan: Plan;
  date: string;
  lane: Lane;
  targets: TimelinePlanTarget[];
  linked: boolean;
  track?: number;
}

export interface TimelinePostItem {
  kind: 'post';
  key: string;
  post: Post;
  account: Account;
  date: string;
  lane: Lane;
  pending: false;
  track?: number;
}

export interface TimelineScheduledItem {
  kind: 'scheduled';
  key: string;
  post: Post;
  account: Account;
  date: string;
  lane: Lane;
  pending: true;
  track?: number;
}

export interface TimelineMergeItem {
  kind: 'merge';
  key: string;
  merge: Merge;
  date: string;
  lane: Lane;
  members: { post: Post; account: Account }[];
  title: string;
  track?: number;
}

export type TimelineItem =
  | TimelinePlanItem
  | TimelinePostItem
  | TimelineScheduledItem
  | TimelineMergeItem;

export interface TimelineDay {
  day: string;
  items: TimelineItem[];
  tracks: number;
  laneTracks: Record<Lane, number>;
}

export interface TimelineModel {
  days: Map<string, TimelineDay>;
  ideas: Plan[];
  undatedMerges: { merge: Merge; members: { post: Post; account: Account }[]; title: string }[];
  undatedPosts: { post: Post; account: Account }[];
  eventDays: string[];
  planDates: Map<string, Set<string>>;
  pinned: Set<string>;
  mergedPostIds: Set<string>;
  linkedPostIds: Set<string>;
  day: (day: string) => TimelineDay;
}

export interface TimelineInput {
  accounts: readonly Account[];
  posts: readonly Post[];
  plans: readonly Plan[];
  merges: readonly Merge[];
  today: string;
}

export function postLane(post: Post, account: Account): Lane {
  if (post.format === 'video' || post.format === 'livestream') return 'video';
  if (post.format === 'text' || post.format === 'article') return 'print';
  return PLATFORMS[account.platform].defaultPostFormat;
}

export function planLane(plan: Plan): Lane {
  return plan.format === 'print' ? 'print' : 'video';
}

export function postDate(post: Post): string | null {
  return shanghaiDay(post.publishedAt ?? post.scheduledAt);
}

export function buildTimelineModel({
  accounts,
  posts,
  plans,
  merges,
  today,
}: TimelineInput): TimelineModel {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const linkedPostIds = new Set<string>();
  for (const plan of plans) for (const link of plan.publications) linkedPostIds.add(link.postId);

  const planDates = new Map<string, Set<string>>();
  const pinned = new Set<string>();
  const ideas: Plan[] = [];
  const planItems: TimelinePlanItem[] = [];

  for (const plan of plans) {
    const resolved = resolveTargetAccounts(plan.targets, accounts);
    const byDate = new Map<string, TimelinePlanTarget[]>();
    let anyDate = false;
    for (const { account } of resolved) {
      const link = plan.publications.find((publication) => publication.accountId === account.id);
      const post = link ? postsById.get(link.postId) ?? null : null;
      const date = post ? postDate(post) : plan.scheduledFor;
      if (!date) continue;
      anyDate = true;
      if (post) pinned.add(plan.id);
      const targets = byDate.get(date) ?? [];
      targets.push({ account, linkedPost: post, date });
      byDate.set(date, targets);
    }
    if (!anyDate && !plan.scheduledFor) {
      ideas.push(plan);
      continue;
    }
    for (const [date, targets] of byDate) {
      const key = `plan:${plan.id}:${date}`;
      planItems.push({
        kind: 'plan',
        key,
        plan,
        date,
        lane: planLane(plan),
        targets,
        linked: targets.some((target) => target.linkedPost !== null),
      });
      const dates = planDates.get(plan.id) ?? new Set<string>();
      dates.add(date);
      planDates.set(plan.id, dates);
    }
  }

  const mergedPostIds = new Set<string>();
  const mergeItems: TimelineMergeItem[] = [];
  const undatedMerges: TimelineModel['undatedMerges'] = [];
  for (const merge of merges) {
    const members = merge.members
      .map((member) => {
        const post = postsById.get(member.postId);
        const account = accountById.get(member.accountId);
        return post && account ? { post, account } : null;
      })
      .filter((entry): entry is { post: Post; account: Account } => entry !== null)
      .filter(({ post }) => !linkedPostIds.has(post.id));
    if (members.length < 2) continue;
    const dates = members
      .map(({ post }) => postDate(post))
      .filter((date): date is string => date !== null)
      .sort();
    const date = dates[0];
    if (!date) {
      undatedMerges.push({ merge, members, title: mergeTitle(merge, members.map(({ post }) => post)) });
      continue;
    }
    for (const { post } of members) mergedPostIds.add(post.id);
    mergeItems.push({
      kind: 'merge',
      key: `merge:${merge.id}`,
      merge,
      date,
      lane: members.some(({ post, account }) => postLane(post, account) === 'video') ? 'video' : 'print',
      members,
      title: mergeTitle(merge, members.map((entry) => entry.post)),
    });
  }

  const postItems: (TimelinePostItem | TimelineScheduledItem)[] = [];
  const undatedPosts: TimelineModel['undatedPosts'] = [];
  const seen = new Set<string>();
  for (const post of posts) {
    const account = accountById.get(post.accountId);
    if (!account) continue;
    if (seen.has(post.id) || linkedPostIds.has(post.id) || mergedPostIds.has(post.id)) continue;
    seen.add(post.id);
    const date = postDate(post);
    if (!date) {
      undatedPosts.push({ post, account });
      continue;
    }
    if (post.status === 'scheduled') {
      if (date < today) continue;
      postItems.push({
        kind: 'scheduled',
        key: `scheduled:${post.id}`,
        post,
        account,
        date,
        lane: postLane(post, account),
        pending: true,
      });
    } else {
      if (date > today) continue;
      postItems.push({
        kind: 'post',
        key: `post:${post.id}`,
        post,
        account,
        date,
        lane: postLane(post, account),
        pending: false,
      });
    }
  }

  const allItems = [
    ...planItems.sort((left, right) => left.plan.createdAt.localeCompare(right.plan.createdAt)),
    ...mergeItems,
    ...postItems.filter((item) => item.kind === 'post').sort((left, right) => left.post.publishedAt?.localeCompare(right.post.publishedAt ?? '') ?? 0),
    ...postItems.filter((item) => item.kind === 'scheduled').sort((left, right) => left.post.scheduledAt?.localeCompare(right.post.scheduledAt ?? '') ?? 0),
  ];

  const days = new Map<string, TimelineDay>();
  for (const item of allItems) {
    const day = days.get(item.date) ?? {
      day: item.date,
      items: [],
      tracks: 0,
      laneTracks: { video: 0, print: 0 },
    };
    const track = day.laneTracks[item.lane];
    item.track = track;
    day.laneTracks[item.lane] = track + 1;
    day.items.push(item);
    day.tracks = Math.max(day.laneTracks.video, day.laneTracks.print);
    days.set(item.date, day);
  }

  const eventDays = [...days.keys()].sort();
  const emptyDay = (day: string): TimelineDay => ({
    day,
    items: [],
    tracks: 0,
    laneTracks: { video: 0, print: 0 },
  });

  return {
    days,
    ideas: ideas.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    undatedMerges,
    undatedPosts,
    eventDays,
    planDates,
    pinned,
    mergedPostIds,
    linkedPostIds,
    day: (day: string) => days.get(day) ?? emptyDay(day),
  };
}

export function timelineRange(
  model: TimelineModel,
  start: string,
  days: number,
): TimelineDay[] {
  return dayRange(start, addDays(start, days - 1)).map((day) => model.day(day));
}

/** A 15-day window that keeps recent context and makes room for what is next. */
export function defaultTimelineWindow(today: string): { start: string; days: number; end: string } {
  const start = addDays(today, -3);
  const days = 15;
  return { start, days, end: addDays(start, days - 1) };
}

export function planStatus(plan: Plan): 'published' | 'scheduled' | 'idea' | 'planned' {
  if (plan.publications.length) return 'published';
  if (plan.scheduledFor) return 'planned';
  return 'idea';
}

export function postPlatform(post: Post): Platform {
  return post.platform;
}

export function timelineItemId(item: TimelineItem): string {
  return item.key;
}

export function timelineItemTitle(item: TimelineItem): string {
  switch (item.kind) {
    case 'plan':
      return item.plan.title;
    case 'merge':
      return item.title;
    case 'post':
    case 'scheduled':
      return item.post.title || 'Untitled post';
  }
}
