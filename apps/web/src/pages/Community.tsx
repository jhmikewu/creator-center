import { useState } from 'react';
import {
  ExternalLink,
  FileText,
  GitGraph,
  MessageSquare,
  RefreshCw,
  Server,
  Timer,
  Waves,
} from 'lucide-react';
import {
  formatCompact,
  formatDateTime,
  relativeToNow,
  relativeUntil,
  type DiscourseCountKey,
  type WorkerHealth,
} from '@creator-center/shared';
import { api } from '../api';
import { useWorkspace } from '../state';
import { cn } from '../utils';
import { CommunitySparklines } from '../components/charts';
import { Badge, Button, EmptyState, StatusDot } from '../components/ui';

const COUNT_ROWS: { key: DiscourseCountKey; label: string; hint?: string }[] = [
  { key: 'topics', label: 'Topics' },
  { key: 'posts', label: 'Posts' },
  { key: 'words', label: 'Words' },
  { key: 'formulas', label: 'Formulas', hint: 'LaTeX' },
  { key: 'images', label: 'Images' },
  { key: 'graphs', label: 'Graphs', hint: 'Rendered' },
  { key: 'animations', label: 'Animations', hint: 'Manim' },
  { key: 'videos', label: 'Videos' },
];

export function CommunityPage({ onSettings }: { onSettings: () => void }) {
  const { dashboard, refresh, notify, settings } = useWorkspace();
  const community = dashboard?.community;
  const snapshot = community?.snapshot ?? null;
  const today = dashboard?.today ?? new Date().toISOString().slice(0, 10);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshCommunity() {
    setRefreshing(true);
    try {
      await api.refreshCommunity();
      await refresh({ quiet: true });
      notify('Community status refreshed.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not refresh the community status.', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="page community-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">LIAM'S CLUB · DISCOURSE</span>
          <h1>Community monitor</h1>
          <p>The forum's catalogue, workers and publishing pipeline, kept separate from platform analytics.</p>
        </div>
        <div className="heading-actions">
          <Button
            variant="secondary"
            onClick={() => void refreshCommunity()}
            disabled={refreshing || !community?.configured}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing' : 'Refresh status'}
          </Button>
          <Button variant="ghost" onClick={onSettings}>
            Configure endpoint
          </Button>
        </div>
      </header>

      {!snapshot ? (
        <EmptyState
          icon={<MessageSquare size={28} />}
          title="No community snapshot yet"
          message={
            community?.configured
              ? 'The configured status endpoint has not returned a snapshot yet. Refresh it, or check the endpoint in Settings.'
              : 'Add the forum status endpoint in Settings to see connectivity, catalogue counts and worker health here.'
          }
          action={<Button onClick={onSettings}>Open Settings</Button>}
        />
      ) : (
        <>
          <section className="community-status-panel">
            <div className="community-status-main">
              <span className={cn('status-orb', snapshot.status === 'connected' ? 'is-good' : 'is-bad')}>
                <Waves size={24} />
              </span>
              <div>
                <div className="community-status-title">
                  <h2>{snapshot.status === 'connected' ? 'Status feed connected' : 'Status feed unavailable'}</h2>
                  <Badge tone={snapshot.status === 'connected' ? 'success' : 'danger'}>
                    {snapshot.status === 'connected' ? 'Connected' : 'Error'}
                  </Badge>
                  {community?.stale && <Badge tone="warning">Stale</Badge>}
                </div>
                <p>
                  {snapshot.endpoint.startsWith('demo://')
                    ? 'Sample source · the demo workspace uses local sample data.'
                    : snapshot.endpoint}
                </p>
              </div>
            </div>
            <div className="community-status-facts">
              <Fact label="Reachable" value={snapshot.reachable ? 'Yes' : 'No'} good={snapshot.reachable} />
              <Fact label="Authenticated" value={snapshot.authenticated ? 'Yes' : 'No'} good={snapshot.authenticated} />
              <Fact label="Latency" value={snapshot.latencyMs === null ? '—' : `${snapshot.latencyMs} ms`} good={snapshot.latencyMs !== null && snapshot.latencyMs < 800} />
              <Fact label="Catalogue" value={snapshot.catalogueStatus} good={snapshot.catalogueComplete && !snapshot.catalogueStale} />
              <Fact label="Source date" value={snapshot.sourceDate} good />
              <Fact label="Captured" value={relativeToNow(snapshot.capturedAt)} good />
            </div>
            {snapshot.error && <p className="community-error">{snapshot.error}</p>}
          </section>

          <div className="community-grid">
            <section className="panel community-counts">
              <div className="panel-heading">
                <div>
                  <span className="panel-eyebrow">Catalogue</span>
                  <h2>Content totals</h2>
                </div>
                <span className="muted">Same source date · not a rolling estimate</span>
              </div>
              <div className="counts-table">
                <div className="counts-head">
                  <span>Measure</span>
                  <span>All time</span>
                  <span>24 hours</span>
                  <span>7 days</span>
                </div>
                {COUNT_ROWS.map((row) => (
                  <div className="counts-row" key={row.key}>
                    <span className="counts-label">
                      {row.label}
                      {row.hint && <small>{row.hint}</small>}
                    </span>
                    <strong>{formatCompact(snapshot.totals[row.key])}</strong>
                    <span>{formatCompact(snapshot.last24Hours[row.key])}</span>
                    <span>{formatCompact(snapshot.last7Days[row.key])}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel community-growth">
              <div className="panel-heading">
                <div>
                  <span className="panel-eyebrow">History</span>
                  <h2>Forum growth</h2>
                </div>
                <Badge tone="neutral">30 days</Badge>
              </div>
              <CommunitySparklines history={community?.history ?? []} today={today} />
              <p className="panel-footnote">
                Only connected, complete, non-stale catalogue readings become history points. A failed
                refresh keeps the last good snapshot.
              </p>
            </section>
          </div>

          <section className="panel community-workers">
            <div className="panel-heading">
              <div>
                <span className="panel-eyebrow">Health</span>
                <h2>Workers and timers</h2>
              </div>
              <span className="muted">{snapshot.workers.length} services reported</span>
            </div>
            <div className="worker-grid">
              {snapshot.workers.map((worker) => (
                <WorkerCard key={worker.unit} worker={worker} />
              ))}
              {snapshot.workers.length === 0 && (
                <p className="muted">The status feed did not include worker health.</p>
              )}
            </div>
          </section>

          <div className="community-grid community-management">
            <ManagementCard
              icon={<MessageSquare size={18} />}
              title="Mention jobs"
              available={snapshot.mentionJobs.available}
              rows={[
                ['Total', formatCompact(snapshot.mentionJobs.total)],
                ['Retryable', formatCompact(snapshot.mentionJobs.retryable)],
                ...Object.entries(snapshot.mentionJobs.byStatus).slice(0, 4).map(([key, value]) => [key, String(value)] as [string, string]),
              ]}
            />
            <ManagementCard
              icon={<GitGraph size={18} />}
              title="Graphs and animations"
              available={snapshot.drawings.available}
              rows={[
                ['Tracked posts', formatCompact(snapshot.drawings.trackedPosts)],
                ['Published graphs', formatCompact(snapshot.drawings.publishedGraphs)],
                ['Published animations', formatCompact(snapshot.drawings.publishedAnimations)],
              ]}
            />
            <ManagementCard
              icon={<FileText size={18} />}
              title="PDF resources"
              available={snapshot.pdfs.available}
              rows={[
                ['Tracked topics', formatCompact(snapshot.pdfs.trackedTopics)],
                ['Published', formatCompact(snapshot.pdfs.published)],
                ['Pending', formatCompact(snapshot.pdfs.pending)],
              ]}
            />
            <section className="panel community-help">
              <span className="panel-eyebrow">How to read this</span>
              <h3>Connected is not the same as healthy.</h3>
              <p>
                A reachable status feed can still report a degraded worker. The badge above describes
                the feed; each worker card keeps its own state.
              </p>
              <a className="text-link" href={settings?.communityEndpoint || '#/settings'} onClick={(event) => { if (!settings?.communityEndpoint) { event.preventDefault(); onSettings(); } }}>
                Status endpoint <ExternalLink size={12} />
              </a>
            </section>
          </div>

          <section className="panel community-meta">
            <div>
              <span className="panel-eyebrow">Last snapshot</span>
              <strong>{formatDateTime(snapshot.capturedAt)}</strong>
              <span>Source date {snapshot.sourceDate}</span>
            </div>
            <div>
              <span className="panel-eyebrow">History retained</span>
              <strong>{community?.history.length ?? 0} days</strong>
              <span>Kept when the feed is unavailable</span>
            </div>
            <div>
              <span className="panel-eyebrow">Configuration</span>
              <strong>{community?.configured ? 'Configured' : 'Not configured'}</strong>
              <span>{community?.endpoint || 'No endpoint set'}</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Fact({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="status-fact">
      <span>{label}</span>
      <strong className={good ? 'is-good' : 'is-warn'}>
        <StatusDot tone={good ? 'good' : 'warn'} /> {value}
      </strong>
    </div>
  );
}

function WorkerCard({ worker }: { worker: WorkerHealth }) {
  const tone = worker.health === 'healthy' ? 'success' : worker.health === 'degraded' ? 'warning' : 'neutral';
  return (
    <article className="worker-card">
      <div className="worker-head">
        <span className={cn('worker-icon', worker.kind === 'timer' && 'is-timer')}>
          {worker.kind === 'timer' ? <Timer size={16} /> : <Server size={16} />}
        </span>
        <Badge tone={tone}>{worker.health}</Badge>
      </div>
      <strong>{worker.label}</strong>
      <p>{worker.description}</p>
      <div className="worker-facts">
        <span>State <strong>{worker.state}</strong></span>
        {worker.lastRun && <span>Last run <strong>{relativeToNow(worker.lastRun)}</strong></span>}
        {worker.nextRun && <span>Next run <strong>{relativeUntil(worker.nextRun)}</strong></span>}
      </div>
      <span className="worker-unit">{worker.unit}</span>
      {worker.statusText && <p className="worker-status">{worker.statusText}</p>}
    </article>
  );
}

function ManagementCard({
  icon,
  title,
  available,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  available: boolean;
  rows: [string, string][];
}) {
  return (
    <section className="panel management-card">
      <div className="management-head">
        <span className="management-icon">{icon}</span>
        <h3>{title}</h3>
        <Badge tone={available ? 'success' : 'neutral'}>{available ? 'Available' : 'Not reported'}</Badge>
      </div>
      <div className="management-rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
