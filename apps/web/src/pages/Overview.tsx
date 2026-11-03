import { useMemo } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Layers,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  WifiOff,
} from 'lucide-react';
import type { Account, Format, Plan } from '@creator-center/shared';
import {
  PLATFORMS,
  formatCompact,
  followerGain,
  followerSeries,
  metricByKey,
  relativeToNow,
  relativeUntil,
  todayShanghai,
} from '@creator-center/shared';
import { useWorkspace } from '../state';
import { cn, PLATFORM_CHART_COLORS } from '../utils';
import { Timeline } from '../components/Timeline';
import { CommunitySparklines, FollowerDotPool, PlatformBars, Sparkline } from '../components/charts';
import {
  AccountAvatar,
  Badge,
  Button,
  SectionHeading,
  StatusDot,
} from '../components/ui';

export function OverviewPage({
  onOpenAccount,
  onNewPlan,
  onEditPlan,
  onAddAccount,
}: {
  onOpenAccount: (id: string) => void;
  onNewPlan: (options: { format?: Format; date?: string | null; platform?: Account['platform']; accountId?: string | null }) => void;
  onEditPlan: (plan: Plan) => void;
  onAddAccount: () => void;
}) {
  const { dashboard, settings, sync, loadDemo, notify } = useWorkspace();
  const today = dashboard?.today ?? todayShanghai();
  const accounts = dashboard?.accounts ?? [];
  const history = dashboard?.history ?? [];
  const plans = dashboard?.plans ?? [];
  const posts = dashboard?.posts ?? [];
  const merges = dashboard?.merges ?? [];
  const latest = dashboard?.totals.latestMeasurementAt;
  const community = dashboard?.community;

  const heading = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Asia/Shanghai',
    }).formatToParts(new Date());
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
    const day = parts.find((part) => part.type === 'day')?.value ?? '';
    const month = parts.find((part) => part.type === 'month')?.value ?? '';
    return `${weekday}, ${day} ${month}`.toUpperCase();
  }, []);

  if (accounts.length === 0) {
    return <Onboarding onAddAccount={onAddAccount} onDemo={() => void loadDemo()} notify={notify} settings={settings} />;
  }

  return (
    <div className="page overview-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{heading} · ASIA/SHANGHAI</span>
          <h1>Overview</h1>
          <p>
            {dashboard?.scope.kind === 'all'
              ? 'Every channel, plan and measurement in one place.'
              : `Showing ${accounts.length} account${accounts.length === 1 ? '' : 's'} in this scope.`}
          </p>
        </div>
        <div className="heading-status">
          <span className="measurement-line">
            <StatusDot tone={sync?.error ? 'warn' : 'good'} />
            {sync?.running ? 'Syncing sources…' : latest ? `Latest measurement ${relativeToNow(latest)}` : 'Waiting for the first measurement'}
          </span>
          <span className="heading-caveat">Aggregate totals are sums of the selected accounts; audiences overlap.</span>
        </div>
      </header>

      {settings?.demoMode && (
        <div className="demo-banner">
          <Sparkles size={16} />
          <span>
            You are looking at a demo workspace. The accounts, posts and history are sample data and
            are marked as demo everywhere.
          </span>
        </div>
      )}

      <section className="kpi-band" aria-label="Workspace totals">
        <KpiCard
          icon={<Users size={18} />}
          label="Audience across accounts"
          value={dashboard?.totals.audienceAccounts ? formatCompact(dashboard.totals.audience) : '—'}
          hint={`${dashboard?.totals.audienceAccounts ?? 0} measured account${(dashboard?.totals.audienceAccounts ?? 0) === 1 ? '' : 's'} · not unique people`}
          tone="teal"
        />
        <KpiCard
          icon={<TrendingUp size={18} />}
          label="Follower gain · 7 days"
          value={
            dashboard?.totals.followers7dGain === null || dashboard?.totals.followers7dGain === undefined
              ? '—'
              : `${dashboard.totals.followers7dGain >= 0 ? '+' : ''}${formatCompact(dashboard.totals.followers7dGain)}`
          }
          hint="Compared with the last reading on or before 7 days ago"
          tone="ochre"
        />
        <KpiCard
          icon={<Radio size={18} />}
          label="Published · 60 days"
          value={formatCompact(dashboard?.totals.publishedPosts)}
          hint="Collected posts in the current content window"
          tone="blue"
        />
        <KpiCard
          icon={<CalendarClock size={18} />}
          label="Scheduled"
          value={formatCompact(dashboard?.totals.upcoming)}
          hint="Platform releases from today forward"
          tone="rose"
        />
      </section>

      <div className="overview-columns">
        <div className="overview-main">
          <SectionHeading
            title="Your accounts"
            hint="Each account keeps its own identity, metrics and history."
            action={
              <div className="heading-actions">
                <span className="muted">{accounts.length} in scope · * recent window</span>
                <Button variant="secondary" size="sm" onClick={onAddAccount}>
                  <Plus size={14} /> Add account
                </Button>
              </div>
            }
          />
          <div className="account-grid">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                history={history}
                today={today}
                onOpen={() => onOpenAccount(account.id)}
              />
            ))}
            <button className="add-account-card" onClick={onAddAccount}>
              <span className="add-account-icon">
                <Plus size={20} />
              </span>
              <strong>Add another account</strong>
              <span>Two accounts on the same platform are kept fully separate.</span>
            </button>
          </div>
        </div>

        <aside className="overview-side">
          <section className="panel growth-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-eyebrow">Audience</span>
                <h2>Follower growth</h2>
              </div>
              <Badge tone="neutral">30 days</Badge>
            </div>
            <FollowerDotPool accounts={accounts} history={history} today={today} />
          </section>

          <section className="panel platform-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-eyebrow">Distribution</span>
                <h2>By platform</h2>
              </div>
            </div>
            <PlatformBars breakdown={dashboard?.platformBreakdown ?? []} />
            <p className="panel-footnote">
              Platform figures keep their own definitions and reporting periods. Only the audience total
              is an explicit sum, and it is not unique people.
            </p>
          </section>

          <section className="panel community-mini">
            <div className="panel-heading">
              <div>
                <span className="panel-eyebrow">Liam's Club</span>
                <h2>Community growth</h2>
              </div>
              <span className="community-status">
                <StatusDot tone={community?.snapshot?.status === 'connected' ? 'good' : community?.stale ? 'warn' : 'idle'} />
                {community?.snapshot?.status === 'connected' ? 'Connected' : community?.stale ? 'Stale' : 'Not configured'}
              </span>
            </div>
            <CommunitySparklines history={community?.history ?? []} today={today} />
            <div className="community-mini-footer">
              <span>
                {community?.snapshot?.totals.topics
                  ? `${formatCompact(community.snapshot.totals.topics)} topics · ${formatCompact(community.snapshot.totals.posts)} posts`
                  : 'Add the status endpoint in Settings.'}
              </span>
              <a href="#/community" className="text-link">
                Open monitor <ChevronRight size={13} />
              </a>
            </div>
          </section>
        </aside>
      </div>

      <Timeline
        plans={plans}
        posts={posts}
        accounts={accounts}
        merges={merges}
        today={today}
        onEditPlan={onEditPlan}
        onOpenAccount={onOpenAccount}
        onNewPlan={onNewPlan}
      />

      <section className="freshness-strip">
        <div>
          <RefreshCw size={15} />
          <span>
            {sync?.error
              ? `Last sync: ${sync.error}`
              : sync?.finishedAt
                ? `Last sync finished ${relativeToNow(sync.finishedAt)}`
                : 'No sync has run yet'}
          </span>
        </div>
        <span>{sync?.nextRunAt ? `Next channel sync ${relativeUntil(sync.nextRunAt)}` : 'Sync schedule starts after the first account'}</span>
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: 'teal' | 'ochre' | 'blue' | 'rose';
}) {
  return (
    <div className={cn('kpi-card', `kpi-${tone}`)}>
      <div className="kpi-top">
        <span className="kpi-icon">{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <strong className="kpi-value">{value}</strong>
      <span className="kpi-hint">{hint}</span>
    </div>
  );
}

function AccountCard({
  account,
  history,
  today,
  onOpen,
}: {
  account: Account;
  history: import('@creator-center/shared').HistoryPoint[];
  today: string;
  onOpen: () => void;
}) {
  const series = followerSeries(history, account.id, 30, today);
  const gain = followerGain(history, account.id, today);
  const followers = metricByKey(account, 'followers');
  const views = metricByKey(account, 'views');
  const likes = metricByKey(account, 'likes');
  const posts = metricByKey(account, 'posts');
  const statusTone = account.stale
    ? 'warn'
    : account.status === 'connected'
      ? 'good'
      : account.status === 'error'
        ? 'bad'
        : 'idle';
  const platform = PLATFORMS[account.platform];
  return (
    <button
      className={cn('account-card', `platform-${account.platform}`)}
      onClick={onOpen}
      style={{ '--platform-color': platform.color, '--platform-tint': platform.tint } as React.CSSProperties}
    >
      <div className="account-card-head">
        <AccountAvatar name={account.displayName} platform={account.platform} size="md" />
        <div className="account-card-id">
          <strong>{account.displayName}</strong>
          <span>
            {platform.label}
            {account.handle ? ` · @${account.handle.replace(/^@/, '')}` : ''}
          </span>
        </div>
        <span className="account-card-status">
          <StatusDot tone={statusTone} />
          {account.stale ? 'Stale' : account.status === 'connected' ? 'Connected' : account.status.replaceAll('_', ' ')}
        </span>
      </div>

      <div className="account-card-followers">
        <div>
          <span className="account-metric-label">Followers</span>
          <strong>{followers.availability === 'value' ? formatCompact(followers.value) : followers.availability === 'unsupported' ? 'n/a' : '—'}</strong>
        </div>
        <div className={cn('account-card-gain', gain.gain === null ? 'is-empty' : gain.gain >= 0 ? 'is-up' : 'is-down')}>
          {gain.gain === null ? '—' : `${gain.gain >= 0 ? '+' : ''}${formatCompact(gain.gain)}`}
          <small>7d</small>
        </div>
      </div>

      <div className="account-card-chart">
        <Sparkline points={series} color={PLATFORM_CHART_COLORS[account.platform]} width={230} height={46} fill label={`${account.displayName} follower trend`} />
      </div>

      <div className="account-card-metrics">
        <span>
          <small>Views</small>
          <strong title={`${views.period} · ${views.scope}`}>
            {views.availability === 'value' ? `${formatCompact(views.value)}${views.scope === 'window' ? '*' : ''}` : views.availability === 'unsupported' ? 'n/a' : '—'}
          </strong>
        </span>
        <span>
          <small>Likes</small>
          <strong title={`${likes.period} · ${likes.scope}`}>
            {likes.availability === 'value' ? `${formatCompact(likes.value)}${likes.scope === 'window' ? '*' : ''}` : likes.availability === 'unsupported' ? 'n/a' : '—'}
          </strong>
        </span>
        <span>
          <small>Posts</small>
          <strong title={`${posts.period} · ${posts.scope}`}>
            {posts.availability === 'value' ? `${formatCompact(posts.value)}${posts.scope === 'window' ? '*' : ''}` : posts.availability === 'unsupported' ? 'n/a' : '—'}
          </strong>
        </span>
      </div>

      <div className="account-card-foot">
        <span>
          {account.lastSuccessAt ? `Measured ${relativeToNow(account.lastSuccessAt)}` : 'Not measured yet'}
          {account.isDemo && <Badge tone="warning">Demo</Badge>}
        </span>
        <span className="account-open">
          Open <ArrowUpRight size={14} />
        </span>
      </div>
    </button>
  );
}

function Onboarding({
  onAddAccount,
  onDemo,
  notify,
  settings,
}: {
  onAddAccount: () => void;
  onDemo: () => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
  settings: import('@creator-center/shared').AppSettings | null;
}) {
  return (
    <div className="page onboarding-page">
      <section className="onboarding-hero">
        <div className="onboarding-copy">
          <span className="eyebrow">A LOCAL-FIRST WORKSPACE</span>
          <h1>A calmer command centre for your channels.</h1>
          <p>
            Creator Center keeps every account, plan, post and measurement on this machine. It never
            publishes, likes or comments for you, and it never mixes one account's numbers into another's.
          </p>
          <div className="onboarding-actions">
            <Button onClick={onAddAccount}>
              <Plus size={16} /> Add your first account
            </Button>
            <Button variant="secondary" onClick={onDemo}>
              <Layers size={16} /> Explore the demo workspace
            </Button>
          </div>
          {settings?.demoMode && <p className="muted">A demo workspace is already loaded.</p>}
        </div>
        <div className="onboarding-visual" aria-hidden="true">
          <div className="onboarding-card card-a">
            <span className="mini-platform">抖音</span>
            <strong>128,420</strong>
            <small>followers</small>
            <span className="mini-spark" />
          </div>
          <div className="onboarding-card card-b">
            <span className="mini-platform">Bilibili</span>
            <strong>54,120</strong>
            <small>followers</small>
            <span className="mini-spark is-blue" />
          </div>
          <div className="onboarding-card card-c">
            <span className="mini-platform">YouTube</span>
            <strong>41,300</strong>
            <small>subscribers</small>
            <span className="mini-spark is-red" />
          </div>
          <div className="onboarding-timeline">
            <span>31</span><span>01</span><span>02</span><span className="is-today">03</span><span>04</span>
          </div>
        </div>
      </section>
      <div className="onboarding-steps">
        <Step number="01" icon={<Users size={19} />} title="Connect accounts" body="One or several accounts per platform, each with its own isolated session and id." />
        <Step number="02" icon={<CalendarClock size={19} />} title="Plan and track" body="Plans, tags, calendar dates and publication links. Nothing is published by the app." />
        <Step number="03" icon={<MessageSquare size={19} />} title="Keep the whole picture" body="Follower history, per-post metrics and the community monitor stay in the same workspace." />
      </div>
      <div className="onboarding-note">
        <WifiOff size={16} />
        <span>
          No cloud account, no telemetry and no hosted backend. The core workspace works offline;
          platform refreshes need a connection.
        </span>
        <button type="button" className="text-link" onClick={() => notify('Open Settings to review the data directory and theme.', 'info')}>
          Where is my data?
        </button>
      </div>
    </div>
  );
}

function Step({ number, icon, title, body }: { number: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="onboarding-step">
      <span className="step-number">{number}</span>
      <span className="step-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
