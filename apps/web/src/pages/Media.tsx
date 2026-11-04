import { RecordingEditor } from './RecordingEditor';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Download,
  FileAudio,
  FileText,
  Film,
  FolderOpen,
  HardDrive,
  Image,
  LoaderCircle,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import type { MediaLink, MediaFile, MediaLibrary, MediaProject } from '@creator-center/shared';
import { formatDateTime } from '@creator-center/shared';
import { api } from '../api';
import { useWorkspace } from '../state';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Modal,
  ProgressBar,
  Spinner,
  TextInput,
} from '../components/ui';
import { formatBytes } from '../utils';

interface DesktopMediaBridge {
  chooseMediaFile?: () => Promise<string | null>;
}

export function MediaPage({ onSettings }: { onSettings: () => void }) {
  const { settings, notify } = useWorkspace();
  const [library, setLibrary] = useState<MediaLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogProject, setDialogProject] = useState<MediaProject | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [linkProject, setLinkProject] = useState<MediaProject | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaFile | null>(null);
  const [removal, setRemoval] = useState<
    { kind: 'file'; file: MediaFile } | { kind: 'project'; project: MediaProject } | null
  >(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api.media();
      setLibrary(response);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The media library could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd(project: MediaProject | null) {
    setDialogProject(project);
    setDialogOpen(true);
  }

  async function confirmRemoval() {
    if (!removal) return;
    setRemoving(true);
    try {
      if (removal.kind === 'file') {
        await api.deleteMediaFile(removal.file.id);
        notify('File removed from local storage.', 'success');
      } else {
        await api.deleteMediaProject(removal.project.id);
        notify('Media project removed.', 'success');
      }
      setRemoval(null);
      await load(true);
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : 'The media could not be removed.',
        'error',
      );
    } finally {
      setRemoving(false);
    }
  }

  const storage = library?.storage;
  const totalBytes = storage?.totalBytes ?? null;
  const freeBytes = storage?.freeBytes ?? null;
  const usedBytes =
    totalBytes !== null && freeBytes !== null ? Math.max(0, totalBytes - freeBytes) : null;
  const projects = library?.projects ?? [];

  return (
    <div className="page media-page">
      <header className="page-heading">
        <div>
          <h1>Media workspace</h1>
        </div>
        <div className="heading-actions">
          <Button onClick={() => openAdd(null)}>
            <Plus size={15} /> Add media
          </Button>
        </div>
      </header>

      <section className="panel media-storage">
        <div className="media-storage-main">
          <span className="media-storage-icon"><HardDrive size={22} /></span>
          <div className="media-storage-path">
            <span className="panel-eyebrow">Local storage root</span>
            <code title={storage?.root ?? settings?.mediaRoot ?? undefined}>
              {storage?.root ?? settings?.mediaRoot ?? 'Not available'}
            </code>
          </div>
          <div className="media-storage-stats">
            <div>
              <strong>{formatBytes(library?.bytes)}</strong>
              <span>Stored media</span>
            </div>
            <div>
              <strong>{formatBytes(freeBytes)}</strong>
              <span>Free on disk</span>
            </div>
            <div>
              <strong>{library?.projects.length ?? 0}</strong>
              <span>{library?.projects.length === 1 ? 'Project' : 'Projects'}</span>
            </div>
          </div>
          <Button variant="secondary" onClick={onSettings}>
            <Settings2 size={15} /> Storage settings
          </Button>
        </div>
        {usedBytes !== null && totalBytes ? (
          <div className="media-storage-bar">
            <ProgressBar value={usedBytes} max={totalBytes} />
            <span>{formatBytes(usedBytes)} of {formatBytes(totalBytes)} used on this disk</span>
          </div>
        ) : null}
        {storage?.error ? (
          <p className="media-storage-error" role="alert">{storage.error}</p>
        ) : (
          <p className="media-storage-note">
            Files are copied into project folders here; the original stays where it is.
          </p>
        )}
      </section>

      {loading && !library ? (
        <div className="media-loading"><Spinner label="Loading media" /></div>
      ) : error ? (
        <div className="media-load-error" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => void load()}>Try again</Button>
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Film size={22} />}
          title="No media stored locally yet"
          message="Add a recording to copy it into the workspace's local storage folder."
          action={<Button onClick={() => openAdd(null)}><Plus size={15} /> Add media</Button>}
        />
      ) : (
        <section className="media-projects">
          {projects.map((project) => (
            <article className="panel media-project" key={project.id}>
              <header className="media-project-head">
                <span className="media-project-icon"><Film size={18} /></span>
                <div className="media-project-title">
                  <h2>{project.title}</h2>
                  <p>
                    <span>{project.files.length} {project.files.length === 1 ? 'file' : 'files'}</span>
                    <span>{formatBytes(project.bytes)}</span>
                    <span>{formatDateTime(project.createdAt)}</span>
                  </p>
                </div>
                <div className="media-project-actions">
                  <Button variant="ghost" size="sm" onClick={() => setRecordingId(project.id)}>Edit recording</Button>
                  <Button variant="ghost" size="sm" onClick={() => setLinkProject(project)}>Links ({project.links.length})</Button>
                  <Button variant="ghost" size="sm" onClick={() => openAdd(project)}>
                    <Plus size={14} /> Add file
                  </Button>
                  <IconButton
                    label="Remove project"
                    className="media-remove"
                    onClick={() => setRemoval({ kind: 'project', project })}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </header>
              {project.links.length > 0 && (
                <ul className="media-links">
                  {project.links.map((link) => <li key={link.kind + link.id}>
                    <span>{link.kind === 'plan' ? 'Plan' : link.account}</span> {link.title || 'Untitled post'}
                  </li>)}
                </ul>
              )}
              {project.files.length === 0 ? (
                <p className="media-project-empty">This project has no files yet.</p>
              ) : (
                <ul className="media-file-list">
                  {project.files.map((file) => (
                    <li className="media-file" key={file.id}>
                      <span className="media-file-icon">{fileIcon(file.mimeType)}</span>
                      <button
                        type="button"
                        className="media-file-name"
                        onClick={() => setPreview(file)}
                        aria-label={`Preview ${file.name}`}
                        title="Preview"
                      >
                        <strong>{file.name}</strong>
                        <small>{formatBytes(file.bytes)} · {file.mimeType}</small>
                      </button>
                      <div className="media-file-actions">
                        <a
                          className="icon-btn"
                          href={api.mediaFileUrl(file.id)}
                          download={file.name}
                          aria-label={`Download ${file.name}`}
                          title={`Download ${file.name}`}
                        >
                          <Download size={15} />
                        </a>
                        <IconButton
                          label={`Remove ${file.name}`}
                          className="media-remove"
                          onClick={() => setRemoval({ kind: 'file', file })}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </section>
      )}

      <MediaFileDialog
        open={dialogOpen}
        project={dialogProject}
        onClose={() => setDialogOpen(false)}
        onSaved={async () => {
          setDialogOpen(false);
          await load(true);
        }}
      />
      {linkProject && <MediaLinksDialog project={linkProject} onClose={() => setLinkProject(null)}
        onChanged={async (project) => { setLinkProject(project); await load(true); }} />}
      {recordingId && <RecordingEditor id={recordingId} onClose={() => setRecordingId(null)} onChanged={() => void load(true)} />}
      <MediaPreview file={preview} onClose={() => setPreview(null)} />
      <ConfirmDialog
        open={Boolean(removal)}
        title={removal?.kind === 'project' ? 'Remove this media project?' : 'Remove this file?'}
        message={
          removal?.kind === 'project'
            ? `"${removal.project.title}" and every file in its local folder will be deleted.`
            : removal
              ? `"${removal.file.name}" will be deleted from local storage.`
              : ''
        }
        confirmLabel={removal?.kind === 'project' ? 'Remove project' : 'Remove file'}
        destructive
        busy={removing}
        onConfirm={() => void confirmRemoval()}
        onClose={() => setRemoval(null)}
      />
    </div>
  );
}

function MediaFileDialog({
  open,
  project,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: MediaProject | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { notify } = useWorkspace();
  const [title, setTitle] = useState('');
  const [filePath, setFilePath] = useState('');
  const [secondaryPath, setSecondaryPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bridge = (window as unknown as { creatorCenter?: DesktopMediaBridge }).creatorCenter;

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setFilePath('');
    setSecondaryPath('');
    setError('');
  }, [open, project?.id]);

  async function chooseFile() {
    if (!bridge?.chooseMediaFile) return;
    const chosen = await bridge.chooseMediaFile();
    if (!chosen) return;
    setFilePath(chosen);
    if (!title.trim()) setTitle(suggestTitle(chosen));
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const path = filePath.trim();
    if (!path) {
      setError('Choose a file to store.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (project) {
        await api.addMediaFile(project.id, path);
        notify('File added to local storage.', 'success');
      } else {
        const created = await api.createMediaProject({ title: title.trim() || undefined, path });
        try {
          if (secondaryPath.trim()) await api.addMediaFile(created.id, secondaryPath.trim());
          if (/\.mov$/i.test(path)) await api.processRecording(created.id, 'prepare');
          notify('Media ready.', 'success');
        } catch (caught) {
          notify(`Files preserved. Open Edit recording to retry: ${caught instanceof Error ? caught.message : String(caught)}`, 'error');
        }
      }
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The file could not be stored.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={project ? 'Add a file' : 'Add media'}
      eyebrow={project ? project.title : 'Local storage'}
      description={
        project
          ? 'The file is copied into this project folder.'
          : 'Create a project and copy its first file into local storage.'
      }
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="media-file-form" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
            {project ? 'Add file' : 'Add media'}
          </Button>
        </>
      }
    >
      <form id="media-file-form" className="media-dialog-form" onSubmit={(event) => void submit(event)}>
        {!project && (
          <Field label="Project title" hint="Leave empty to use the file name.">
            <TextInput
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Rotational dynamics, lesson 4"
              autoComplete="off"
            />
          </Field>
        )}
        <Field label="File" hint="The original file stays where it is.">
          <div className="media-file-picker">
            <TextInput
              value={filePath}
              onChange={(event) => {
                setFilePath(event.target.value);
                setError('');
              }}
              placeholder="/Users/you/Movies/lesson.mov"
              autoComplete="off"
              spellCheck={false}
            />
            {bridge?.chooseMediaFile && (
              <Button variant="secondary" type="button" onClick={() => void chooseFile()}>
                <FolderOpen size={15} /> Choose…
              </Button>
            )}
          </div>
        </Field>
        {!project && <Field label="iPad recording (optional)"><div className="media-file-picker"><TextInput value={secondaryPath} onChange={e => setSecondaryPath(e.target.value)} placeholder="/Users/you/Movies/ipad lesson.MOV" />{bridge?.chooseMediaFile && <Button type="button" variant="secondary" onClick={async () => { const chosen = await bridge.chooseMediaFile!(); if (chosen) setSecondaryPath(chosen); }}>Choose…</Button>}</div></Field>}
        {busy && <p>Copying and preparing media…</p>}
        {error && <p className="settings-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

function MediaPreview({ file, onClose }: { file: MediaFile | null; onClose: () => void }) {
  const url = file ? api.mediaFileUrl(file.id) : '';
  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      title={file?.name ?? 'Preview'}
      description={file ? `${formatBytes(file.bytes)} · ${file.mimeType}` : undefined}
      width="lg"
      footer={
        file ? (
          <>
            <a className="btn btn-secondary btn-md" href={url} download={file.name}>
              <Download size={15} /> Download
            </a>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </>
        ) : null
      }
    >
      {file ? (
        file.mimeType.startsWith('video/') ? (
          <video className="media-preview-video" src={url} controls preload="metadata" />
        ) : file.mimeType.startsWith('image/') ? (
          <img className="media-preview-image" src={url} alt={file.name} />
        ) : file.mimeType.startsWith('audio/') ? (
          <audio className="media-preview-audio" src={url} controls preload="metadata" />
        ) : (
          <p className="media-preview-note">This file has no inline preview. Download it to open it.</p>
        )
      ) : null}
    </Modal>
  );
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('video/')) return <Film size={16} />;
  if (mimeType.startsWith('audio/')) return <FileAudio size={16} />;
  if (mimeType.startsWith('image/')) return <Image size={16} />;
  return <FileText size={16} />;
}

function suggestTitle(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function MediaLinksDialog({ project, onClose, onChanged }: {
  project: MediaProject;
  onClose: () => void;
  onChanged: (project: MediaProject) => Promise<void>;
}) {
  const [options, setOptions] = useState<MediaLink[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api.mediaLinkOptions().then((items) => { if (active) setOptions(items); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load links.'); });
    return () => { active = false; };
  }, []);
  async function toggle(link: MediaLink, linked: boolean) {
    setBusy(true);
    setError('');
    try {
      await onChanged(await api.setMediaLink(project.id, link, linked));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update link.');
    } finally { setBusy(false); }
  }
  const visible = options?.filter((link) =>
    `${link.title} ${link.account ?? ''} ${link.kind}`.toLowerCase().includes(query.toLowerCase()));
  return <Modal open onClose={() => { if (!busy) onClose(); }} title="Linked plans and posts"
    eyebrow={project.title} width="md"
    footer={<Button variant="secondary" disabled={busy} onClick={onClose}>Done</Button>}>
    <Field label="Search"><TextInput value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
    {error && <p role="alert" className="settings-error">{error}</p>}
    {!options && !error && <Spinner label="Loading plans and posts" />}
    {visible?.length === 0 && <p>No matching plans or posts.</p>}
    <ul className="media-link-options">
      {visible?.map((link) => {
        const linked = project.links.some((item) => item.kind === link.kind && item.id === link.id);
        return <li key={link.kind + link.id}><label>
          <input type="checkbox" checked={linked} disabled={busy}
            onChange={() => void toggle(link, !linked)} />
          <span><strong>{link.title || 'Untitled post'}</strong>
            <small>{link.kind === 'plan' ? 'Plan' : link.account}</small></span>
        </label></li>;
      })}
    </ul>
  </Modal>;
}
