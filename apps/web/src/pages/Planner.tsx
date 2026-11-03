import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Filter,
  Link2,
  Plus,
  Search,
  Tag,
  X,
} from 'lucide-react';
import type { Format, Plan, Platform } from '@creator-center/shared';
import {
  CONTENT_TYPE_MAP,
  EXAM_TAG_CHOICES,
  PLATFORMS,
  PLATFORM_ORDER,
  dayDistance,
  formatDay,
  planStatus,
  resolveTargetAccounts,
  todayShanghai,
} from '@creator-center/shared';
import { useWorkspace } from '../state';
import { cn } from '../utils';
import {
  Badge,
  Button,
  EmptyState,
  PlatformMark,
  Select,
  TextInput,
} from '../components/ui';

type StatusFilter = 'all' | 'published' | 'upcoming' | 'idea';

export function PlannerPage({
  onEditPlan,
  onNewPlan,
  onAddAccount,
  onOpenAccount,
}: {
  onEditPlan: (plan: Plan) => void;
  onNewPlan: (options: { format?: Format; date?: string | null; platform?: Platform; accountId?: string | null }) => void;
  onAddAccount: () => void;
  onOpenAccount: (id: string) => void;
}) {
  const { catalog, scope, setScope } = useWorkspace();
  const plans = catalog?.items ?? [];
  const accounts = catalog?.accounts ?? [];
  const tagCatalogue = catalog?.tags ?? [];
  const today = todayShanghai();
  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const scopeFiltered = useMemo(() => {
    if (scope.kind === 'all') return plans;
    return plans.filter((plan) =>
      plan.targets.some((target) =>
        scope.kind === 'account'
          ? target.accountId === scope.accountId
          : target.platform === scope.platform,
      ),
    );
  }, [plans, scope]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scopeFiltered
      .filter((plan) => {
        if (platformFilter !== 'all' && !plan.targets.some((target) => target.platform === platformFilter)) {
          return false;
        }
        if (accountFilter !== 'all') {
          const resolved = resolveTargetAccounts(plan.targets, accounts);
          if (!resolved.some(({ account }) => account.id === accountFilter)) return false;
        }
        if (tagFilter && !plan.tags.includes(tagFilter)) return false;
        const status = planStatus(plan);
        if (statusFilter === 'published' && status !== 'published') return false;
        if (statusFilter === 'upcoming' && (status !== 'planned' || !plan.scheduledFor || plan.scheduledFor < today)) return false;
        if (statusFilter === 'idea' && status !== 'idea') return false;
        if (needle) {
          const haystack = `${plan.title} ${plan.notes} ${plan.tags.join(' ')}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((left, right) => {
        if (!left.scheduledFor && !right.scheduledFor) return left.title.localeCompare(right.title);
        if (!left.scheduledFor) return 1;
        if (!right.scheduledFor) return -1;
        return left.scheduledFor.localeCompare(right.scheduledFor);
      });
  }, [accountFilter, accounts, platformFilter, query, scopeFiltered, statusFilter, tagFilter, today]);

  const ideas = filtered.filter((plan) => planStatus(plan) === 'idea');
  const dated = filtered.filter((plan) => planStatus(plan) !== 'idea');
  const activeFilters = [platformFilter !== 'all', accountFilter !== 'all', Boolean(tagFilter), statusFilter !== 'all'].filter(Boolean).length;
  const linked = plans.filter((plan) => plan.publications.length > 0).length;
  const thisMonth = plans.filter((plan) => plan.scheduledFor?.startsWith(today.slice(0, 7))).length;

  function clearFilters() {
    setQuery('');
    setPlatformFilter('all');
    setAccountFilter('all');
    setTagFilter(null);
    setStatusFilter('all');
  }

  if (accounts.length === 0) {
    return (
      <div className="page planner-page">
        <PageHeading onNewPlan={() => onNewPlan({})} />
        <EmptyState
          icon={<CalendarDays size={28} />}
          title="Add an account to start planning"
          message="Add an account or load the demo workspace."
          action={<Button onClick={onAddAccount}><Plus size={16} /> Add account</Button>}
        />
      </div>
    );
  }

  return (
    <div className="page planner-page">
      <header className="page-heading">
        <div>
          <h1>Content planner</h1>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" onClick={() => onNewPlan({ format: 'print' })}>
            <Tag size={15} /> New text guide
          </Button>
          <Button onClick={() => onNewPlan({})}>
            <Plus size={16} /> New plan
          </Button>
        </div>
      </header>

      <section className="planner-stats" aria-label="Planner summary">
        <div><span>All plans</span><strong>{plans.length}</strong></div>
        <div><span>Upcoming</span><strong>{plans.filter((plan) => plan.scheduledFor && plan.scheduledFor >= today && !plan.publications.length).length}</strong></div>
        <div><span>Linked</span><strong>{linked}</strong></div>
        <div><span>This month</span><strong>{thisMonth}</strong></div>
      </section>

      <div className="planner-layout">
        <section className="panel planner-main">
          <div className="planner-toolbar">
            <div className="search-field">
              <Search size={16} />
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search titles, notes and tags"
                aria-label="Search plans"
              />
              {query && (
                <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="planner-filters">
              <Select
                aria-label="Filter by platform"
                value={platformFilter}
                onChange={(event) => setPlatformFilter(event.target.value as Platform | 'all')}
              >
                <option value="all">All platforms</option>
                {PLATFORM_ORDER.map((platform) => (
                  <option key={platform} value={platform}>{PLATFORMS[platform].label}</option>
                ))}
              </Select>
              <Select
                aria-label="Filter by account"
                value={accountFilter}
                onChange={(event) => setAccountFilter(event.target.value)}
              >
                <option value="all">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.displayName} · {PLATFORMS[account.platform].label}</option>
                ))}
              </Select>
              <Select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="all">All statuses</option>
                <option value="published">Linked / published</option>
                <option value="upcoming">Dated upcoming</option>
                <option value="idea">Undated ideas</option>
              </Select>
              {activeFilters > 0 && (
                <button className="clear-filters" onClick={clearFilters}>
                  <Filter size={13} /> Clear {activeFilters}
                </button>
              )}
            </div>
          </div>

          <div className="planner-scope-note">
            <span>
              {scope.kind === 'all' ? 'Showing every account' : scope.kind === 'platform' ? `Showing ${PLATFORMS[scope.platform].label} only` : 'Showing one account'}
            </span>
            {scope.kind !== 'all' && (
              <button className="text-link" onClick={() => setScope({ kind: 'all' })}>Show all accounts</button>
            )}
            <span className="planner-count">{filtered.length} plan{filtered.length === 1 ? '' : 's'}</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={26} />}
              title={plans.length === 0 ? 'No plans yet' : 'No plans match these filters'}
              message={plans.length === 0 ? 'Start a new plan.' : 'Clear a filter or start a new plan.'}
              action={plans.length === 0 ? undefined : <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <div className="plan-list">
              {dated.length > 0 && (
                <div className="plan-list-section">
                  <div className="plan-list-head">
                    <span>Date</span>
                    <span>Plan</span>
                    <span>Targets</span>
                    <span>Status</span>
                  </div>
                  {dated.map((plan) => (
                    <PlanListRow
                      key={plan.id}
                      plan={plan}
                      accounts={accounts}
                      today={today}
                      onEdit={() => onEditPlan(plan)}
                      onOpenAccount={onOpenAccount}
                    />
                  ))}
                </div>
              )}
              {ideas.length > 0 && (
                <div className="plan-list-section ideas-section">
                  <div className="plan-list-head">
                    <span>Undated</span>
                    <span>Idea</span>
                    <span>Targets</span>
                    <span>Status</span>
                  </div>
                  {ideas.map((plan) => (
                    <PlanListRow
                      key={plan.id}
                      plan={plan}
                      accounts={accounts}
                      today={today}
                      onEdit={() => onEditPlan(plan)}
                      onOpenAccount={onOpenAccount}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="planner-side">
          <section className="panel tag-catalogue">
            <div className="panel-heading">
              <div>
                <span className="panel-eyebrow">Catalogue</span>
                <h2>Tags</h2>
              </div>
              {tagFilter && (
                <button className="text-link" onClick={() => setTagFilter(null)}>Clear</button>
              )}
            </div>
            <div className="tag-cloud">
              {tagCatalogue.length === 0 && <p className="muted">Tags appear here as plans use them.</p>}
              {tagCatalogue.map((entry) => (
                <button
                  key={entry.tag}
                  className={cn('tag-pill', tagFilter === entry.tag && 'is-active')}
                  onClick={() => setTagFilter(tagFilter === entry.tag ? null : entry.tag)}
                  title={`${entry.count} plan${entry.count === 1 ? '' : 's'}`}
                >
                  {EXAM_TAG_CHOICES.find((choice) => choice.tag === entry.tag)?.label ?? entry.tag}
                  <span>{entry.count}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel planner-tip">
            <CheckCircle2 size={18} />
            <div>
              <strong>Publication links are records, not actions.</strong>
              <p>Edit a plan to link a collected post.</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function PageHeading({ onNewPlan }: { onNewPlan: () => void }) {
  return (
    <header className="page-heading">
      <div>
        <h1>Content planner</h1>
      </div>
      <Button onClick={onNewPlan}><Plus size={16} /> New plan</Button>
    </header>
  );
}

function PlanListRow({
  plan,
  accounts,
  today,
  onEdit,
  onOpenAccount,
}: {
  plan: Plan;
  accounts: import('@creator-center/shared').Account[];
  today: string;
  onEdit: () => void;
  onOpenAccount: (id: string) => void;
}) {
  const status = planStatus(plan);
  const resolved = resolveTargetAccounts(plan.targets, accounts);
  const linked = plan.publications.length;
  const date = plan.scheduledFor ?? plan.publications[0]?.publishedAt?.slice(0, 10) ?? null;
  const relative =
    date && date >= today && dayDistance(date, today) <= 14
      ? `in ${dayDistance(date, today)} day${dayDistance(date, today) === 1 ? '' : 's'}`
      : date && date < today
        ? `${dayDistance(today, date)} days ago`
        : null;
  return (
    <button className={cn('plan-row', status === 'idea' && 'is-idea')} onClick={onEdit}>
      <div className="plan-row-date">
        {date ? (
          <>
            <span>{formatDay(date, { month: 'short' })}</span>
            <strong>{formatDay(date, { day: '2-digit' })}</strong>
            <small>{formatDay(date, { weekday: 'short' })}</small>
          </>
        ) : (
          <span className="idea-date">Idea</span>
        )}
      </div>
      <div className="plan-row-main">
        <div className="plan-row-title">
          <strong>{plan.title}</strong>
          {linked > 0 && <Badge tone="success"><Link2 size={11} /> {linked} linked</Badge>}
        </div>
        {plan.notes && <p>{plan.notes.replace(/#[^\s#]+/g, '').trim().slice(0, 140)}</p>}
        <div className="plan-row-meta">
          <span>{CONTENT_TYPE_MAP[plan.contentType].shortLabel}</span>
          <span>{plan.format === 'video' ? 'Video' : 'Print'}</span>
          {plan.tags.slice(0, 4).map((tag) => (
            <span className="plan-tag" key={tag}>#{tag}</span>
          ))}
          {relative && <span className="plan-relative">{relative}</span>}
        </div>
      </div>
      <div className="plan-row-targets">
        {resolved.length === 0 ? (
          <span className="muted">No live target</span>
        ) : (
          resolved.map(({ account }) => (
            <span
              key={account.id}
              className="target-pill"
              role="button"
              tabIndex={0}
              title={`Open ${account.displayName}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenAccount(account.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.stopPropagation();
                  onOpenAccount(account.id);
                }
              }}
            >
              <PlatformMark platform={account.platform} size="sm" />
              {account.displayName}
            </span>
          ))
        )}
      </div>
      <div className="plan-row-status">
        <Badge tone={status === 'published' ? 'success' : status === 'idea' ? 'neutral' : 'accent'}>
          {status === 'published' ? 'Published' : status === 'idea' ? 'Idea' : date && date < today ? 'Overdue' : 'Planned'}
        </Badge>
        {plan.publications[0]?.publishedAt && (
          <small>{formatDay(plan.publications[0].publishedAt.slice(0, 10), { month: 'short', day: 'numeric' })}</small>
        )}
      </div>
    </button>
  );
}
