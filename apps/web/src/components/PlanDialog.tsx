import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Link2, Plus, Trash2, X } from 'lucide-react';
import type {
  Account,
  ContentType,
  Format,
  Plan,
  PlanDraft,
  Platform,
} from '@creator-center/shared';
import {
  CONTENT_TYPES,
  CONTENT_TYPE_MAP,
  EXAM_TAG_CHOICES,
  ENABLED_PLATFORMS,
  PLATFORMS,
  TagError,
  applyContentDefaults,
  canonicalTag,
  formatDay,
  postTitle,
  resolveTargetAccounts,
  tagsFromNotes,
} from '@creator-center/shared';
import { useWorkspace } from '../state';
import { cn } from '../utils';
import {
  Button,
  ConfirmDialog,
  Field,
  Modal,
  PlatformMark,
  Segmented,
  Select,
  TextArea,
  TextInput,
} from './ui';

export function PlanDialog({
  open,
  plan,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  plan: Plan | null;
  initial: PlanDraft;
  onClose: () => void;
  onSaved: (plan: Plan) => void;
  onDeleted: (id: string) => void;
}) {
  const { catalog, savePlan, deletePlan, notify } = useWorkspace();
  const accounts = catalog?.accounts ?? [];
  const posts = catalog?.posts ?? [];
  const tags = catalog?.tags ?? [];
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
    setTagInput('');
    setTagError('');
    setError('');
    setFieldErrors({});
    setBusy(false);
    setConfirmDelete(false);
    setConfirmDiscard(false);
  }, [initial, open]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const detected = useMemo(() => tagsFromNotes(draft.notes), [draft.notes]);
  const resolved = useMemo(() => resolveTargetAccounts(draft.targets, accounts), [accounts, draft.targets]);
  const usedTagSuggestions = useMemo(() => {
    const known = tags.map((entry) => entry.tag);
    return [...new Set([...EXAM_TAG_CHOICES.map((entry) => entry.tag), ...known])]
      .filter((tag) => !draft.tags.includes(tag))
      .slice(0, 14);
  }, [draft.tags, tags]);
  const publishedPosts = useMemo(
    () =>
      posts
        .filter((post) => post.status === 'published')
        .sort((left, right) => (right.publishedAt ?? '').localeCompare(left.publishedAt ?? '')),
    [posts],
  );

  function update<K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changeContent(contentType: ContentType) {
    setDraft((current) => applyContentDefaults(current, contentType));
  }

  function setFormat(format: Format) {
    setDraft((current) => ({
      ...current,
      format,
      publications: format === current.format ? current.publications : current.publications,
    }));
  }

  function accountsOnPlatform(platform: Platform): Account[] {
    return accounts.filter((account) => account.platform === platform);
  }

  function isAllPlatform(platform: Platform): boolean {
    return draft.targets.some((target) => target.platform === platform && target.accountId === null);
  }

  function accountSelected(platform: Platform, accountId: string): boolean {
    return (
      isAllPlatform(platform) ||
      draft.targets.some((target) => target.platform === platform && target.accountId === accountId)
    );
  }

  function togglePlatformAll(platform: Platform) {
    setDraft((current) => {
      const without = current.targets.filter((target) => target.platform !== platform);
      if (current.targets.some((target) => target.platform === platform && target.accountId === null)) {
        return { ...current, targets: without };
      }
      return { ...current, targets: [...without, { platform, accountId: null }] };
    });
  }

  function toggleAccount(platform: Platform, accountId: string) {
    setDraft((current) => {
      const all = current.targets.some((target) => target.platform === platform && target.accountId === null);
      const withoutPlatform = current.targets.filter((target) => target.platform !== platform);
      if (all) {
        const specific = accountsOnPlatform(platform)
          .filter((account) => account.id !== accountId)
          .map((account) => ({ platform, accountId: account.id }));
        return { ...current, targets: [...withoutPlatform, ...specific] };
      }
      const existing = current.targets.filter((target) => target.platform === platform);
      const has = existing.some((target) => target.accountId === accountId);
      const next = has
        ? existing.filter((target) => target.accountId !== accountId)
        : [...existing, { platform, accountId }];
      return { ...current, targets: [...withoutPlatform, ...next] };
    });
  }

  function addTargetPlatform(platform: Platform) {
    setDraft((current) => ({
      ...current,
      targets: [...current.targets, { platform, accountId: null }],
    }));
  }

  function addTag(raw: string) {
    const pieces = raw.split(/[,\n]/).map((piece) => piece.trim()).filter(Boolean);
    if (!pieces.length) return;
    const next = [...draft.tags];
    for (const piece of pieces) {
      try {
        const tag = canonicalTag(piece);
        if (!next.includes(tag)) next.push(tag);
      } catch (caught) {
        setTagError(caught instanceof TagError ? caught.message : 'That tag is not valid.');
        continue;
      }
    }
    update('tags', next.slice(0, 30));
    setTagInput('');
  }

  function removeTag(tag: string) {
    update('tags', draft.tags.filter((entry) => entry !== tag));
  }

  function setPublication(accountId: string, postId: string) {
    setDraft((current) => {
      const existing = current.publications.filter((publication) => publication.accountId !== accountId);
      if (!postId) return { ...current, publications: existing };
      return { ...current, publications: [...existing, { accountId, postId }] };
    });
  }

  function requestClose() {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  async function submit() {
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const saved = await savePlan(plan, {
        ...draft,
        title: draft.title.trim(),
        scheduledFor: draft.scheduledFor || null,
        targets: draft.targets,
        publications: draft.publications.filter((publication) =>
          resolved.some((entry) => entry.account.id === publication.accountId),
        ),
      });
      onSaved(saved);
    } catch (caught) {
      const record = caught as { message?: string; fields?: Record<string, string> };
      setError(record.message ?? 'Could not save the plan.');
      setFieldErrors(record.fields ?? {});
    } finally {
      setBusy(false);
    }
  }

  const missingPlatforms = ENABLED_PLATFORMS.filter(
    (platform) =>
      accountsOnPlatform(platform).length > 0 &&
      !draft.targets.some((target) => target.platform === platform),
  );
  const canSave = Boolean(draft.title.trim()) && draft.targets.length > 0 && !busy;

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        title={plan ? 'Edit plan' : 'New plan'}
        eyebrow={plan ? 'Local plan' : 'Private idea'}
        width="xl"
        footer={
          <>
            {plan && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy} className="footer-left">
                <Trash2 size={15} /> Delete
              </Button>
            )}
            <Button variant="secondary" onClick={requestClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={!canSave}>
              {busy ? 'Saving…' : plan ? 'Save plan' : 'Create plan'}
            </Button>
          </>
        }
      >
        <div className="plan-dialog">
          <div className="plan-main">
            <div className="plan-title-row">
              <Field label="Title" required error={fieldErrors.title}>
                <TextInput
                  value={draft.title}
                  onChange={(event) => update('title', event.target.value)}
                  placeholder="What are you making?"
                  maxLength={200}
                  autoFocus
                />
              </Field>
              <Field label="Calendar date" error={fieldErrors.scheduledFor}>
                <div className="date-input-wrap">
                  <CalendarDays size={15} />
                  <TextInput
                    type="date"
                    lang="en-GB"
                    value={draft.scheduledFor ?? ''}
                    onChange={(event) => update('scheduledFor', event.target.value || null)}
                  />
                </div>
              </Field>
            </div>

            <div className="plan-controls-row">
              <Field label="Content type" error={fieldErrors.contentType}>
                <Select value={draft.contentType} onChange={(event) => changeContent(event.target.value as ContentType)}>
                  {CONTENT_TYPES.map((entry) => (
                    <option key={entry.key} value={entry.key}>{entry.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Format" error={fieldErrors.format}>
                <Segmented
                  label="Format"
                  value={draft.format}
                  options={[
                    { value: 'video', label: 'Video' },
                    { value: 'print', label: 'Print' },
                  ]}
                  onChange={setFormat}
                />
              </Field>
            </div>

            <div className="field">
              <div className="targets-head">
                <div>
                  <span className="field-label">Channels and accounts</span>
                </div>
                <span className="target-count">{resolved.length} selected</span>
              </div>
              {draft.targets.length === 0 && <p className="form-error">{fieldErrors.targets ?? 'Choose at least one channel.'}</p>}
              <div className="platform-targets">
                {ENABLED_PLATFORMS.filter(
                  (platform) =>
                    accountsOnPlatform(platform).length > 0 &&
                    draft.targets.some((target) => target.platform === platform),
                ).map((platform) => {
                  const platformAccounts = accountsOnPlatform(platform);
                  const all = isAllPlatform(platform);
                  const any = draft.targets.some((target) => target.platform === platform);
                  return (
                    <div className={cn('platform-target', any && 'is-selected')} key={platform}>
                      <div className="platform-target-head">
                        <PlatformMark platform={platform} size="sm" />
                        <strong>{PLATFORMS[platform].label}</strong>
                        <span className="muted">{platformAccounts.length} account{platformAccounts.length === 1 ? '' : 's'}</span>
                        <label className="switch">
                          <input type="checkbox" checked={all} onChange={() => togglePlatformAll(platform)} />
                          <span />
                          <small>All</small>
                        </label>
                      </div>
                      <div className="account-target-list">
                        {platformAccounts.map((account) => (
                          <label className={cn('account-target', accountSelected(platform, account.id) && 'is-selected')} key={account.id}>
                            <input
                              type="checkbox"
                              checked={accountSelected(platform, account.id)}
                              onChange={() => toggleAccount(platform, account.id)}
                            />
                            <span className="account-target-dot" style={{ background: PLATFORMS[platform].color }} />
                            <span>
                              <strong>{account.displayName}</strong>
                              {account.handle && <small>@{account.handle.replace(/^@/, '')}</small>}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {missingPlatforms.length > 0 && (
                  <div className="add-platform-row">
                    <span>Add another channel</span>
                    {missingPlatforms.map((platform) => (
                      <button key={platform} type="button" onClick={() => addTargetPlatform(platform)}>
                        <Plus size={12} /> {PLATFORMS[platform].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Field label="Notes" hint="Hashtags become tags." error={fieldErrors.notes}>
              <TextArea
                value={draft.notes}
                onChange={(event) => update('notes', event.target.value)}
                placeholder="Outline, references, the hook."
                rows={6}
                maxLength={20_000}
              />
            </Field>

            <div className="field">
              <div className="targets-head">
                <div>
                  <span className="field-label">Tags</span>
                </div>
                <span className="target-count">{draft.tags.length}/30</span>
              </div>
              <div className="tag-editor">
                {draft.tags.map((tag) => (
                  <span className={cn('tag-chip', detected.includes(tag) && 'is-detected')} key={tag}>
                    #{tag}
                    {detected.includes(tag) && <small>from notes</small>}
                    <button type="button" aria-label={`Remove ${tag}`} onClick={() => removeTag(tag)}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <input
                  className="tag-input"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault();
                      addTag(tagInput);
                    }
                    if (event.key === 'Backspace' && !tagInput && draft.tags.length) {
                      removeTag(draft.tags[draft.tags.length - 1] as string);
                    }
                  }}
                  onBlur={() => addTag(tagInput)}
                  placeholder={draft.tags.length ? 'Add another tag…' : 'Add a tag and press Enter'}
                  aria-label="Add a tag"
                />
              </div>
              {tagError && <p className="form-error">{tagError}</p>}
              {usedTagSuggestions.length > 0 && (
                <div className="tag-suggestions">
                  {usedTagSuggestions.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => update('tags', [...draft.tags, tag].slice(0, 30))}
                    >
                      + {EXAM_TAG_CHOICES.find((entry) => entry.tag === tag)?.label ?? tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="plan-side">
            <div className="plan-side-card">
              <div className="plan-side-head">
                <Link2 size={16} />
                <div>
                  <strong>Publication links</strong>
                  <span>Linking never publishes.</span>
                </div>
              </div>
              {resolved.length === 0 ? (
                <p className="muted">Choose a target account first.</p>
              ) : (
                <div className="publication-list">
                  {resolved.map(({ account }) => {
                    const options = publishedPosts.filter((post) => post.accountId === account.id);
                    const publication = draft.publications.find((entry) => entry.accountId === account.id);
                    return (
                      <div className="publication-row" key={account.id}>
                        <div className="publication-account">
                          <PlatformMark platform={account.platform} size="sm" />
                          <span>{account.displayName}</span>
                        </div>
                        {options.length ? (
                          <Select
                            value={publication?.postId ?? ''}
                            onChange={(event) => setPublication(account.id, event.target.value)}
                          >
                            <option value="">Not linked yet</option>
                            {options.map((post) => (
                              <option key={post.id} value={post.id}>
                                {postTitle(post)} · {post.publishedAt ? formatDay(post.publishedAt.slice(0, 10), { month: 'short', day: 'numeric' }) : 'no date'}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <p className="muted">No published posts collected for this account.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="plan-side-card plan-summary-card">
              <span className="eyebrow">At a glance</span>
              <strong>{draft.title || 'Untitled plan'}</strong>
              <p>
                {CONTENT_TYPE_MAP[draft.contentType].label} · {draft.format === 'video' ? 'Video' : 'Print'}
              </p>
              <p>{draft.scheduledFor ? formatDay(draft.scheduledFor, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date · undated idea'}</p>
              <div className="summary-targets">
                {resolved.map(({ account }) => (
                  <span key={account.id}>
                    <PlatformMark platform={account.platform} size="sm" />
                    {account.displayName}
                  </span>
                ))}
              </div>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
          </aside>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        message="The plan draft has changes that have not been saved. Closing now loses them."
        confirmLabel="Discard changes"
        destructive
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this plan?"
        message="The plan, its tags and its publication links are removed. Published posts and platform data are not touched."
        confirmLabel="Delete plan"
        destructive
        busy={busy}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!plan) return;
          setBusy(true);
          void deletePlan(plan.id)
            .then(() => {
              setConfirmDelete(false);
              onDeleted(plan.id);
            })
            .catch((caught) => notify(caught instanceof Error ? caught.message : 'Could not delete the plan.', 'error'))
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}
