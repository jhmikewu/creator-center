import { useEffect, useState } from 'react';
import { Info, Layers } from 'lucide-react';
import { PLATFORM_ORDER, PLATFORMS, type Platform } from '@creator-center/shared';
import { useWorkspace } from '../state';
import { cn } from '../utils';
import { Button, Field, Modal, PlatformMark, TextInput } from './ui';

export function AddAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addAccount, loadDemo, settings, bootstrap } = useWorkspace();
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [profileUrl, setProfileUrl] = useState('');
  const [studioUrl, setStudioUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPlatform('douyin');
    setDisplayName('');
    setHandle('');
    setProfileUrl('');
    setStudioUrl('');
    setError('');
  }, [open]);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await addAccount({
        platform,
        displayName,
        handle: handle || null,
        profileUrl: profileUrl || null,
        studioUrl: studioUrl || null,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add the account.');
    } finally {
      setBusy(false);
    }
  }

  async function demo() {
    setBusy(true);
    try {
      await loadDemo();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the demo workspace.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add an account"
      eyebrow="Multiple accounts per platform"
      description="Each account gets its own id, display name, metrics, posts and history. Nothing is ever merged into a platform-wide bucket."
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || !displayName.trim()}>
            {busy ? 'Adding…' : 'Add account'}
          </Button>
        </>
      }
    >
      <div className="add-account">
        <div className="platform-choice" role="radiogroup" aria-label="Platform">
          {PLATFORM_ORDER.map((key) => {
            const info = PLATFORMS[key];
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={platform === key}
                className={cn('platform-choice-card', platform === key && 'is-active')}
                onClick={() => setPlatform(key)}
              >
                <PlatformMark platform={key} size="md" />
                <span>
                  <strong>{info.label}</strong>
                  <small>{info.access}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="form-grid">
          <Field label="Display name" required hint="How this account is identified in the workspace.">
            <TextInput
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={platform === 'youtube' ? 'Liam Physics' : 'Account name'}
              maxLength={120}
              autoFocus
            />
          </Field>
          <Field label="Handle" hint="Optional. Used for the public profile link where the platform supports it.">
            <TextInput
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder={platform === 'youtube' ? 'liamphysics' : '@handle'}
            />
          </Field>
          <Field label="Public profile URL" hint="Optional; leave blank to use the platform default.">
            <TextInput value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} type="url" placeholder="https://" />
          </Field>
          <Field label="Creator studio URL" hint="Opened from the account view. A sensible default is filled when blank.">
            <TextInput value={studioUrl} onChange={(event) => setStudioUrl(event.target.value)} type="url" placeholder="https://" />
          </Field>
        </div>
        <div className="info-callout">
          <Info size={17} />
          <div>
            <strong>Collection is the next increment.</strong>
            <p>
              This build creates the account record and the per-account data model. The embedded
              signed-in browser session, the four browser collectors and the YouTube OAuth flow are
              the next piece of work; a real account shows its setup state until then.
            </p>
          </div>
        </div>
        {!settings?.demoMode && (bootstrap?.accounts.length ?? 0) === 0 && (
          <button type="button" className="demo-link" onClick={() => void demo()} disabled={busy}>
            <Layers size={15} /> Load the demo workspace instead
          </button>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
