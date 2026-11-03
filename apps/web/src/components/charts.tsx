import { useMemo } from 'react';
import {
  PLATFORMS,
  addDays,
  followerGain,
  formatCompact,
  formatDay,
  type Account,
  type CommunityHistoryPoint,
  type HistoryPoint,
  type Platform,
} from '@creator-center/shared';
import { cn, PLATFORM_CHART_COLORS } from '../utils';

export interface ChartPoint {
  day: string;
  value: number;
}

function buildPath(points: readonly ChartPoint[], width: number, height: number, padding = 3): string {
  if (points.length === 0) return '';
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  return points
    .map((point, index) => {
      const x = padding + index * step;
      const y = max === min ? height / 2 : height - padding - ((point.value - min) / span) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function Sparkline({
  points,
  color,
  width = 132,
  height = 40,
  fill = false,
  label,
}: {
  points: readonly ChartPoint[];
  color: string;
  width?: number;
  height?: number;
  fill?: boolean;
  label?: string;
}) {
  const path = buildPath(points, width, height);
  const area = path ? `${path} L${width - 3},${height} L3,${height} Z` : '';
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label ?? 'Trend line'}
    >
      {fill && path && (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      )}
      {path ? (
        <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <line x1="3" x2={width - 3} y1={height / 2} y2={height / 2} stroke="var(--line-strong)" strokeDasharray="3 4" />
      )}
    </svg>
  );
}

export function TrendChart({
  points,
  color,
  height = 190,
  valueFormatter = formatCompact,
  emptyLabel = 'Not enough measured dates for a trend yet.',
}: {
  points: readonly ChartPoint[];
  color: string;
  height?: number;
  valueFormatter?: (value: number | null | undefined) => string;
  emptyLabel?: string;
}) {
  if (points.length < 2) {
    return <div className="chart-empty">{emptyLabel}</div>;
  }
  const width = 720;
  const paddingX = 18;
  const paddingTop = 18;
  const paddingBottom = 28;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - paddingX * 2) / (points.length - 1);
  const y = (value: number) =>
    height - paddingBottom - ((value - min) / span) * (height - paddingTop - paddingBottom);
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${paddingX + index * step},${y(point.value)}`)
    .join(' ');
  const area = `${path} L${paddingX + (points.length - 1) * step},${height - paddingBottom} L${paddingX},${height - paddingBottom} Z`;
  const last = points[points.length - 1] as ChartPoint;
  const first = points[0] as ChartPoint;
  const gridValues = [max, min + span / 2, min];
  const ticks = points.length > 6
    ? [points[0], points[Math.floor(points.length / 2)], last].filter((point): point is ChartPoint => Boolean(point))
    : [first, last];
  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Trend from ${formatDay(first.day)} to ${formatDay(last.day)}`}
    >
      <defs>
        <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridValues.map((value, index) => (
        <g key={index}>
          <line
            x1={paddingX}
            x2={width - paddingX}
            y1={y(value)}
            y2={y(value)}
            stroke="var(--line)"
            strokeDasharray={index === 0 ? undefined : '4 5'}
          />
          <text x={paddingX} y={y(value) - 6} className="chart-grid-label">
            {valueFormatter(value)}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#trend-fill)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={paddingX + (points.length - 1) * step} cy={y(last.value)} r="4.5" fill="var(--surface)" stroke={color} strokeWidth="2.4" />
      {ticks.map((point) => {
        const index = points.indexOf(point);
        return (
          <text
            key={point.day}
            x={paddingX + index * step}
            y={height - 7}
            className="chart-axis-label"
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
          >
            {formatDay(point.day, { month: 'short', day: 'numeric' })}
          </text>
        );
      })}
    </svg>
  );
}

export function FollowerDotPool({
  accounts,
  history,
  today,
}: {
  accounts: readonly Account[];
  history: readonly HistoryPoint[];
  today: string;
}) {
  const rows = accounts
    .map((account) => {
      const series = history
        .filter((point) => point.accountId === account.id && point.followers !== null)
        .sort((left, right) => left.day.localeCompare(right.day));
      const latest = series[series.length - 1];
      const gain = followerGain(history, account.id, today);
      return {
        account,
        followers: latest?.followers ?? 0,
        color: PLATFORM_CHART_COLORS[account.platform],
        gain,
      };
    })
    .filter((row) => row.followers > 0);
  const total = rows.reduce((sum, row) => sum + row.followers, 0);
  const scale = dotScale(total);
  const dots: { color: string; label: string }[] = [];
  for (const row of rows) {
    const count = Math.max(1, Math.round(row.followers / scale));
    for (let index = 0; index < count && dots.length < 240; index += 1) {
      dots.push({
        color: row.color,
        label: `${row.account.displayName}: ${formatCompact(row.followers)} followers`,
      });
    }
  }
  if (!dots.length) {
    return <div className="chart-empty">Follower history will appear after the first collection.</div>;
  }
  return (
    <div className="dot-pool-wrap">
      <div className="dot-pool" role="img" aria-label={`Follower dots for ${rows.length} accounts, ${formatCompact(total)} followers in total`}>
        {dots.map((dot, index) => (
          <span key={index} className="follower-dot" style={{ background: dot.color }} title={dot.label} />
        ))}
      </div>
      <div className="dot-legend">
        {rows.map((row) => (
          <div className="dot-legend-row" key={row.account.id}>
            <span className="dot-key" style={{ background: row.color }} />
            <span className="dot-legend-name">
              {row.account.displayName}
              <small>{PLATFORMS[row.account.platform].label}</small>
            </span>
            <span className="dot-legend-value">{formatCompact(row.followers)}</span>
            <span
              className={cn(
                'dot-legend-gain',
                row.gain.gain !== null && row.gain.gain > 0 ? 'is-up' : row.gain.gain !== null && row.gain.gain < 0 ? 'is-down' : '',
              )}
              title={row.gain.partial ? 'Compared with the earliest available reading' : 'Compared with the last reading on or before 7 days ago'}
            >
              {row.gain.gain === null ? '—' : `${row.gain.gain >= 0 ? '+' : ''}${formatCompact(row.gain.gain)} · 7d`}
            </span>
          </div>
        ))}
      </div>
      <p className="dot-caption">
        1 dot = {formatCompact(scale)} follower{scale === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function dotScale(total: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000];
  for (const step of steps) {
    if (total / step <= 200) return step;
  }
  return 100_000;
}

export function CommunitySparklines({
  history,
  today,
}: {
  history: readonly CommunityHistoryPoint[];
  today: string;
}) {
  const start = addDays(today, -29);
  const points = history.filter((point) => point.day >= start && point.day <= today);
  const metrics = [
    { key: 'topics' as const, label: 'Topics', color: '#0f766e' },
    { key: 'formulas' as const, label: 'Formulas', color: '#b7791f' },
    { key: 'graphs' as const, label: 'Graphs', color: '#2f6f9f' },
    { key: 'animations' as const, label: 'Animations', color: '#9b4d8c' },
  ];
  return (
    <div className="community-sparklines">
      {metrics.map((metric) => {
        const series = points
          .filter((point) => point[metric.key] !== null)
          .map((point) => ({ day: point.day, value: point[metric.key] as number }));
        const latest = series[series.length - 1]?.value ?? null;
        const previous = series[0]?.value ?? null;
        const delta = latest !== null && previous !== null ? latest - previous : null;
        return (
          <div className="community-spark" key={metric.key}>
            <div className="community-spark-head">
              <span>{metric.label}</span>
              <strong>{formatCompact(latest)}</strong>
            </div>
            <Sparkline points={series} color={metric.color} width={160} height={38} fill label={`${metric.label} growth`} />
            <span className={cn('community-spark-delta', delta !== null && delta >= 0 ? 'is-up' : 'is-down')}>
              {delta === null ? 'No history' : `${delta >= 0 ? '+' : ''}${formatCompact(delta)} in 30 days`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PlatformBars({
  breakdown,
}: {
  breakdown: { platform: Platform; accounts: number; followers: number; posts: number }[];
}) {
  const max = Math.max(...breakdown.map((entry) => entry.followers), 1);
  return (
    <div className="platform-bars">
      {breakdown.map((entry) => (
        <div className="platform-bar-row" key={entry.platform}>
          <span className="platform-bar-label">{PLATFORMS[entry.platform].label}</span>
          <div className="platform-bar-track">
            <span
              className="platform-bar-fill"
              style={{
                width: `${Math.max(2, (entry.followers / max) * 100)}%`,
                background: PLATFORM_CHART_COLORS[entry.platform],
              }}
            />
          </div>
          <span className="platform-bar-value">{formatCompact(entry.followers)}</span>
          <span className="platform-bar-meta">
            {entry.accounts} account{entry.accounts === 1 ? '' : 's'}
          </span>
        </div>
      ))}
    </div>
  );
}
