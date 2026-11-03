import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { ENABLED_PLATFORMS, PLATFORMS, type Platform } from '@creator-center/shared';
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
          {ENABLED_PLATFORMS.map((key) => {
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
                </span>
              </button>
            );
          })}
        </div>
        <div className="form-grid">
          <Field label="Display name" required>
            <TextInput
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={platform === 'youtube' ? 'Liam Physics' : 'Account name'}
              maxLength={120}
              autoFocus
            />
          </Field>
          <Field label="Handle">
            <TextInput
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder={platform === 'youtube' ? 'liamphysics' : '@handle'}
            />
          </Field>
          <Field label="Public profile URL">
            <TextInput value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} type="url" placeholder="https://" />
          </Field>
          <Field label="Creator studio URL">
            <TextInput value={studioUrl} onChange={(event) => setStudioUrl(event.target.value)} type="url" placeholder="https://" />
          </Field>
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
