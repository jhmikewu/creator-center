import type {
  Account,
  AppSettings,
  Dashboard,
  HistoryPoint,
  Merge,
  Plan,
  Platform,
  Post,
} from '@creator-center/shared';
import {
  PLATFORM_ORDER,
  aggregateMetric,
  followerGain,
  latestMeasurement,
  metricByKey,
  shanghaiDay,
  todayShanghai,
} from '@creator-center/shared';
import type { DB } from '../db.js';
import { listAccounts, listHistory } from '../repositories/accounts.js';
import { listMerges } from '../repositories/merges.js';
import { listPlans } from '../repositories/plans.js';
import { listPosts } from '../repositories/posts.js';
import { getCommunityState } from './community.js';
import type { SyncService } from './sync.js';

export interface DashboardScope {
  kind: 'all' | 'platform' | 'account';
  accountId: string | null;
  platform: Platform | null;
}

export function parseScope(query: Record<string, unknown>): DashboardScope {
  const accountId = typeof query.account === 'string' && query.account ? query.account : null;
  const platform = PLATFORM_ORDER.find((candidate) => candidate === query.platform) ?? null;
  if (accountId) return { kind: 'account', accountId, platform: null };
  if (platform) return { kind: 'platform', accountId: null, platform };
  return { kind: 'all', accountId: null, platform: null };
}

export function scopedAccounts(accounts: readonly Account[], scope: DashboardScope): Account[] {
  if (scope.kind === 'account') return accounts.filter((account) => account.id === scope.accountId);
  if (scope.kind === 'platform') return accounts.filter((account) => account.platform === scope.platform);
  return [...accounts];
}

export function dashboardFor(
  db: DB,
  settings: AppSettings,
  sync: SyncService,
  scope: DashboardScope,
): Dashboard {
  const allAccounts = listAccounts(db);
  const accounts = scopedAccounts(allAccounts, scope);
  const accountIds = accounts.map((account) => account.id);
  const history = listHistory(db, accountIds);
  const posts = listPosts(db, accountIds);
  const allPlans = listPlans(db);
  const merges = listMerges(db);
  const plans = filterPlans(allPlans, accounts, scope);
  const scopedMerges = merges.filter((merge) =>
    merge.members.some((member) => accountIds.includes(member.accountId)),
  );
  const today = todayShanghai();
  const audience = aggregateMetric(accounts, 'followers');
  const gains = accounts
    .map((account) => followerGain(history, account.id, today).gain)
    .filter((gain): gain is number => gain !== null);
  const published = posts.filter((post) => {
    if (post.status !== 'published' || !post.publishedAt) return false;
    const day = shanghaiDay(post.publishedAt) ?? '';
    const start = new Date(`${today}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - 60);
    return day >= start.toISOString().slice(0, 10);
  });
  const upcoming = posts.filter(
    (post) => post.status === 'scheduled' && post.scheduledAt && (shanghaiDay(post.scheduledAt) ?? '') >= today,
  );
  const platformBreakdown = PLATFORM_ORDER.filter((platform) =>
    accounts.some((account) => account.platform === platform),
  ).map((platform) => {
    const platformAccounts = accounts.filter((account) => account.platform === platform);
    const followers = aggregateMetric(platformAccounts, 'followers');
    const views = aggregateMetric(platformAccounts, 'views');
    const likes = aggregateMetric(platformAccounts, 'likes');
    const postCount = platformAccounts.reduce((total, account) => {
      const metric = metricByKey(account, 'posts');
      return total + (metric.availability === 'value' && metric.value ? metric.value : 0);
    }, 0);
    return {
      platform,
      accounts: platformAccounts.length,
      followers: followers.value ?? 0,
      posts: postCount,
      views: views.value,
      likes: likes.value,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    today,
    timezone: 'Asia/Shanghai',
    scope,
    accounts,
    history,
    posts,
    plans,
    merges: scopedMerges,
    community: getCommunityState(db, settings),
    sync: sync.state(),
    totals: {
      audience: audience.value ?? 0,
      audienceAccounts: audience.measured,
      followers7dGain: gains.length ? gains.reduce((total, gain) => total + gain, 0) : null,
      publishedPosts: published.length,
      upcoming: upcoming.length,
      latestMeasurementAt: latestMeasurement(accounts),
    },
    platformBreakdown,
  };
}

function filterPlans(
  plans: readonly Plan[],
  accounts: readonly Account[],
  scope: DashboardScope,
): Plan[] {
  if (scope.kind === 'all') return [...plans];
  const accountIds = new Set(accounts.map((account) => account.id));
  const platforms = new Set(accounts.map((account) => account.platform));
  return plans.filter((plan) =>
    plan.targets.some((target) =>
      target.accountId ? accountIds.has(target.accountId) : platforms.has(target.platform),
    ),
  );
}

export function accountDetail(
  db: DB,
  accountId: string,
): {
  account: Account;
  history: HistoryPoint[];
  posts: Post[];
  plans: Plan[];
  merges: Merge[];
} | null {
  const accounts = listAccounts(db);
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) return null;
  return {
    account,
    history: listHistory(db, [accountId]),
    posts: listPosts(db, [accountId]),
    plans: listPlans(db).filter((plan) =>
      plan.targets.some(
        (target) =>
          target.accountId === accountId ||
          (target.accountId === null && target.platform === account.platform),
      ),
    ),
    merges: listMerges(db).filter((merge) =>
      merge.members.some((member) => member.accountId === accountId),
    ),
  };
}
