import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  Check,
  Clipboard,
  Database,
  FolderOpen,
  HardDrive,
  Layers,
  RefreshCw,
  Server,
  Sparkles,
  Trash2,
  Type,
  UserPlus,
} from 'lucide-react';
import type { AppSettings, MigrationPreview, MigrationResult } from '@creator-center/shared';
import { formatDateTime, relativeUntil } from '@creator-center/shared';
import { api } from '../api';
import { useWorkspace } from '../state';
import { cn } from '../utils';
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Segmented,
  StatusDot,
  TextInput,
} from '../components/ui';

const FONT_SCALES: { value: number; label: string; hint: string }[] = [
  { value: 1, label: 'Compact', hint: 'Fits smaller screens' },
  { value: 1.12, label: 'Comfortable', hint: 'Recommended' },
  { value: 1.3, label: 'Large', hint: 'Easier reading' },
];

export function SettingsPage({ onAddAccount }: { onAddAccount: () => void }) {
  const {
    bootstrap,
    settings,
    saveSettings,
    sync,
    syncNow,
    loadDemo,
    removeDemo,
    notify,
    refresh,
  } = useWorkspace();
  const [communityEndpoint, setCommunityEndpoint] = useState(settings?.communityEndpoint ?? '');
  const [communityEnabled, setCommunityEnabled] = useState(settings?.communityEnabled ?? true);
  const [mediaInbox, setMediaInbox] = useState(settings?.mediaInbox ?? '');
  const [mediaOutput, setMediaOutput] = useState(settings?.mediaOutput ?? '');
  const [mediaArchive, setMediaArchive] = useState(settings?.mediaArchive ?? '');
  const [externalWorkerUrl, setExternalWorkerUrl] = useState(settings?.externalWorkerUrl ?? '');
  const [confirmDemoLoad, setConfirmDemoLoad] = useState(false);
  const [confirmDemoRemove, setConfirmDemoRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [migrationPath, setMigrationPath] = useState('');
  const [migrationPreview, setMigrationPreview] = useState<MigrationPreview | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [migrationError, setMigrationError] = useState('');
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [confirmMigration, setConfirmMigration] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setCommunityEndpoint(settings.communityEndpoint);
    setCommunityEnabled(settings.communityEnabled);
    setMediaInbox(settings.mediaInbox ?? '');
    setMediaOutput(settings.mediaOutput ?? '');
    setMediaArchive(settings.mediaArchive ?? '');
    setExternalWorkerUrl(settings.externalWorkerUrl ?? '');
  }, [settings]);

  if (!settings) return null;

  async function save(patch: Partial<AppSettings>): Promise<boolean> {
    setBusy(true);
    try {
      await saveSettings(patch);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save settings.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function applyFontScale(value: number) {
    document.documentElement.style.setProperty('--font-scale', String(value));
  }

  async function chooseFontScale(value: number) {
    const previous = settings?.fontScale ?? 1.12;
    applyFontScale(value);
    const saved = await save({ fontScale: value });
    if (!saved) applyFontScale(previous);
  }

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(settings?.dataDir ?? '');
      notify('Data directory copied.', 'success');
    } catch {
      notify('Clipboard access is not available in this window.', 'error');
    }
  }

  async function chooseMigrationFile() {
    const bridge = (window as unknown as { creatorCenter?: { chooseFile?: () => Promise<string | null> } })
      .creatorCenter;
    if (!bridge?.chooseFile) return;
    const chosen = await bridge.chooseFile();
    if (chosen) {
      setMigrationPath(chosen);
      setMigrationPreview(null);
      setMigrationResult(null);
      setMigrationError('');
    }
  }

  async function previewMigration() {
    setMigrationBusy(true);
    setMigrationError('');
    setMigrationResult(null);
    try {
      const preview = await api.previewMigration(migrationPath);
      setMigrationPreview(preview);
      if (!preview.valid) setMigrationError(preview.error ?? 'The old database could not be read.');
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : 'The old database could not be previewed.');
      setMigrationPreview(null);
    } finally {
      setMigrationBusy(false);
    }
  }

  async function runMigration() {
    setMigrationBusy(true);
    setMigrationError('');
    try {
      const result = await api.importMigration(migrationPath);
      setMigrationResult(result);
      setMigrationPreview(result);
      setConfirmMigration(false);
      notify(
        `Imported ${result.imported.accounts} accounts, ${result.imported.content + result.imported.scheduled} posts and ${result.imported.history} history points.`,
        'success',
      );
      await refresh();
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : 'The old workspace could not be imported.');
      setConfirmMigration(false);
    } finally {
      setMigrationBusy(false);
    }
  }

  const accounts = bootstrap?.accounts ?? [];
  const hasDemoAccounts = accounts.some((account) => account.isDemo);
  const chooseFile = (window as unknown as { creatorCenter?: { chooseFile?: () => Promise<string | null> } })
    .creatorCenter?.chooseFile;
  const demoAccounts = accounts.filter((account) => account.isDemo);

  return (
    <div className="page settings-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">LOCAL WORKSPACE</span>
          <h1>Settings</h1>
          <p>Appearance, data location, the optional community endpoint and the media paths for the next increment.</p>
        </div>
        <Badge tone="neutral">v{bootstrap?.version ?? '0.1.0'} · schema {bootstrap?.schemaVersion ?? '—'}</Badge>
      </header>

      <div className="settings-grid">
        <section className="panel settings-card">
          <div className="settings-head">
            <span className="settings-icon"><Sparkles size={17} /></span>
            <div>
              <h2>Appearance</h2>
              <p>Dark mode is a preference, not a separate theme build.</p>
            </div>
          </div>
          <div className="settings-row">
            <span>Theme</span>
            <Segmented
              label="Theme"
              value={settings.theme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
              onChange={(theme) => void save({ theme })}
            />
          </div>
          <div className="font-setting">
            <div className="font-setting-head">
              <span className="settings-icon settings-icon-small"><Type size={15} /></span>
              <div>
                <strong>Text size</strong>
                <p>Scales every label, table and card. Use Compact to fit smaller screens.</p>
              </div>
              <Badge tone="neutral">{Math.round((settings.fontScale ?? 1.12) * 100)}%</Badge>
            </div>
            <div className="font-scale-options" role="radiogroup" aria-label="Text size">
              {FONT_SCALES.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={Math.abs((settings.fontScale ?? 1.12) - option.value) < 0.01}
                  className={cn('font-scale-option', Math.abs((settings.fontScale ?? 1.12) - option.value) < 0.01 && 'is-active')}
                  onClick={() => void chooseFontScale(option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{Math.round(option.value * 100)}%</span>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
            <div className="font-preview" aria-live="polite" aria-label="Text size preview">
              <div className="font-preview-head">
                <span className="eyebrow">Live preview</span>
                <span className="font-preview-scale">At {Math.round((settings.fontScale ?? 1.12) * 100)}%</span>
              </div>
              <div className="font-preview-sample">
                <strong className="font-preview-title">Overview</strong>
                <p className="font-preview-body">Every channel, plan and measurement in one place.</p>
                <div className="font-preview-metrics">
                  <span><small>Followers</small><strong>128.4k</strong></span>
                  <span><small>Published · 60 days</small><strong>20</strong></span>
                  <span><small>Latest measurement</small><strong>2 min ago</strong></span>
                </div>
                <div className="font-preview-foot">
                  <Badge tone="success">Connected</Badge>
                  <span className="font-preview-tiny">The smallest labels scale with this setting.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-head">
            <span className="settings-icon"><Database size={17} /></span>
            <div>
              <h2>Local data</h2>
              <p>One SQLite workspace, versioned migrations and no cloud account.</p>
            </div>
          </div>
          <div className="data-path">
            <code>{settings.dataDir}</code>
            <Button variant="secondary" size="sm" onClick={() => void copyPath()}>
              <Clipboard size={14} /> Copy
            </Button>
          </div>
          <div className="settings-meta">
            <span><HardDrive size={14} /> SQLite · schema {bootstrap?.schemaVersion ?? '—'}</span>
            <span><FolderOpen size={14} /> {bootstrap?.desktop ? 'Desktop app data directory' : 'Local server data directory'}</span>
          </div>
          <p className="panel-footnote">
            Back up this directory while the app is closed. Secrets are not stored here in plain text;
            platform sessions belong to the collector increment and will use the OS keychain.
          </p>
        </section>

        <section className="panel settings-card settings-wide migration-card">
          <div className="settings-head">
            <span className="settings-icon"><ArchiveRestore size={17} /></span>
            <div>
              <h2>Import the old workspace</h2>
              <p>Bring accounts, metrics, history, plans, merges, to-dos and community history across from the old app.</p>
            </div>
            <Badge tone={migrationResult || accounts.length === 0 ? 'success' : 'warning'}>
              {migrationResult
                ? 'Import complete'
                : accounts.length === 0
                  ? 'Workspace empty · ready'
                  : hasDemoAccounts
                    ? 'Remove demo before importing'
                    : 'Workspace already has accounts'}
            </Badge>
          </div>
          <div className="migration-source">
            <Field
              label="Old SQLite database"
              hint="Use a copy of the old app database. Browser sessions, YouTube tokens and dashboard passwords are not imported."
            >
              <TextInput
                value={migrationPath}
                onChange={(event) => {
                  setMigrationPath(event.target.value);
                  setMigrationPreview(null);
                  setMigrationResult(null);
                  setMigrationError('');
                }}
                placeholder="~/downloads/fieldnotes-2026-11-03.sqlite3"
                spellCheck={false}
              />
            </Field>
            {chooseFile && (
              <Button variant="secondary" onClick={() => void chooseMigrationFile()} disabled={migrationBusy}>
                Choose file
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => void previewMigration()}
              disabled={migrationBusy || !migrationPath.trim()}
            >
              {migrationBusy ? 'Checking…' : 'Preview'}
            </Button>
          </div>
          {migrationError && (
            <p className="settings-error" role="alert"><AlertTriangle size={14} /> {migrationError}</p>
          )}
          {migrationPreview && migrationPreview.valid && (
            <div className="migration-report">
              <div className="migration-report-head">
                <span className="panel-eyebrow">Found in the old database</span>
                <span className="migration-path">{migrationPreview.sourcePath}</span>
              </div>
              <div className="migration-counts">
                <MigrationCount label="Accounts" value={migrationPreview.counts.accounts} />
                <MigrationCount
                  label="Content"
                  value={migrationPreview.counts.content + migrationPreview.counts.scheduled}
                  hint={migrationPreview.counts.scheduled ? `${migrationPreview.counts.scheduled} scheduled` : undefined}
                />
                <MigrationCount label="History" value={migrationPreview.counts.history} hint="daily points" />
                <MigrationCount label="Plans" value={migrationPreview.counts.plans} />
                <MigrationCount label="Merges" value={migrationPreview.counts.merges} />
                <MigrationCount label="To-dos" value={migrationPreview.counts.todos} />
                <MigrationCount label="Community" value={migrationPreview.counts.communityDays} hint="days" />
                <MigrationCount label="Media" value={migrationPreview.counts.mediaJobs} hint="preserved" />
                <MigrationCount label="Tags" value={migrationPreview.counts.tags} />
              </div>
              {migrationPreview.warnings.length > 0 && (
                <ul className="migration-warnings">
                  {migrationPreview.warnings.map((warning) => (
                    <li key={warning}><AlertTriangle size={12} /> {warning}</li>
                  ))}
                </ul>
              )}
              {!migrationPreview.destinationReady && (
                <p className="settings-error">
                  This workspace already has {migrationPreview.destinationAccounts} account
                  {migrationPreview.destinationAccounts === 1 ? '' : 's'}. Remove the demo workspace or
                  existing accounts before importing.
                </p>
              )}
              {migrationResult && (
                <p className="migration-success">
                  <Check size={14} /> Imported {migrationResult.imported.accounts} accounts and
                  {' '}{migrationResult.imported.content + migrationResult.imported.scheduled} posts.
                  Backup: <code>{migrationResult.backupPath || 'not created'}</code>
                </p>
              )}
            </div>
          )}
          <div className="settings-actions">
            <Button
              onClick={() => setConfirmMigration(true)}
              disabled={
                migrationBusy ||
                !migrationPreview?.valid ||
                !migrationPreview.destinationReady ||
                Boolean(migrationResult)
              }
            >
              <ArchiveRestore size={15} /> Import workspace
            </Button>
            <span className="muted">
              A backup of the current local database is created before any data is written.
            </span>
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-head">
            <span className="settings-icon"><Server size={17} /></span>
            <div>
              <h2>Community status endpoint</h2>
              <p>Optional. A missing endpoint degrades gracefully; the rest of the workspace is unaffected.</p>
            </div>
          </div>
          <label className="switch-row">
            <span>
              <strong>Enable the community monitor</strong>
              <small>The catalogue and worker health stay hidden when disabled.</small>
            </span>
            <input
              type="checkbox"
              checked={communityEnabled}
              onChange={(event) => {
                setCommunityEnabled(event.target.checked);
                void save({ communityEnabled: event.target.checked });
              }}
            />
          </label>
          <Field label="Status endpoint" hint="The forum's status API. Demo workspaces use demo://community.">
            <TextInput
              value={communityEndpoint}
              onChange={(event) => setCommunityEndpoint(event.target.value)}
              placeholder="https://forum.example.com/status.json"
              type="url"
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => void save({ communityEndpoint: communityEndpoint.trim(), communityEnabled })}
            disabled={busy}
          >
            <Check size={15} /> Save endpoint
          </Button>
        </section>

        <section className="panel settings-card">
          <div className="settings-head">
            <span className="settings-icon"><RefreshCw size={17} /></span>
            <div>
              <h2>Sync</h2>
              <p>About every six hours, on demand, and at start-up when due.</p>
            </div>
          </div>
          <div className="sync-facts">
            <div><span>Last finished</span><strong>{sync?.finishedAt ? formatDateTime(sync.finishedAt) : 'Never'}</strong></div>
            <div><span>Next run</span><strong>{sync?.nextRunAt ? relativeUntil(sync.nextRunAt) : 'Not scheduled'}</strong></div>
            <div><span>State</span><strong><StatusDot tone={sync?.running ? 'warn' : sync?.error ? 'bad' : 'good'} /> {sync?.running ? 'Running' : sync?.error ? 'Last run had errors' : 'Idle'}</strong></div>
          </div>
          {sync?.error && <p className="settings-error">{sync.error}</p>}
          <div className="sync-results">
            {(sync?.lastResults ?? []).map((result) => (
              <div className={cn('sync-result', result.status === 'error' && 'is-error')} key={`${result.accountId}-${result.at}`}>
                <strong>{result.displayName}</strong>
                <span>{result.status === 'ok' ? 'Refreshed' : 'Failed'}</span>
                <small>{result.detail}</small>
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={() => void syncNow()} disabled={sync?.running}>
            <RefreshCw size={15} className={sync?.running ? 'spin' : ''} /> Sync now
          </Button>
        </section>

        <section className="panel settings-card settings-wide">
          <div className="settings-head">
            <span className="settings-icon"><FolderOpen size={17} /></span>
            <div>
              <h2>Media paths</h2>
              <p>Stored now for the media increment. The core workspace never depends on these paths.</p>
            </div>
          </div>
          <div className="form-grid form-grid-2">
            <Field label="Watched inbox" hint="New .mov and .mp4 recordings are detected here.">
              <TextInput value={mediaInbox} onChange={(event) => setMediaInbox(event.target.value)} placeholder="/Users/you/Desktop/media_inbox" />
            </Field>
            <Field label="Output folder" hint="Converted full videos and chapter exports.">
              <TextInput value={mediaOutput} onChange={(event) => setMediaOutput(event.target.value)} placeholder="/Users/you/Desktop/next_upload" />
            </Field>
            <Field label="Archive folder" hint="Linked projects move here.">
              <TextInput value={mediaArchive} onChange={(event) => setMediaArchive(event.target.value)} placeholder="/Users/you/Desktop/archive" />
            </Field>
            <Field label="Optional external worker" hint="The existing Unraid worker, when configured. Core stays local.">
              <TextInput value={externalWorkerUrl} onChange={(event) => setExternalWorkerUrl(event.target.value)} placeholder="https://worker.example.lan" />
            </Field>
          </div>
          <div className="settings-actions">
            <Button
              variant="secondary"
              onClick={() =>
                void save({
                  mediaInbox: mediaInbox.trim() || null,
                  mediaOutput: mediaOutput.trim() || null,
                  mediaArchive: mediaArchive.trim() || null,
                  externalWorkerUrl: externalWorkerUrl.trim() || null,
                })
              }
              disabled={busy}
            >
              <Check size={15} /> Save media paths
            </Button>
            <span className="muted">Conversion, chapters, joins and covers are the next implementation increment.</span>
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-head">
            <span className="settings-icon"><UserPlus size={17} /></span>
            <div>
              <h2>Accounts</h2>
              <p>{accounts.length} account{accounts.length === 1 ? '' : 's'}; multiple accounts per platform are supported.</p>
            </div>
          </div>
          <div className="settings-accounts">
            {accounts.map((account) => (
              <div key={account.id}>
                <strong>{account.displayName}</strong>
                <span>{account.platform}{account.isDemo ? ' · demo' : ''}</span>
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={onAddAccount}><UserPlus size={15} /> Add account</Button>
        </section>

        <section className="panel settings-card">
          <div className="settings-head">
            <span className="settings-icon"><Layers size={17} /></span>
            <div>
              <h2>Demo workspace</h2>
              <p>Sample accounts, history and plans for evaluation. Clearly marked everywhere.</p>
            </div>
          </div>
          {settings.demoMode ? (
            <>
              <p className="muted">
                {demoAccounts.length} demo account{demoAccounts.length === 1 ? '' : 's'} loaded. Removing the demo
                workspace also removes its plans, merges, to-dos and community snapshots.
              </p>
              <Button variant="danger" onClick={() => setConfirmDemoRemove(true)}>
                <Trash2 size={15} /> Remove demo workspace
              </Button>
            </>
          ) : (
            <>
              <p className="muted">
                The demo workspace can only be loaded into an empty workspace. It is a safe way to see
                every workflow without touching a platform session.
              </p>
              <Button variant="secondary" onClick={() => setConfirmDemoLoad(true)} disabled={accounts.length > 0}>
                <Sparkles size={15} /> Load demo workspace
              </Button>
              {accounts.length > 0 && <p className="panel-footnote">Remove the existing accounts first.</p>}
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmMigration}
        title="Import the old workspace?"
        message={
          <>
            This writes {migrationPreview?.counts.accounts ?? 0} accounts,
            {' '}{migrationPreview?.counts.content ?? 0} published posts,
            {' '}{migrationPreview?.counts.history ?? 0} history points and the rest of the old
            data into this empty workspace. A timestamped backup is created first. Old browser
            sessions and YouTube tokens are not imported.
          </>
        }
        confirmLabel="Import workspace"
        busy={migrationBusy}
        onClose={() => setConfirmMigration(false)}
        onConfirm={() => void runMigration()}
      />
      <ConfirmDialog
        open={confirmDemoLoad}
        title="Load the demo workspace?"
        message="This adds six sample accounts, thirty days of history, plans, posts, merges and community snapshots. It is only available while the workspace has no accounts."
        confirmLabel="Load demo"
        busy={busy}
        onClose={() => setConfirmDemoLoad(false)}
        onConfirm={() => {
          setBusy(true);
          void loadDemo()
            .then(() => setConfirmDemoLoad(false))
            .catch((error) => notify(error instanceof Error ? error.message : 'Could not load the demo.', 'error'))
            .finally(() => setBusy(false));
        }}
      />
      <ConfirmDialog
        open={confirmDemoRemove}
        title="Remove the demo workspace?"
        message="Every demo account and its local cache is deleted, together with the demo plans, merges, to-dos and community history. Real data you added is kept."
        confirmLabel="Remove demo"
        destructive
        busy={busy}
        onClose={() => setConfirmDemoRemove(false)}
        onConfirm={() => {
          setBusy(true);
          void removeDemo()
            .then(() => setConfirmDemoRemove(false))
            .catch((error) => notify(error instanceof Error ? error.message : 'Could not remove the demo.', 'error'))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}


function MigrationCount({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="migration-count">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}
