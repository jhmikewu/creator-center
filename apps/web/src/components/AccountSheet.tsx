import { Fragment, useEffect, useState } from 'react';
import {
  ChevronDown,
  ExternalLink,
  Link2,
  LogIn,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  Account,
  MetricKey,
  Plan,
  Post,
} from '@creator-center/shared';
import {
  AVAILABILITY_LABELS,
  METRIC_LABELS,
  METRIC_SHORT_LABELS,
  PLATFORMS,
  addDays,
  followerGain,
  followerSeries,
  formatCompact,
  formatDay,
  formatMetric,
  metricByKey,
  metricDisplay,
  relativeToNow,
  todayShanghai,
} from '@creator-center/shared';
import { useWorkspace } from '../state';
import type { AccountDetail } from '../api';
import { cn, openExternal, PLATFORM_CHART_COLORS, safeHref } from '../utils';
import {
  AccountAvatar,
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  Field,
  Modal,
  PlatformMark,
  Spinner,
  TextInput,
} from './ui';
import { TrendChart } from './charts';
import { PostCalendar } from './PostCalendar';

interface DesktopBridge {
  connectSession?: (payload: {
    accountId: string;
    studioUrl: string | null;
    platform: string;
  }) => Promise<{ ok: boolean; detail?: string }>;
}

export function AccountSheet({
  accountId,
  onClose,
  onNewPlan,
  onAddAccount,
}: {
  accountId: string | null;
  onClose: () => void;
  onNewPlan: (accountId: string) => void;
  onAddAccount: () => void;
}) {
  const { loadAccountDetail, removeAccount, notify, syncNow } = useWorkspace();
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const today = todayShanghai();

  useEffect(() => {
    setShowAllMetrics(false);
    if (!accountId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadAccountDetail(accountId)
      .then((response) => {
        if (!cancelled) setDetail(response);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not open this account.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, loadAccountDetail]);

  const account = detail?.account ?? null;
  const bridge = (window as unknown as { creatorCenter?: DesktopBridge }).creatorCenter;
  const canConnect = Boolean(account && !account.isDemo && account.platform !== 'youtube' && bridge?.connectSession);
  const series = account ? followerSeries(detail?.history ?? [], account.id, 30, today) : [];
  const gain = account ? followerGain(detail?.history ?? [], account.id, today) : null;
  const published = (detail?.posts ?? [])
    .filter((post) => post.status === 'published')
    .filter((post) => !post.publishedAt || post.publishedAt.slice(0, 10) >= addDays(today, -60))
    .sort((left, right) => (right.publishedAt ?? '').localeCompare(left.publishedAt ?? ''));
  const scheduled = (detail?.posts ?? [])
    .filter((post) => post.status === 'scheduled')
    .sort((left, right) => (left.scheduledAt ?? '').localeCompare(right.scheduledAt ?? ''));
  const essentialMetrics: MetricKey[] = ['followers', 'posts', 'likes', 'comments', 'shares'];
  const visibleMetrics = showAllMetrics
    ? (Object.keys(METRIC_LABELS) as MetricKey[])
    : essentialMetrics;

  async function connectAccount() {
    if (!account || !bridge?.connectSession) return;
    setConnecting(true);
    try {
      const result = await bridge.connectSession({
        accountId: account.id,
        studioUrl: account.studioUrl,
        platform: account.platform,
      });
      if (result?.ok) {
        notify('Session saved. Syncing…', 'success');
        await syncNow();
        if (account) setDetail(await loadAccountDetail(account.id));
      } else {
        notify(result?.detail ?? 'The sign-in window closed.', 'info');
      }
    } finally {
      setConnecting(false);
    }
  }

  return (
    <>
      <Drawer
        open={Boolean(accountId)}
        onClose={onClose}
        eyebrow={account ? PLATFORMS[account.platform].label : 'Account'}
        title={account?.displayName ?? (loading ? 'Opening account…' : 'Account')}
        width="wider"
        headerExtra={
          account ? (
            <div className="drawer-quick-actions">
              {account.studioUrl && (
                <Button variant="secondary" size="sm" onClick={() => openExternal(account.studioUrl as string)}>
                  <ExternalLink size={14} /> Studio
                </Button>
              )}
              <Button size="sm" onClick={() => onNewPlan(account.id)}>
                <Plus size={14} /> New plan
              </Button>
            </div>
          ) : null
        }
      >
        {loading && !detail ? (
          <div className="drawer-loading"><Spinner label="Loading account" /></div>
        ) : error ? (
          <div className="drawer-error" role="alert">{error}</div>
        ) : account && detail ? (
          <div className="account-detail">
            <section className="account-hero">
              <AccountAvatar name={account.displayName} platform={account.platform} size="lg" />
              <div className="account-hero-body">
                <div className="account-hero-title">
                  <h3>{account.displayName}</h3>
                  <Badge tone={account.stale ? 'warning' : account.status === 'connected' ? 'success' : account.status === 'error' ? 'danger' : 'neutral'}>
                    {account.stale ? 'Stale' : account.status === 'connected' ? 'Connected' : account.status.replaceAll('_', ' ')}
                  </Badge>
                  {account.isDemo && <Badge tone="warning">Demo</Badge>}
                </div>
                <p>
                  {account.handle ? `@${account.handle.replace(/^@/, '')} · ` : ''}
                  Last measured {relativeToNow(account.lastSuccessAt)}
                </p>
                <p className="account-status-detail">{account.statusDetail}</p>
                <div className="account-hero-actions">
                  {account.profileUrl && (
                    <Button variant="ghost" size="sm" onClick={() => openExternal(account.profileUrl as string)}>
                      <ExternalLink size={14} /> Public profile
                    </Button>
                  )}
                  {canConnect && (
                    <Button variant="ghost" size="sm" onClick={() => void connectAccount()} disabled={connecting}>
                      <LogIn size={14} /> {connecting ? 'Signing in…' : 'Sign in'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                    <Pencil size={14} /> Edit details
                  </Button>
                  <Button variant="ghost" size="sm" className="danger-text" onClick={() => setConfirmRemove(true)}>
                    <Trash2 size={14} /> Remove
                  </Button>
                </div>
              </div>
              <div className="account-hero-calendar">
                <PostCalendar posts={detail.posts} color={PLATFORM_CHART_COLORS[account.platform]} today={today} />
              </div>
              <div className="account-hero-followers">
                <span>Followers</span>
                <strong>{metricDisplay(account, 'followers')}</strong>
                <small className={cn(gain?.gain !== null && gain?.gain !== undefined && gain.gain >= 0 ? 'is-up' : 'is-down')}>
                  {gain?.gain === null || gain?.gain === undefined
                    ? 'No 7-day comparison'
                    : `${gain.gain >= 0 ? '+' : ''}${formatCompact(gain.gain)} in 7 days`}
                </small>
              </div>
            </section>

            <section className="detail-section">
              <div className="detail-section-head">
                <h4>Access and freshness</h4>
              </div>
              <div className="status-grid">
                <div>
                  <span>Session</span>
                  <strong>{account.status.replaceAll('_', ' ')}</strong>
                  <small>{account.statusDetail}</small>
                </div>
                <div>
                  <span>Analytics</span>
                  <strong>{account.analyticsStatus.replaceAll('_', ' ')}</strong>
                  <small>{account.analyticsDetail}</small>
                </div>
                <div>
                  <span>Content collection</span>
                  <strong>{account.contentStatus.replaceAll('_', ' ')}</strong>
                  <small>{account.contentDetail}</small>
                </div>
                <div>
                  <span>Last attempt</span>
                  <strong>{relativeToNow(account.lastAttemptAt)}</strong>
                  <small>Last success {relativeToNow(account.lastSuccessAt)}</small>
                </div>
              </div>
            </section>

            <section className="detail-section">
              <div className="detail-section-head">
                <h4>Follower history</h4>
                <span>90 days retained · 30 days shown</span>
              </div>
              <div className="detail-chart-card">
                <div className="detail-chart-head">
                  <div>
                    <strong>{formatCompact(series[series.length - 1]?.value ?? null)}</strong>
                    <span>followers today</span>
                  </div>
                </div>
                <TrendChart
                  points={series}
                  color={PLATFORM_CHART_COLORS[account.platform]}
                  height={170}
                />
              </div>
            </section>

            <section className="detail-section">
              <div className="detail-section-head metric-detail-head">
                <div>
                  <h4>Account metrics</h4>
                  <span>
                    {showAllMetrics
                      ? 'All 11 metrics · scope, availability, period and source'
                      : 'Essentials · 5 of 11 metrics'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('metric-detail-toggle', showAllMetrics && 'is-open')}
                  aria-expanded={showAllMetrics}
                  onClick={() => setShowAllMetrics((value) => !value)}
                >
                  {showAllMetrics ? 'Show essentials' : 'Show all metrics'}
                  <ChevronDown size={14} />
                </Button>
              </div>
              <div className="metric-table">
                <div className="metric-table-head">
                  <span>Metric</span>
                  <span>Value</span>
                  <span>Scope</span>
                  <span>Period</span>
                  <span>Source</span>
                </div>
                {visibleMetrics.map((key) => {
                  const metric = metricByKey(account, key);
                  return (
                    <div className={cn('metric-row', metric.availability === 'unsupported' && 'is-unsupported')} key={key}>
                      <span className="metric-name">
                        {METRIC_LABELS[key]}
                        {metric.availability !== 'value' && (
                          <Badge tone={metric.availability === 'unsupported' ? 'neutral' : 'warning'}>
                            {AVAILABILITY_LABELS[metric.availability]}
                          </Badge>
                        )}
                      </span>
                      <span className="metric-value">
                        {metric.availability === 'value' ? formatMetric(metric.value, key) : metric.availability === 'unsupported' ? 'n/a' : '—'}
                      </span>
                      <span className="metric-scope">
                        {metric.availability === 'value' ? metric.scope : '—'}
                      </span>
                      <span>{metric.period || '—'}</span>
                      <span className="metric-source">
                        <SourceValue value={metric.source} />
                        {metric.reason && <small>{metric.reason}</small>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="detail-section">
              <div className="detail-section-head">
                <h4>Published content</h4>
                <span>Last 60 days plus today · {published.length} posts</span>
              </div>
              {published.length ? (
                <div className="content-list">
                  {published.slice(0, 12).map((post) => (
                    <ContentRow key={post.id} post={post} account={account} />
                  ))}
                </div>
              ) : (
                <p className="muted">No published posts.</p>
              )}
            </section>

            <section className="detail-section">
              <div className="detail-section-head">
                <h4>Scheduled on the platform</h4>
                <span>{scheduled.length} pending</span>
              </div>
              {scheduled.length ? (
                <div className="content-list">
                  {scheduled.map((post) => (
                    <ContentRow key={post.id} post={post} account={account} pending />
                  ))}
                </div>
              ) : (
                <p className="muted">Nothing scheduled on this platform.</p>
              )}
            </section>

            <section className="detail-section">
              <div className="detail-section-head">
                <h4>Plans targeting this account</h4>
                <span>{detail.plans.length} plans</span>
              </div>
              {detail.plans.length ? (
                <div className="linked-plans">
                  {detail.plans.map((plan) => (
                    <PlanRow key={plan.id} plan={plan} account={account} />
                  ))}
                </div>
              ) : (
                <p className="muted">No plans.</p>
              )}
            </section>

          </div>
        ) : (
          <div className="drawer-loading">
            <p>Account not found.</p>
            <Button variant="secondary" onClick={onAddAccount}>Add account</Button>
          </div>
        )}
      </Drawer>

      {account && (
        <EditAccountDialog
          open={editing}
          account={account}
          onClose={() => setEditing(false)}
        />
      )}
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${account?.displayName ?? 'this account'}?`}
        message={
          <>
            This deletes the local account record, its cached metrics, posts and history. Plans that target all
            accounts on the platform remain. This cannot be undone.
          </>
        }
        confirmLabel="Remove account"
        destructive
        busy={busy}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          if (!account) return;
          setBusy(true);
          void removeAccount(account.id)
            .then(() => {
              setConfirmRemove(false);
              onClose();
            })
            .catch((caught) => notify(caught instanceof Error ? caught.message : 'Could not remove the account.', 'error'))
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}

function SourceValue({ value }: { value: string }) {
  if (!value) return <>—</>;
  const parts = value.split(/(?<=[/_])/);
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </>
  );
}

function ContentRow({ post, account, pending = false }: { post: Post; account: Account; pending?: boolean }) {
  const metrics = Object.entries(post.metrics).filter(([, value]) => value !== null && value !== undefined);
  return (
    <div className={cn('content-row', pending && 'is-pending')}>
      <div className="content-row-main">
        <PlatformMark platform={account.platform} size="sm" />
        <div>
          <strong>{post.title || 'Untitled post'}</strong>
          <span>
            {pending
              ? `Scheduled ${post.scheduledAt ? formatDay(post.scheduledAt.slice(0, 10), { month: 'short', day: 'numeric' }) : ''}`
              : post.publishedAt
                ? formatDay(post.publishedAt.slice(0, 10), { month: 'short', day: 'numeric' })
                : 'Date unknown'}
          </span>
        </div>
      </div>
      <div className="content-row-metrics">
        {pending ? (
          <Badge tone="info">Pending</Badge>
        ) : metrics.length ? (
          metrics.slice(0, 4).map(([key, value]) => (
            <span key={key}>
              <small>{METRIC_SHORT_LABELS[key as MetricKey] ?? key.replaceAll('_', ' ')}</small>
              <strong>{formatMetric(value as number, key as MetricKey)}</strong>
            </span>
          ))
        ) : (
          <span className="muted">No metrics</span>
        )}
      </div>
      {post.url && safeHref(post.url) && (
        <a className="content-row-link" href={safeHref(post.url)} target="_blank" rel="noreferrer" aria-label={`Open ${post.title} on the platform`}>
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

function PlanRow({ plan, account }: { plan: Plan; account: Account }) {
  const linked = plan.publications.find((publication) => publication.accountId === account.id);
  return (
    <div className="linked-plan-row">
      <div>
        <strong>{plan.title}</strong>
        <span>
          {plan.scheduledFor ? formatDay(plan.scheduledFor, { month: 'short', day: 'numeric' }) : 'Undated idea'}
          {linked ? ' · linked to a collected post' : ' · not linked yet'}
        </span>
      </div>
      <div className="linked-plan-tags">
        {plan.tags.slice(0, 3).map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      {linked && <Link2 size={14} className="muted" />}
    </div>
  );
}

function EditAccountDialog({
  open,
  account,
  onClose,
}: {
  open: boolean;
  account: Account;
  onClose: () => void;
}) {
  const { updateAccount } = useWorkspace();
  const [displayName, setDisplayName] = useState(account.displayName);
  const [handle, setHandle] = useState(account.handle ?? '');
  const [profileUrl, setProfileUrl] = useState(account.profileUrl ?? '');
  const [studioUrl, setStudioUrl] = useState(account.studioUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDisplayName(account.displayName);
    setHandle(account.handle ?? '');
    setProfileUrl(account.profileUrl ?? '');
    setStudioUrl(account.studioUrl ?? '');
    setError('');
  }, [account, open]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await updateAccount(account.id, {
        displayName,
        handle: handle || null,
        profileUrl: profileUrl || null,
        studioUrl: studioUrl || null,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit account details"
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy || !displayName.trim()}>
            {busy ? 'Saving…' : 'Save details'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Display name" required>
          <TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} />
        </Field>
        <Field label="Handle">
          <TextInput value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="liamphysics" />
        </Field>
        <Field label="Public profile URL">
          <TextInput value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} type="url" placeholder="https://" />
        </Field>
        <Field label="Creator studio URL">
          <TextInput value={studioUrl} onChange={(event) => setStudioUrl(event.target.value)} type="url" placeholder="https://" />
        </Field>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  );
}
