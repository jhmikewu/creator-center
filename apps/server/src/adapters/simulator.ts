import { shanghaiDay, type MetricKey, type Platform } from '@creator-center/shared';
import type { AdapterContext, AdapterResult, PlatformAdapter } from './types.js';
import type { MetricInput } from '../repositories/accounts.js';
import type { PostInput } from '../repositories/posts.js';

/**
 * The demo adapter refreshes seeded demo accounts. It deliberately keeps the
 * numbers stable so screenshots and tests are deterministic; it updates the
 * measurement time and, when a scheduled post has reached its release time,
 * turns it into the published post with the same id.
 */
export class SimulatorAdapter implements PlatformAdapter {
  constructor(public readonly platform: Platform) {}

  implemented = true;

  async sync(context: AdapterContext): Promise<AdapterResult> {
    const now = context.now.toISOString();
    const metrics: MetricInput[] = context.account.metrics.map((metric) => ({
      key: metric.key,
      scope: metric.scope,
      availability: metric.availability,
      value: metric.value,
      period: metric.period,
      source: metric.source,
      reason: metric.reason,
      measuredAt: now,
    }));
    if (!metrics.length) metrics.push(...fallbackMetrics(this.platform, now));
    const followers = metricValue(metrics, 'followers');
    const posts = metricValue(metrics, 'posts');
    const history = followers === null
      ? null
      : {
          accountId: context.account.id,
          day: shanghaiDay(now) as string,
          followers,
          posts,
          views: metricValue(metrics, 'views'),
          likes: metricValue(metrics, 'likes'),
          comments: metricValue(metrics, 'comments'),
          shares: metricValue(metrics, 'shares'),
          saves: metricValue(metrics, 'saves'),
        };
    const collectedAt = now;
    const mapped: PostInput[] = context.posts.map((post) => {
      const released =
        post.status === 'scheduled' && post.scheduledAt && new Date(post.scheduledAt) <= context.now;
      return {
        accountId: post.accountId,
        platform: post.platform,
        remoteId: post.remoteId,
        title: post.title,
        url: post.url,
        format: post.format,
        status: released ? 'published' : post.status,
        publishedAt: released ? post.scheduledAt : post.publishedAt,
        scheduledAt: released ? null : post.scheduledAt,
        metrics: post.metrics,
        collectedAt,
      };
    });
    return {
      success: true,
      capturedAt: now,
      status: 'connected',
      statusDetail: 'Demo account. The session is simulated locally.',
      analyticsStatus: 'ready',
      analyticsDetail: 'Demo analytics refreshed locally.',
      contentStatus: mapped.length ? 'ready' : 'empty',
      contentDetail: 'Demo content refreshed locally.',
      metrics,
      history,
      posts: mapped.filter((post) => post.status === 'published'),
      scheduled: mapped.filter((post) => post.status === 'scheduled'),
    };
  }
}

function metricValue(metrics: readonly MetricInput[], key: MetricKey): number | null {
  const metric = metrics.find((entry) => entry.key === key);
  return metric && metric.availability === 'value' ? metric.value : null;
}

function fallbackMetrics(platform: Platform, now: string): MetricInput[] {
  return [
    {
      key: 'followers',
      scope: 'current',
      availability: 'value',
      value: platform === 'wechat' ? 860 : 2_400,
      period: 'current',
      source: 'Demo source',
      reason: null,
      measuredAt: now,
    },
    {
      key: 'posts',
      scope: 'lifetime',
      availability: 'value',
      value: 12,
      period: 'lifetime',
      source: 'Demo source',
      reason: null,
      measuredAt: now,
    },
  ];
}
