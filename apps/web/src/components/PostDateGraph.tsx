import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, Layers, Plus } from 'lucide-react';
import {
  PLATFORMS,
  buildPostDateGraph,
  formatDay,
  mergeTitle,
  postTitle,
  stripHashtags,
} from '@creator-center/shared';
import type {
  Account,
  Format,
  Merge,
  Plan,
  Platform,
  Post,
  PostDateBlock,
} from '@creator-center/shared';
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
const TOOLTIP_WIDTH = 240;

function displayedMergeTitle(merge: Merge, posts: readonly Post[]): string {
  return stripHashtags(mergeTitle(merge, posts)) || 'Untitled post';
}

interface GraphTooltip {
  day: string;
  context: string;
  title: string;
  merged: boolean;
  x: number;
  y: number;
  below: boolean;
}

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
  const [tooltip, setTooltip] = useState<GraphTooltip | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrolled = useRef(false);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });
  const canMerge = posts.length > 1;

  const updateScrollEdges = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const left = element.scrollLeft > 1;
    const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setScrollEdges((current) =>
      current.left === left && current.right === right ? current : { left, right },
    );
  }, []);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || autoScrolled.current) return;
    element.scrollLeft = element.scrollWidth;
    autoScrolled.current = true;
  }, [graph.end, graph.posts]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    updateScrollEdges();
    element.addEventListener('scroll', updateScrollEdges, { passive: true });
    window.addEventListener('resize', updateScrollEdges);
    return () => {
      element.removeEventListener('scroll', updateScrollEdges);
      window.removeEventListener('resize', updateScrollEdges);
    };
  }, [graph.posts, updateScrollEdges]);

  useEffect(() => {
    if (!tooltip) return;
    const hide = () => setTooltip(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [tooltip]);

  function showTooltip(element: HTMLElement, day: string, block: PostDateBlock) {
    const rect = element.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    setTooltip({
      day,
      context: `${PLATFORMS[block.account.platform].label} · ${block.account.displayName}`,
      title: block.merge ? displayedMergeTitle(block.merge, posts) : postTitle(block.post),
      merged: block.merge !== null,
      x: Math.min(Math.max(center, TOOLTIP_WIDTH / 2 + 12), window.innerWidth - TOOLTIP_WIDTH / 2 - 12),
      y: rect.top < 160 ? rect.bottom : rect.top,
      below: rect.top < 160,
    });
  }

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
          <div
            className={cn(
              'post-graph-viewport',
              scrollEdges.left && 'is-scroll-left',
              scrollEdges.right && 'is-scroll-right',
            )}
          >
            <div className="post-graph-scroll" ref={scrollRef}>
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
                        {day.blocks.map((block) => {
                          const { post, account, merge, mergeShade } = block;
                          const title = merge ? displayedMergeTitle(merge, posts) : postTitle(post);
                          const label = `${day.day} · ${PLATFORMS[account.platform].label} · ${account.displayName} · ${title}${merge ? ' · merged group' : ''}`;
                          return (
                            <button
                              key={post.id}
                              type="button"
                              className={cn(
                                'post-graph-block',
                                merge && 'is-merged',
                                merge !== null && `merge-shade-${mergeShade ?? 0}`,
                              )}
                              style={{ '--block-color': PLATFORM_CHART_COLORS[account.platform] } as React.CSSProperties}
                              aria-label={label}
                              onMouseEnter={(event) => showTooltip(event.currentTarget, day.day, block)}
                              onMouseLeave={() => setTooltip(null)}
                              onFocus={(event) => showTooltip(event.currentTarget, day.day, block)}
                              onBlur={() => setTooltip(null)}
                              onClick={() => {
                                setTooltip(null);
                                if (merge) setMergeEditor({ merge });
                                else setPostDetail({ post, account });
                              }}
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
        </div>
        <span className="post-graph-count">
          {graph.posts} post{graph.posts === 1 ? '' : 's'} · {DAYS} days
        </span>
      </footer>

      {tooltip &&
        createPortal(
          <div
            className={cn('post-tooltip', tooltip.below && 'is-below')}
            role="tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <span className="post-tooltip-date">{tooltip.day}</span>
            <span className="post-tooltip-context">{tooltip.context}</span>
            <strong className="post-tooltip-title">{tooltip.title}</strong>
            {tooltip.merged && <span className="post-tooltip-detail">Merged group</span>}
          </div>,
          document.body,
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
