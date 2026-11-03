import { useMemo, useState } from 'react';
import { CalendarPlus, Layers, Plus } from 'lucide-react';
import {
  PLATFORMS,
  buildPostDateGraph,
  formatDay,
  mergeTitle,
} from '@creator-center/shared';
import type { Account, Format, Merge, Plan, Platform, Post } from '@creator-center/shared';
import { useWorkspace } from '../state';
import { cn, PLATFORM_CHART_COLORS } from '../utils';
import { PostDetailModal } from './PostDetail';
import { MergeDialog } from './MergeDialog';
import { Button, ConfirmDialog, EmptyState } from './ui';

interface PostDateGraphProps {
  plans: Plan[];
  posts: Post[];
  accounts: Account[];
  merges: Merge[];
  today: string;
  onOpenAccount: (id: string) => void;
  onNewPlan: (options: {
    date?: string | null;
    format?: Format;
    platform?: Platform;
    accountId?: string | null;
  }) => void;
}

const DAYS = 30;

export function PostDateGraph({
  plans,
  posts,
  accounts,
  merges,
  today,
  onOpenAccount,
  onNewPlan,
}: PostDateGraphProps) {
  const { deleteMerge, notify } = useWorkspace();
  const graph = useMemo(
    () => buildPostDateGraph({ accounts, posts, merges, today, days: DAYS }),
    [accounts, posts, merges, today],
  );
  const [postDetail, setPostDetail] = useState<{ post: Post; account: Account } | null>(null);
  const [mergeEditor, setMergeEditor] = useState<{ merge: Merge | null } | null>(null);
  const [mergeToDelete, setMergeToDelete] = useState<Merge | null>(null);
  const [busy, setBusy] = useState(false);
  const canMerge = posts.length > 1;

  return (
    <section className="panel post-graph-panel" aria-labelledby="post-graph-heading">
      <header className="post-graph-header">
        <div>
          <div className="section-kicker">
            <span className="kicker-line" />
            Publishing
          </div>
          <h2 id="post-graph-heading">Posts by date</h2>
        </div>
        <div className="post-graph-actions">
          <Button variant="secondary" size="sm" onClick={() => setMergeEditor({ merge: null })} disabled={!canMerge}>
            <Layers size={15} /> Merge posts
          </Button>
          <Button size="sm" onClick={() => onNewPlan({ date: today })}>
            <Plus size={15} /> New plan
          </Button>
        </div>
      </header>

      <div className="post-graph-body">
        {graph.posts === 0 ? (
          <EmptyState
            icon={<CalendarPlus size={24} />}
            title="No published posts in the last 30 days"
            message="Collected posts appear here as they arrive."
          />
        ) : (
          <div className="post-graph-scroll">
            <div
              className="post-graph"
              role="group"
              aria-label={`Published posts from ${formatDay(graph.start)} to ${formatDay(graph.end)}: ${graph.posts} posts`}
              style={{ '--post-graph-days': graph.days.length } as React.CSSProperties}
            >
              {graph.days.map((day, index) => {
                const date = new Date(`${day.day}T00:00:00.000Z`);
                const monthMark =
                  index === 0 || day.day.endsWith('-01') ? formatDay(day.day, { month: 'short' }) : '';
                return (
                  <div
                    key={day.day}
                    className={cn('post-graph-day', day.day === today && 'is-today')}
                  >
                    <span className="post-graph-month">{monthMark}</span>
                    <div className="post-graph-stack">
                      {day.blocks.map(({ post, account, merge }) => {
                        const title = merge ? mergeTitle(merge, posts) : post.title || 'Untitled post';
                        const label = `${formatDay(day.day, { weekday: 'short', month: 'short', day: 'numeric' })} · ${PLATFORMS[account.platform].label} · ${account.displayName} · ${title}${merge ? ' · merged group' : ''}`;
                        return (
                          <button
                            key={post.id}
                            type="button"
                            className={cn('post-graph-block', merge && 'is-merged')}
                            style={{ '--block-color': PLATFORM_CHART_COLORS[account.platform] } as React.CSSProperties}
                            aria-label={label}
                            title={label}
                            onClick={() =>
                              merge
                                ? setMergeEditor({ merge })
                                : setPostDetail({ post, account })
                            }
                          />
                        );
                      })}
                    </div>
                    <span className="post-graph-date">
                      {String(date.getUTCDate()).padStart(2, '0')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <footer className="post-graph-foot">
        <div className="post-graph-legend">
          {graph.platforms.map((platform) => (
            <span className="post-graph-legend-item" key={platform}>
              <span className="post-graph-swatch" style={{ background: PLATFORM_CHART_COLORS[platform] }} />
              {PLATFORMS[platform].label}
            </span>
          ))}
          {graph.mergedGroups > 0 && (
            <span className="post-graph-legend-item">
              <span className="post-graph-swatch is-merged" style={{ background: 'var(--ink-soft)' }} />
              Merged
            </span>
          )}
        </div>
        <span className="post-graph-count">
          {graph.posts} post{graph.posts === 1 ? '' : 's'} · {DAYS} days
        </span>
      </footer>

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
        message="The posts will appear as separate blocks again. The posts themselves are not changed."
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
