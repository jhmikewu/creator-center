import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  ChevronRight,
  GripVertical,
  Layers,
  Link2,
  Plus,
  Sparkles,
} from 'lucide-react';
import type {
  Account,
  Format,
  Merge,
  Plan,
  PlanDraft,
  Platform,
  Post,
} from '@creator-center/shared';
import {
  CONTENT_TYPE_MAP,
  PLATFORMS,
  addDays,
  buildTimelineModel,
  defaultTimelineWindow,
  formatCompact,
  formatDay,
  formatMetric,
  formatTime,
  platformInfo,
  todayShanghai,
  type TimelineDay,
  type TimelineItem,
  type TimelineMergeItem,
  type TimelinePlanItem,
  type TimelinePostItem,
  type TimelineScheduledItem,
  type MetricKey,
} from '@creator-center/shared';
import { useWorkspace } from '../state';
import { cn } from '../utils';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Modal,
  PlatformMark,
  Select,
  TextInput,
} from './ui';

interface TimelineProps {
  plans: Plan[];
  posts: Post[];
  accounts: Account[];
  merges: Merge[];
  today?: string;
  onEditPlan: (plan: Plan) => void;
  onOpenAccount: (id: string) => void;
  onNewPlan: (options: { date?: string | null; format?: Format; platform?: Platform; accountId?: string | null }) => void;
}

export function Timeline({
  plans,
  posts,
  accounts,
  merges,
  today = todayShanghai(),
  onEditPlan,
  onOpenAccount,
  onNewPlan,
}: TimelineProps) {
  const { savePlan, notify, deleteMerge } = useWorkspace();
  const [start, setStart] = useState(() => defaultTimelineWindow(today).start);
  const days = 15;
  const [dragPlan, setDragPlan] = useState<Plan | null>(null);
  const [postDetail, setPostDetail] = useState<{ post: Post; account: Account } | null>(null);
  const [mergeEditor, setMergeEditor] = useState<{ merge: Merge | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeToDelete, setMergeToDelete] = useState<Merge | null>(null);

  const model = useMemo(
    () => buildTimelineModel({ accounts, posts, plans, merges, today }),
    [accounts, posts, plans, merges, today],
  );
  const range = useMemo(
    () =>
      Array.from({ length: days }, (_, index) => {
        const day = addDays(start, index);
        return model.day(day);
      }),
    [days, model, start],
  );
  const rangeLabel = `${formatDay(start, { month: 'short', day: 'numeric' })} – ${formatDay(
    addDays(start, days - 1),
    { month: 'short', day: 'numeric' },
  )}`;

  useEffect(() => {
    if (!dragPlan) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDragPlan(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dragPlan]);

  async function reschedule(plan: Plan, date: string) {
    if (plan.publications.length) {
      notify('A plan with publication links stays on its publication date. Remove the link first.', 'error');
      return;
    }
    if (plan.scheduledFor === date) return;
    const draft: PlanDraft = {
      title: plan.title,
      notes: plan.notes,
      contentType: plan.contentType,
      format: plan.format,
      targets: plan.targets,
      tags: plan.tags,
      scheduledFor: date,
      publications: plan.publications.map((publication) => ({
        accountId: publication.accountId,
        postId: publication.postId,
      })),
    };
    try {
      await savePlan(plan, draft);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not move the plan.', 'error');
    }
  }

  function moveWithKeyboard(plan: Plan, delta: number) {
    const base = plan.scheduledFor ?? today;
    const next = addDays(base, delta);
    if (next === plan.scheduledFor) return;
    void reschedule(plan, next);
  }

  const canMerge = posts.length > 1;
  const recentIdeas = model.ideas.slice(0, 6);

  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-heading">
      <header className="timeline-header">
        <div>
          <div className="section-kicker">
            <span className="kicker-line" />
            Publishing timeline
          </div>
          <h2 id="timeline-heading">Plans and releases</h2>
          <p>Plans, published posts and platform-scheduled releases in Asia/Shanghai.</p>
        </div>
        <div className="timeline-actions">
          <div className="timeline-window">
            <IconButton label="Previous week" onClick={() => setStart((value) => addDays(value, -7))}>
              <ArrowLeft size={16} />
            </IconButton>
            <button className="window-label" onClick={() => setStart(defaultTimelineWindow(today).start)} title="Return to today">
              {rangeLabel}
            </button>
            <IconButton label="Next week" onClick={() => setStart((value) => addDays(value, 7))}>
              <ArrowRight size={16} />
            </IconButton>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setMergeEditor({ merge: null })} disabled={!canMerge}>
            <Layers size={15} /> Merge posts
          </Button>
          <Button size="sm" onClick={() => onNewPlan({ date: today })}>
            <Plus size={15} /> New plan
          </Button>
        </div>
      </header>

      <div className="timeline-calendar-wrap">
        <div className="timeline-calendar">
          <div className="timeline-calendar-head" aria-hidden="true">
            <div className="timeline-date-head">Date</div>
            <div className="timeline-lane-head">
              <span className="lane-dot lane-video" /> Video
            </div>
            <div className="timeline-lane-head">
              <span className="lane-dot lane-print" /> Print
            </div>
          </div>
          {range.map((day) => (
            <TimelineDayRow
              key={day.day}
              day={day}
              today={today}
              onEditPlan={onEditPlan}
              onOpenPost={(post, account) => setPostDetail({ post, account })}
              onOpenMerge={(merge) => setMergeEditor({ merge })}
              onNewPlan={onNewPlan}
              dragPlan={dragPlan}
              onDragStart={setDragPlan}
              onDrop={(date) => {
                if (dragPlan) void reschedule(dragPlan, date);
                setDragPlan(null);
              }}
              onKeyboardMove={moveWithKeyboard}
            />
          ))}
        </div>
      </div>

      {(recentIdeas.length > 0 || model.undatedPosts.length > 0) && (
        <div className="timeline-ideas">
          <div className="ideas-heading">
            <Sparkles size={16} />
            <strong>Undated ideas</strong>
            <span>Keep the spark, give it a date later.</span>
          </div>
          <div className="ideas-list">
            {recentIdeas.map((plan) => (
              <button key={plan.id} className="idea-chip" onClick={() => onEditPlan(plan)}>
                <PlatformMark platform={plan.targets[0]?.platform ?? 'bilibili'} size="sm" />
                <span>{plan.title}</span>
                <ChevronRight size={13} />
              </button>
            ))}
            {model.undatedPosts.slice(0, 3).map(({ post }) => (
              <span key={post.id} className="idea-chip is-static">
                <Link2 size={13} />
                <span>{post.title}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {accounts.length === 0 && (
        <EmptyState
          icon={<CalendarPlus size={26} />}
          title="No accounts yet"
          message="Add an account or load the demo workspace to see plans, publications and scheduled posts here."
          action={
            <Button variant="secondary" onClick={() => onNewPlan({})}>
              Start with a plan
            </Button>
          }
        />
      )}

      <PostDetailModal
        detail={postDetail}
        onClose={() => setPostDetail(null)}
        onOpenAccount={(id) => {
          setPostDetail(null);
          onOpenAccount(id);
        }}
      />
      {mergeEditor && (
        <MergeDialog
          merge={mergeEditor.merge}
          posts={posts}
          accounts={accounts}
          merges={merges}
          plans={plans}
          busy={busy}
          setBusy={setBusy}
          onClose={() => setMergeEditor(null)}
          onDelete={(merge) => setMergeToDelete(merge)}
        />
      )}
      <ConfirmDialog
        open={Boolean(mergeToDelete)}
        title="Unmerge these posts?"
        message="The posts will appear separately on the timeline again. The posts themselves are not changed."
        confirmLabel="Unmerge"
        destructive
        busy={busy}
        onClose={() => setMergeToDelete(null)}
        onConfirm={() => {
          if (!mergeToDelete) return;
          setBusy(true);
          void deleteMerge(mergeToDelete.id)
            .then(() => {
              setMergeToDelete(null);
              setMergeEditor(null);
            })
            .catch((error) => notify(error instanceof Error ? error.message : 'Could not remove the merge.', 'error'))
            .finally(() => setBusy(false));
        }}
      />
    </section>
  );
}

function TimelineDayRow({
  day,
  today,
  dragPlan,
  onEditPlan,
  onOpenPost,
  onOpenMerge,
  onNewPlan,
  onDragStart,
  onDrop,
  onKeyboardMove,
}: {
  day: TimelineDay;
  today: string;
  dragPlan: Plan | null;
  onEditPlan: (plan: Plan) => void;
  onOpenPost: (post: Post, account: Account) => void;
  onOpenMerge: (merge: Merge) => void;
  onNewPlan: (options: { date?: string | null; format?: Format }) => void;
  onDragStart: (plan: Plan) => void;
  onDrop: (date: string) => void;
  onKeyboardMove: (plan: Plan, delta: number) => void;
}) {
  const [overLane, setOverLane] = useState<'video' | 'print' | null>(null);
  const video = day.items.filter((item) => item.lane === 'video');
  const print = day.items.filter((item) => item.lane === 'print');
  const isToday = day.day === today;
  const date = new Date(`${day.day}T00:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(date);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(date);
  return (
    <div className={cn('timeline-day', isToday && 'is-today')}>
      <div className="timeline-date">
        <span className="date-weekday">{weekday}</span>
        <span className="date-number">{String(date.getUTCDate()).padStart(2, '0')}</span>
        <span className="date-month">{month}</span>
        {isToday && <span className="today-chip">Today</span>}
      </div>
      {(['video', 'print'] as const).map((lane) => {
        const items = lane === 'video' ? video : print;
        return (
          <div
            key={lane}
            className={cn('timeline-lane', overLane === lane && 'is-drop-target')}
            onDragOver={(event) => {
              if (!dragPlan) return;
              event.preventDefault();
              setOverLane(lane);
            }}
            onDragLeave={() => setOverLane((current) => (current === lane ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setOverLane(null);
              onDrop(day.day);
            }}
          >
            <div className="lane-stack">
              {items.map((item) => (
                <TimelineCard
                  key={item.key}
                  item={item}
                  onEditPlan={onEditPlan}
                  onOpenPost={onOpenPost}
                  onOpenMerge={onOpenMerge}
                  onDragStart={onDragStart}
                  onKeyboardMove={onKeyboardMove}
                />
              ))}
            </div>
            <button
              className="lane-add"
              aria-label={`Add a ${lane} plan on ${formatDay(day.day)}`}
              onClick={() => onNewPlan({ date: day.day, format: lane === 'video' ? 'video' : 'print' })}
            >
              <Plus size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function TimelineCard({
  item,
  onEditPlan,
  onOpenPost,
  onOpenMerge,
  onDragStart,
  onKeyboardMove,
}: {
  item: TimelineItem;
  onEditPlan: (plan: Plan) => void;
  onOpenPost: (post: Post, account: Account) => void;
  onOpenMerge: (merge: Merge) => void;
  onDragStart: (plan: Plan) => void;
  onKeyboardMove: (plan: Plan, delta: number) => void;
}) {
  if (item.kind === 'plan') {
    return <PlanCard item={item} onEditPlan={onEditPlan} onDragStart={onDragStart} onKeyboardMove={onKeyboardMove} />;
  }
  if (item.kind === 'merge') {
    return <MergeCard item={item} onOpenMerge={onOpenMerge} />;
  }
  return <PostCard item={item} onOpenPost={onOpenPost} />;
}

function PlanCard({
  item,
  onEditPlan,
  onDragStart,
  onKeyboardMove,
}: {
  item: TimelinePlanItem;
  onEditPlan: (plan: Plan) => void;
  onDragStart: (plan: Plan) => void;
  onKeyboardMove: (plan: Plan, delta: number) => void;
}) {
  const pinned = item.plan.publications.length > 0;
  const linked = item.targets.filter((target) => target.linkedPost);
  const metrics = linked[0]?.linkedPost?.metrics;
  return (
    <article
      className={cn('timeline-card plan-card', pinned && 'is-pinned')}
      tabIndex={0}
      role="button"
      draggable={!pinned}
      aria-label={`Plan ${item.plan.title}${pinned ? ', pinned to a publication date' : ''}`}
      onClick={() => onEditPlan(item.plan)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEditPlan(item.plan);
        }
        if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault();
          onKeyboardMove(item.plan, event.key === 'ArrowUp' ? -1 : 1);
        }
      }}
      onDragStart={(event) => {
        if (pinned) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(item.plan);
      }}
      title={
        pinned
          ? 'Pinned to a publication date. Open the plan to edit its target links.'
          : 'Drag to reschedule, or focus and press Alt+Up/Down.'
      }
    >
      <div className="card-top">
        <span className="card-kind">{CONTENT_TYPE_MAP[item.plan.contentType].shortLabel}</span>
        {pinned ? <Badge tone="success">Published</Badge> : <Badge tone="accent">Planned</Badge>}
        {!pinned && <GripVertical size={13} className="drag-grip" aria-hidden="true" />}
      </div>
      <strong className="card-title">{item.plan.title}</strong>
      <div className="card-targets">
        {item.targets.map((target) => (
          <span key={target.account.id} className="target-chip" title={`${target.account.displayName} · ${PLATFORMS[target.account.platform].label}`}>
            <PlatformMark platform={target.account.platform} size="sm" />
            <span>{target.account.displayName}</span>
            {target.linkedPost && <Link2 size={10} />}
          </span>
        ))}
      </div>
      <div className="card-meta">
        {metrics ? (
          <>
            <span>{formatCompact(metrics.views)} views</span>
            <span>{formatCompact(metrics.likes)} likes</span>
          </>
        ) : (
          <span>{item.plan.tags.length ? item.plan.tags.slice(0, 2).map((tag) => `#${tag}`).join(' ') : 'No tags yet'}</span>
        )}
      </div>
    </article>
  );
}

function PostCard({
  item,
  onOpenPost,
}: {
  item: TimelinePostItem | TimelineScheduledItem;
  onOpenPost: (post: Post, account: Account) => void;
}) {
  const pending = item.kind === 'scheduled';
  const metrics = item.post.metrics;
  return (
    <article
      className={cn('timeline-card post-card', pending && 'is-scheduled')}
      tabIndex={0}
      role="button"
      aria-label={`${pending ? 'Scheduled post' : 'Published post'} ${item.post.title}`}
      onClick={() => onOpenPost(item.post, item.account)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenPost(item.post, item.account);
        }
      }}
    >
      <div className="card-top">
        <PlatformMark platform={item.account.platform} size="sm" />
        <span className="card-account">{item.account.displayName}</span>
        {pending ? <Badge tone="info">Scheduled</Badge> : <span className="post-time">{formatTime(item.post.publishedAt)}</span>}
      </div>
      <strong className="card-title">{item.post.title || 'Untitled post'}</strong>
      <div className="card-meta">
        {pending ? (
          <span>Scheduled for {formatTime(item.post.scheduledAt)}</span>
        ) : (
          <>
            <span>{formatCompact(metrics.views)} views</span>
            <span>{formatCompact(metrics.likes)} likes</span>
            <span>{formatCompact(metrics.comments)} comments</span>
          </>
        )}
      </div>
    </article>
  );
}

function MergeCard({ item, onOpenMerge }: { item: TimelineMergeItem; onOpenMerge: (merge: Merge) => void }) {
  const color = platformInfo(item.members[0]?.account.platform ?? 'bilibili').color;
  return (
    <article
      className="timeline-card merge-card"
      tabIndex={0}
      role="button"
      style={{ '--merge-color': color } as CSSProperties}
      aria-label={`Merged post ${item.title} with ${item.members.length} accounts`}
      onClick={() => onOpenMerge(item.merge)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenMerge(item.merge);
        }
      }}
    >
      <div className="card-top">
        <Badge tone="neutral">
          <Layers size={11} /> Merged · {item.members.length}
        </Badge>
        <span className="merge-date">{item.members.some((member) => member.post.status === 'scheduled') ? 'Scheduled' : 'Published'}</span>
      </div>
      <strong className="card-title">{item.title}</strong>
      <div className="merge-members">
        {item.members.map(({ post, account }) => (
          <div className="merge-member" key={post.id}>
            <PlatformMark platform={account.platform} size="sm" />
            <span className="merge-account">{account.displayName}</span>
            <span className="merge-stat">
              {post.status === 'scheduled' ? 'pending' : `${formatCompact(post.metrics.views)} views`}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function PostDetailModal({
  detail,
  onClose,
  onOpenAccount,
}: {
  detail: { post: Post; account: Account } | null;
  onClose: () => void;
  onOpenAccount: (id: string) => void;
}) {
  if (!detail) return null;
  const metrics = Object.entries(detail.post.metrics).filter(([, value]) => value !== null && value !== undefined);
  const pending = detail.post.status === 'scheduled';
  return (
    <Modal
      open
      onClose={onClose}
      title={detail.post.title || 'Untitled post'}
      eyebrow={`${PLATFORMS[detail.account.platform].label} · ${detail.account.displayName}`}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => onOpenAccount(detail.account.id)}>Open account</Button>
        </>
      }
    >
      <div className="post-detail">
        <div className="post-detail-meta">
          <Badge tone={pending ? 'info' : 'success'}>{pending ? 'Scheduled' : 'Published'}</Badge>
          <span>
            {pending
              ? `Releases ${detail.post.scheduledAt ? formatDay(detail.post.scheduledAt.slice(0, 10), { month: 'short', day: 'numeric' }) : 'soon'} at ${formatTime(detail.post.scheduledAt)}`
              : `${detail.post.publishedAt ? formatDay(detail.post.publishedAt.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown date'} at ${formatTime(detail.post.publishedAt)}`}
          </span>
          {detail.post.url && (
            <a href={detail.post.url} target="_blank" rel="noreferrer">
              Open on platform
            </a>
          )}
        </div>
        {pending ? (
          <p className="muted">The platform has this post scheduled. Statistics arrive once it is live.</p>
        ) : metrics.length ? (
          <div className="metric-chip-grid">
            {metrics.map(([key, value]) => (
              <div className="metric-chip" key={key}>
                <span>{key.replaceAll('_', ' ')}</span>
                <strong>{formatMetric(value as number, key as MetricKey)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No per-post statistics were returned for this post.</p>
        )}
        <p className="subtle-note">
          Collected {formatDay(detail.post.collectedAt.slice(0, 10), { month: 'short', day: 'numeric' })}. A post can
          leave the 60-day window while its plan link stays intact.
        </p>
      </div>
    </Modal>
  );
}

function MergeDialog({
  merge,
  posts,
  accounts,
  merges,
  plans,
  busy,
  setBusy,
  onClose,
  onDelete,
}: {
  merge: Merge | null;
  posts: Post[];
  accounts: Account[];
  merges: Merge[];
  plans: Plan[];
  busy: boolean;
  setBusy: (value: boolean) => void;
  onClose: () => void;
  onDelete: (merge: Merge) => void;
}) {
  const { saveMerge, notify } = useWorkspace();
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const alreadyMerged = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of merges) {
      if (entry.id === merge?.id) continue;
      for (const member of entry.members) ids.add(member.postId);
    }
    return ids;
  }, [merge?.id, merges]);
  const linkedPostIds = useMemo(() => {
    const ids = new Set<string>();
    for (const plan of plans) for (const publication of plan.publications) ids.add(publication.postId);
    return ids;
  }, [plans]);
  const available = useMemo(
    () =>
      posts
        .filter((post) => !alreadyMerged.has(post.id) && !linkedPostIds.has(post.id))
        .filter((post) => accountById.has(post.accountId)),
    [accountById, alreadyMerged, linkedPostIds, posts],
  );
  const [selected, setSelected] = useState<string[]>(
    () => merge?.members.map((member) => member.postId) ?? [],
  );
  const [customTitle, setCustomTitle] = useState(merge?.customTitle ?? '');
  const [titleFrom, setTitleFrom] = useState<string>(merge?.titleFrom?.postId ?? '');
  const [error, setError] = useState('');
  const selectedPosts = selected
    .map((id) => available.find((post) => post.id === id) ?? posts.find((post) => post.id === id))
    .filter((post): post is Post => Boolean(post));
  const byAccount = selectedPosts.reduce<Record<string, number>>((counts, post) => {
    counts[post.accountId] = (counts[post.accountId] ?? 0) + 1;
    return counts;
  }, {});
  const duplicateAccount = Object.values(byAccount).some((count) => count > 1);
  const canSave = selected.length >= 2 && selected.length <= 5 && !duplicateAccount;

  function toggle(post: Post) {
    setSelected((current) => {
      if (current.includes(post.id)) return current.filter((id) => id !== post.id);
      if (current.length >= 5) {
        notify('A merge holds at most five posts.', 'error');
        return current;
      }
      const sameAccount = current.some((id) => {
        const candidate = posts.find((entry) => entry.id === id);
        return candidate?.accountId === post.accountId;
      });
      if (sameAccount) {
        notify('Choose at most one post per account.', 'error');
        return current;
      }
      return [...current, post.id];
    });
  }

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await saveMerge(merge, {
        members: selectedPosts.map((post) => ({ accountId: post.accountId, postId: post.id })),
        customTitle: customTitle.trim(),
        titleFrom: !customTitle.trim() && titleFrom
          ? {
              accountId: selectedPosts.find((post) => post.id === titleFrom)?.accountId,
              postId: titleFrom,
            }
          : null,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the merge.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={merge ? 'Edit merged posts' : 'Merge cross-posted content'}
      eyebrow="One card, separate statistics"
      description="Merge 2–5 collected posts that carry the same content, at most one per account."
      width="lg"
      footer={
        <>
          {merge && (
            <Button variant="danger" onClick={() => onDelete(merge)} disabled={busy} className="footer-left">
              Unmerge
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSave || busy}>
            {busy ? 'Saving…' : merge ? 'Save merge' : 'Merge posts'}
          </Button>
        </>
      }
    >
      <div className="merge-dialog">
        <div className="merge-picker">
          {available.length === 0 ? (
            <p className="muted">No unmerged posts are available in the current collection window.</p>
          ) : (
            available.map((post) => {
              const account = accountById.get(post.accountId);
              if (!account) return null;
              const checked = selected.includes(post.id);
              return (
                <label className={cn('merge-option', checked && 'is-checked')} key={post.id}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(post)} />
                  <PlatformMark platform={account.platform} size="sm" />
                  <span className="merge-option-body">
                    <strong>{post.title || 'Untitled post'}</strong>
                    <small>
                      {account.displayName} · {post.status === 'scheduled' ? 'scheduled' : formatDay(post.publishedAt?.slice(0, 10) ?? '', { month: 'short', day: 'numeric' })} · {formatCompact(post.metrics.views)} views
                    </small>
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="merge-settings">
          <label className="field">
            <span>Card title</span>
            <TextInput
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
              placeholder="Leave blank to use one post's title"
              maxLength={200}
            />
          </label>
          {!customTitle.trim() && selectedPosts.length > 1 && (
            <label className="field">
              <span>Use the title from</span>
              <Select value={titleFrom} onChange={(event) => setTitleFrom(event.target.value)}>
                <option value="">First post with a title</option>
                {selectedPosts.map((post) => (
                  <option key={post.id} value={post.id}>
                    {post.title || 'Untitled post'}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <div className="merge-summary">
            <strong>{selected.length} selected</strong>
            <span>{duplicateAccount ? 'One post per account only.' : 'Statistics stay separate on the card.'}</span>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
