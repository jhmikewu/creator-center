import { isMetricUnsupported } from './platforms.js';
import { addDays, formatDay, formatDateTime, shanghaiDay, todayShanghai } from './time.js';
import type {
  Account,
  HistoryPoint,
  Metric,
  MetricAvailability,
  MetricKey,
  MetricScope,
} from './types.js';
import { METRIC_KEYS } from './types.js';

export const METRIC_LABELS: Record<MetricKey, string> = {
  followers: 'Followers',
  following: 'Following',
  posts: 'Posts',
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  saves: 'Saves',
  watch_hours: 'Watch hours',
  avg_view_seconds: 'Average view',
  completion_rate: 'Completion rate',
};

export const METRIC_SHORT_LABELS: Record<MetricKey, string> = {
  followers: 'Followers',
  following: 'Following',
  posts: 'Posts',
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  saves: 'Saves',
  watch_hours: 'Watch h',
  avg_view_seconds: 'Avg view',
  completion_rate: 'Completion',
};

export const METRIC_SCOPE_LABELS: Record<MetricScope, string> = {
  lifetime: 'Lifetime',
  current: 'Current',
  window: 'Recent window',
};

export const AVAILABILITY_LABELS: Record<MetricAvailability, string> = {
  value: 'Measured',
  pending: 'Pending',
  unsupported: 'Not reported',
};

export function metricByKey(account: Account, key: MetricKey): Metric {
  return (
    account.metrics.find((metric) => metric.key === key) ?? {
      key,
      scope: 'current',
      availability: isMetricUnsupported(account.platform, key) ? 'unsupported' : 'pending',
      value: null,
      period: '—',
      source: 'Not collected yet',
      reason: isMetricUnsupported(account.platform, key) ? 'This platform does not report it.' : null,
      measuredAt: null,
    }
  );
}

export function metricValue(account: Account, key: MetricKey): number | null {
  const metric = metricByKey(account, key);
  return metric.availability === 'value' ? metric.value : null;
}

export function metricDisplay(account: Account, key: MetricKey): string {
  const metric = metricByKey(account, key);
  if (metric.availability === 'unsupported') return 'n/a';
  if (metric.availability === 'pending') return '—';
  return formatMetric(metric.value, key);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-GB').format(Math.round(value));
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Math.abs(value) < 1000) return formatNumber(value);
  return new Intl.NumberFormat('en-GB', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatMetric(value: number | null | undefined, key: MetricKey): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (key === 'completion_rate') return `${value.toFixed(1).replace(/\.0$/, '')}%`;
  if (key === 'watch_hours') return `${formatCompact(value)} h`;
  if (key === 'avg_view_seconds') {
    const rounded = Math.round(value);
    if (rounded < 60) return `${rounded}s`;
    const minutes = Math.floor(rounded / 60);
    const seconds = rounded % 60;
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return formatCompact(value);
}

export function metricPeriod(account: Account, key: MetricKey): string {
  return metricByKey(account, key).period;
}

export function aggregateMetric(
  accounts: readonly Account[],
  key: MetricKey,
): { value: number | null; measured: number; total: number; unsupported: number } {
  let value = 0;
  let measured = 0;
  let unsupported = 0;
  for (const account of accounts) {
    const metric = metricByKey(account, key);
    if (metric.availability === 'value' && metric.value !== null && Number.isFinite(metric.value)) {
      value += metric.value;
      measured += 1;
    } else if (metric.availability === 'unsupported') {
      unsupported += 1;
    }
  }
  return { value: measured ? value : null, measured, total: accounts.length, unsupported };
}

export function historyFor(
  history: readonly HistoryPoint[],
  accountId: string,
  days = 30,
  today = todayShanghai(),
): HistoryPoint[] {
  const start = addDays(today, -(days - 1));
  return history
    .filter((point) => point.accountId === accountId && point.day >= start && point.day <= today)
    .sort((left, right) => left.day.localeCompare(right.day));
}

export function followerSeries(
  history: readonly HistoryPoint[],
  accountId: string,
  days = 30,
  today = todayShanghai(),
): { day: string; value: number }[] {
  return historyFor(history, accountId, days, today)
    .filter((point) => point.followers !== null && Number.isFinite(point.followers))
    .map((point) => ({ day: point.day, value: point.followers as number }));
}

/**
 * The 7-day gain compares the latest reading with the last reading on or before
 * seven days ago. A channel recorded for less time is compared with its earliest
 * reading, and says so.
 */
export function followerGain(
  history: readonly HistoryPoint[],
  accountId: string,
  today = todayShanghai(),
): { gain: number | null; from: string | null; to: string | null; partial: boolean } {
  const series = followerSeries(history, accountId, 90, today);
  if (series.length < 2) return { gain: null, from: null, to: null, partial: false };
  const latest = series[series.length - 1];
  if (!latest) return { gain: null, from: null, to: null, partial: false };
  const target = addDays(latest.day, -7);
  const baseline = [...series].reverse().find((point) => point.day <= target);
  const fallback = series[0];
  const start = baseline ?? fallback;
  if (!start || start.day === latest.day) return { gain: null, from: null, to: null, partial: false };
  return {
    gain: latest.value - start.value,
    from: start.day,
    to: latest.day,
    partial: !baseline,
  };
}

export function latestMeasurement(accounts: readonly Account[]): string | null {
  let latest: string | null = null;
  for (const account of accounts) {
    for (const metric of account.metrics) {
      if (metric.measuredAt && (!latest || metric.measuredAt > latest)) latest = metric.measuredAt;
    }
    if (account.lastSuccessAt && (!latest || account.lastSuccessAt > latest)) latest = account.lastSuccessAt;
  }
  return latest;
}

export function measurementSummary(account: Account, today = todayShanghai()): string {
  if (account.stale) return 'Stale — last reading kept';
  if (account.status === 'login_required') return 'Sign-in required';
  if (account.status === 'setup_required') return 'Setup required';
  if (account.status === 'error') return 'Last refresh failed';
  if (!account.lastSuccessAt) return 'Never measured';
  const day = shanghaiDay(account.lastSuccessAt);
  if (day === today) return `Measured today at ${formatDateTime(account.lastSuccessAt).split(', ').at(-1)}`;
  return `Measured ${formatDay(day ?? today, { month: 'short', day: 'numeric' })}`;
}

export function accountMetricSummary(account: Account): {
  key: MetricKey;
  value: string;
  label: string;
  tone: 'value' | 'pending' | 'unsupported';
}[] {
  return METRIC_KEYS.slice(0, 4).map((key) => {
    const metric = metricByKey(account, key);
    return {
      key,
      label: METRIC_LABELS[key],
      value: metric.availability === 'value' ? formatMetric(metric.value, key) : metric.availability === 'unsupported' ? 'n/a' : '—',
      tone: metric.availability,
    };
  });
}
