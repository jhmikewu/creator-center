import { useEffect, useRef, useState } from 'react';
import {
  Atom,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Film,
  Info,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  RefreshCw,
  Settings2,
  Sun,
  X,
} from 'lucide-react';
import type { Format, Plan, PlanDraft, Platform } from '@creator-center/shared';
import {
  PLATFORM_ORDER,
  PLATFORMS,
  formatCompact,
  newPlanDraft,
} from '@creator-center/shared';
import { OverviewPage } from './pages/Overview';
import { PlannerPage } from './pages/Planner';
import { CommunityPage } from './pages/Community';
import { MediaPage } from './pages/Media';
import { AboutPage } from './pages/About';
import { SettingsPage } from './pages/Settings';
import { AccountSheet } from './components/AccountSheet';
import { PlanDialog } from './components/PlanDialog';
import { AddAccountDialog } from './components/AddAccountDialog';
import { useRoute, type Route } from './route';
import { useWorkspace, type Scope } from './state';
import { cn, platformLabel } from './utils';
import { AccountAvatar, Badge, Button, IconButton, PlatformMark, StatusDot } from './components/ui';

const NAV: { route: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { route: 'overview', label: 'Overview', icon: LayoutDashboard },
  { route: 'planner', label: 'Content planner', icon: CalendarDays },
  { route: 'community', label: 'Community', icon: MessageSquare },
  { route: 'media', label: 'Media', icon: Film },
];

const SECONDARY: { route: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { route: 'about', label: 'About & to-dos', icon: Info },
  { route: 'settings', label: 'Settings', icon: Settings2 },
];

const ROUTE_LABELS: Record<Route, string> = {
  overview: 'Overview',
  planner: 'Content planner',
  community: 'Community monitor',
  media: 'Media workspace',
  about: 'About & to-dos',
  settings: 'Settings',
};

export function App() {
  const [route, navigate] = useRoute();
  const workspace = useWorkspace();
  const [mobileNav, setMobileNav] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ plan: Plan | null; initial: PlanDraft } | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const accounts = workspace.bootstrap?.accounts ?? [];

  useEffect(() => {
    setMobileNav(false);
  }, [route]);

  function openAccount(id: string) {
    setAccountId(id);
  }

  function newPlan(options: { format?: Format; date?: string | null; platform?: Platform; accountId?: string | null } = {}) {
    setEditor({ plan: null, initial: newPlanDraft(accounts, options) });
  }

  function editPlan(plan: Plan) {
    setEditor({
      plan,
      initial: {
        title: plan.title,
        notes: plan.notes,
        contentType: plan.contentType,
        format: plan.format,
        targets: plan.targets,
        tags: plan.tags,
        scheduledFor: plan.scheduledFor,
        publications: plan.publications.map((publication) => ({
          accountId: publication.accountId,
          postId: publication.postId,
        })),
      },
    });
  }

  const theme = workspace.settings?.theme ?? 'system';
  function cycleTheme() {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    void workspace.saveSettings({ theme: next });
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className={cn('sidebar', mobileNav && 'is-open')} aria-label="Workspace navigation">
        <div className="window-drag-strip" aria-hidden="true" />
        <div className="brand">
          <span className="brand-symbol">
            <Atom size={25} strokeWidth={1.6} />
          </span>
          <div>
            <strong>Creator Center</strong>
            <span>Personal workspace</span>
          </div>
          <IconButton label="Close navigation" className="mobile-close" onClick={() => setMobileNav(false)}>
            <X size={20} />
          </IconButton>
        </div>
        <nav className="nav">
          <span className="nav-label">Workspace</span>
          {NAV.map((item) => (
            <button
              key={item.route}
              className={cn('nav-link', route === item.route && 'is-active')}
              aria-current={route === item.route ? 'page' : undefined}
              onClick={() => navigate(item.route)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {route === item.route && <span className="nav-indicator" />}
            </button>
          ))}
          <span className="nav-label nav-label-secondary">System</span>
          {SECONDARY.map((item) => (
            <button
              key={item.route}
              className={cn('nav-link', route === item.route && 'is-active')}
              aria-current={route === item.route ? 'page' : undefined}
              onClick={() => navigate(item.route)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {route === item.route && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {workspace.settings?.demoMode && (
            <div className="sidebar-demo">
              <Badge tone="warning">Demo workspace</Badge>
              <p>Sample accounts and history. Remove them in Settings.</p>
            </div>
          )}
          <div className="sidebar-status">
            <StatusDot tone={workspace.apiOnline ? 'good' : 'bad'} />
            <span>{workspace.apiOnline ? 'Local data · offline-first' : 'Local server unreachable'}</span>
          </div>
          <div className="sidebar-footer">
            <button className="theme-button" onClick={cycleTheme} title={`Theme: ${theme}`}>
              {theme === 'light' ? <Sun size={16} /> : theme === 'dark' ? <Moon size={16} /> : <Monitor size={16} />}
              <span>{theme === 'system' ? 'System theme' : theme === 'light' ? 'Light theme' : 'Dark theme'}</span>
            </button>
            <span className="version">v{workspace.bootstrap?.version ?? '0.1.0'}</span>
          </div>
        </div>
      </aside>
      {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <IconButton label="Open navigation" className="mobile-menu" onClick={() => setMobileNav(true)}>
              <Menu size={21} />
            </IconButton>
            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{ROUTE_LABELS[route]}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <span className="today-label">
              {new Intl.DateTimeFormat('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                timeZone: 'Asia/Shanghai',
              }).format(new Date())}
            </span>
            <span className="topbar-divider" />
            <ScopeSwitcher />
            <Button
              variant="secondary"
              size="sm"
              className="sync-button"
              onClick={() => void workspace.syncNow()}
              disabled={workspace.sync?.running}
            >
              <RefreshCw size={15} className={workspace.sync?.running ? 'spin' : ''} />
              <span>{workspace.sync?.running ? 'Syncing' : 'Sync now'}</span>
            </Button>
            <button className="topbar-avatar" aria-label="Personal workspace" title="Personal workspace">
              L
            </button>
          </div>
        </header>

        {!workspace.apiOnline && workspace.error && (
          <div className="connection-banner" role="alert">
            <Info size={17} />
            <span>
              The local server is unreachable. {workspace.dashboard ? 'Showing the last loaded snapshot. ' : ''}
              {workspace.error}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void workspace.refresh()}>
              Retry
            </Button>
          </div>
        )}

        <main id="main-content" className="main-content" tabIndex={-1}>
          {!workspace.ready && workspace.loading ? (
            <LoadingSplash />
          ) : route === 'overview' ? (
            <OverviewPage
              onOpenAccount={openAccount}
              onNewPlan={newPlan}
              onEditPlan={editPlan}
              onAddAccount={() => setAddAccountOpen(true)}
            />
          ) : route === 'planner' ? (
            <PlannerPage
              onEditPlan={editPlan}
              onNewPlan={newPlan}
              onAddAccount={() => setAddAccountOpen(true)}
              onOpenAccount={openAccount}
            />
          ) : route === 'community' ? (
            <CommunityPage onSettings={() => navigate('settings')} />
          ) : route === 'media' ? (
            <MediaPage onSettings={() => navigate('settings')} />
          ) : route === 'about' ? (
            <AboutPage />
          ) : (
            <SettingsPage onAddAccount={() => setAddAccountOpen(true)} />
          )}
          <footer className="workspace-footer">
            <span>Private workspace · Asia/Shanghai</span>
            <span>Local SQLite · no telemetry</span>
          </footer>
        </main>
      </div>

      <AccountSheet
        accountId={accountId}
        onClose={() => setAccountId(null)}
        onNewPlan={(accountId) => {
          setAccountId(null);
          newPlan({ platform: accounts.find((account) => account.id === accountId)?.platform, accountId });
        }}
        onAddAccount={() => {
          setAccountId(null);
          setAddAccountOpen(true);
        }}
      />
      {editor && (
        <PlanDialog
          open
          plan={editor.plan}
          initial={editor.initial}
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
          onDeleted={() => setEditor(null)}
        />
      )}
      <AddAccountDialog open={addAccountOpen} onClose={() => setAddAccountOpen(false)} />
      <ToastViewport />
    </div>
  );
}

function ScopeSwitcher() {
  const { dashboard, bootstrap, scope, setScope } = useWorkspace();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const accounts = bootstrap?.accounts ?? [];
  const platforms = PLATFORM_ORDER.filter((platform) => accounts.some((account) => account.platform === platform));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected =
    scope.kind === 'all'
      ? null
      : scope.kind === 'platform'
        ? accounts.find((account) => account.platform === scope.platform) ?? null
        : accounts.find((account) => account.id === scope.accountId) ?? null;
  const label =
    scope.kind === 'all'
      ? 'All accounts'
      : scope.kind === 'platform'
        ? platformLabel(scope.platform)
        : selected?.displayName ?? 'Account';

  function choose(next: Scope) {
    setScope(next);
    setOpen(false);
  }

  return (
    <div className="scope-switcher" ref={container}>
      <button
        className="scope-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {scope.kind === 'account' && selected ? (
          <AccountAvatar name={selected.displayName} platform={selected.platform} size="sm" />
        ) : scope.kind === 'platform' && selected ? (
          <PlatformMark platform={selected.platform} size="sm" />
        ) : (
          <span className="scope-all-mark" aria-hidden="true">
            <span />
            <span />
          </span>
        )}
        <span className="scope-text">
          <small>Scope</small>
          <strong>{label}</strong>
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="scope-menu" role="listbox" aria-label="Choose the account scope">
          <button
            className={cn('scope-option', scope.kind === 'all' && 'is-active')}
            role="option"
            aria-selected={scope.kind === 'all'}
            onClick={() => choose({ kind: 'all' })}
          >
            <span className="scope-all-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <span>
              <strong>All accounts</strong>
              <small>
                {accounts.length} account{accounts.length === 1 ? '' : 's'} · aggregate totals are sums
              </small>
            </span>
          </button>
          {platforms.length > 0 && <span className="scope-group-label">Platforms</span>}
          {platforms.map((platform) => (
            <button
              key={platform}
              className={cn(
                'scope-option',
                scope.kind === 'platform' && scope.platform === platform && 'is-active',
              )}
              role="option"
              aria-selected={scope.kind === 'platform' && scope.platform === platform}
              onClick={() => choose({ kind: 'platform', platform })}
            >
              <PlatformMark platform={platform} size="sm" />
              <span>
                <strong>{PLATFORMS[platform].label}</strong>
                <small>
                  {accounts.filter((account) => account.platform === platform).length} account
                  {accounts.filter((account) => account.platform === platform).length === 1 ? '' : 's'}
                </small>
              </span>
            </button>
          ))}
          {accounts.length > 0 && <span className="scope-group-label">Accounts</span>}
          {accounts.map((account) => (
            <button
              key={account.id}
              className={cn('scope-option', scope.kind === 'account' && scope.accountId === account.id && 'is-active')}
              role="option"
              aria-selected={scope.kind === 'account' && scope.accountId === account.id}
              onClick={() => choose({ kind: 'account', accountId: account.id })}
            >
              <AccountAvatar name={account.displayName} platform={account.platform} size="sm" />
              <span>
                <strong>{account.displayName}</strong>
                <small>
                  {platformLabel(account.platform)} · {formatCompact(account.metrics.find((metric) => metric.key === 'followers')?.value ?? null)} followers
                </small>
              </span>
            </button>
          ))}
          {dashboard && dashboard.scope.kind !== 'all' && (
            <p className="scope-note">Every number on this page is limited to the selected scope.</p>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingSplash() {
  return (
    <div className="loading-splash">
      <span className="brand-symbol">
        <Atom size={34} strokeWidth={1.4} />
      </span>
      <h1>Creator Center</h1>
      <p>Opening the local workspace…</p>
      <span className="loading-line" />
    </div>
  );
}

function ToastViewport() {
  const { notifications, dismiss } = useWorkspace();
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {notifications.map((notification) => (
        <div key={notification.id} className={cn('toast', `toast-${notification.tone}`)} role="status">
          <span>{notification.message}</span>
          <IconButton label="Dismiss" onClick={() => dismiss(notification.id)}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

