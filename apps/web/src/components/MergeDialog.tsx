import { useMemo, useState } from 'react';
import type { Account, Merge, Plan, Post } from '@creator-center/shared';
import { formatCompact, formatDay, postTitle } from '@creator-center/shared';
import { useWorkspace } from '../state';
import { cn } from '../utils';
import { Button, Modal, PlatformMark, Select, TextInput } from './ui';

export function MergeDialog({
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
      description="Merge 2–5 posts; one per account."
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
                    <strong>{postTitle(post)}</strong>
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
                    {postTitle(post)}
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
