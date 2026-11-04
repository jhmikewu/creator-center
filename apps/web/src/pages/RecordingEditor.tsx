import { useEffect, useState } from 'react';
import type { MediaLink, RecordingWorkflow } from '@creator-center/shared';
import { api } from '../api';
import { Button, Modal, Spinner } from '../components/ui';

export function RecordingEditor({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [state, setState] = useState<RecordingWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [posts, setPosts] = useState<MediaLink[]>([]);
  const [archive, setArchive] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    Promise.all([api.recording(id), api.mediaLinkOptions()])
      .then(([s, p]) => {
        setState(s);
        setPosts(p.filter((p) => p.kind === 'post'));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);
  async function perform(task: () => Promise<RecordingWorkflow>, preserveEdits = false) {
    setBusy(true);
    setError('');
    try {
      const updated = await task();
      setState((current) =>
        preserveEdits && current
          ? { ...updated, sections: current.sections, offset: current.offset }
          : updated,
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title="Recording editor"
      width="lg"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <Button disabled={busy} onClick={onClose}>
          Done
        </Button>
      }
    >
      {error && (
        <p role="alert" className="settings-error">
          {error}
        </p>
      )}
      {(busy || loading) && (
        <Spinner label={busy ? 'Processing recording… Keep this window open.' : 'Loading'} />
      )}
      {!loading && !state && (
        <>
          <p>
            One MOV, or a primary MOV and “ipad &lt;same name&gt;.MOV”. Add both before preparing.
          </p>
          <Button
            disabled={busy}
            onClick={() => void perform(() => api.processRecording(id, 'prepare'))}
          >
            Convert & detect claps
          </Button>
        </>
      )}
      {state && (
        <fieldset disabled={busy} className="recording-editor">
          <legend>{state.secondary ? 'MacBook + iPad' : 'Single recording'}</legend>
          <video
            controls
            src={api.mediaFileUrl(state.primaryMp4)}
            className="media-preview-video"
          />
          {state.secondaryMp4 && (
            <>
              <video
                controls
                src={api.mediaFileUrl(state.secondaryMp4)}
                className="media-preview-video"
              />
              <label>
                iPad offset (seconds){' '}
                <input
                  type="number"
                  step="0.01"
                  value={state.offset}
                  onChange={(e) => setState({ ...state, offset: Number(e.target.value) })}
                />
              </label>
              <small>
                iPad time = primary time + offset. iPad clap candidates:{' '}
                {state.secondaryClaps.map((t) => t.toFixed(2)).join(', ') || 'none'}.
              </small>
            </>
          )}
          <p>{state.claps.length} clap candidates · Review boundaries before rendering.</p>
          <div className="recording-sections">
            {state.sections.map((section, i) => (
              <div className="recording-section" key={i}>
                <span>{i + 1}</span>
                <label>
                  Start{' '}
                  <input
                    type="number"
                    step="0.01"
                    value={section.start}
                    onChange={(e) =>
                      setState({
                        ...state,
                        sections: state.sections.map((s, n) =>
                          n === i ? { ...s, start: Number(e.target.value) } : s,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  End{' '}
                  <input
                    type="number"
                    step="0.01"
                    value={section.end}
                    onChange={(e) =>
                      setState({
                        ...state,
                        sections: state.sections.map((s, n) =>
                          n === i ? { ...s, end: Number(e.target.value) } : s,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Source{' '}
                  <select
                    value={section.source}
                    onChange={(e) =>
                      setState({
                        ...state,
                        sections: state.sections.map((s, n) =>
                          n === i ? { ...s, source: e.target.value as typeof s.source } : s,
                        ),
                      })
                    }
                  >
                    <option value="primary">{state.secondary ? 'MacBook' : 'Recording'}</option>
                    {state.secondary && <option value="secondary">iPad</option>}
                    <option value="drop">Drop</option>
                  </select>
                </label>
                <label>
                  Output{' '}
                  <input
                    value={section.output}
                    onChange={(e) =>
                      setState({
                        ...state,
                        sections: state.sections.map((s, n) =>
                          n === i ? { ...s, output: e.target.value } : s,
                        ),
                      })
                    }
                  />
                </label>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const midpoint = (section.start + section.end) / 2;
                    setState({
                      ...state,
                      sections: state.sections.flatMap((s, n) =>
                        n === i
                          ? [
                              { ...s, end: midpoint },
                              { ...s, start: midpoint },
                            ]
                          : [s],
                      ),
                    });
                  }}
                >
                  Split
                </Button>
              </div>
            ))}
          </div>
          <p>
            Sections with the same output name become one video. Use another name for a separate
            post.
          </p>
          <Button
            variant="secondary"
            onClick={() => void perform(() => api.saveRecording(id, state.sections, state.offset))}
          >
            Save edits
          </Button>
          <Button
            onClick={() =>
              void perform(() =>
                api.processRecording(id, 'render', {
                  sections: state.sections,
                  offset: state.offset,
                }),
              )
            }
          >
            Render videos & covers
          </Button>
          <label>
            <input
              type="checkbox"
              checked={archive}
              onChange={(e) => setArchive(e.target.checked)}
            />{' '}
            Archive
          </label>
          <label>
            Search collected posts{' '}
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {state.outputs
            .filter((o) => Boolean(o.postIds.length) === archive)
            .map((output) => (
              <article key={output.fileId} className="panel">
                <h3>{output.title}</h3>
                <video
                  controls
                  className="media-preview-video"
                  src={api.mediaFileUrl(output.fileId)}
                />
                <a href={api.mediaFileUrl(output.fileId)} download>
                  Download video
                </a>
                {' · '}
                <a href={api.mediaFileUrl(output.coverId)} download>
                  Download cover
                </a>
                <img
                  src={api.mediaFileUrl(output.coverId)}
                  alt={`${output.title} cover`}
                  style={{ width: 180, display: 'block' }}
                />
                {posts
                  .filter(
                    (p) =>
                      output.postIds.includes(p.id) ||
                      `${p.title} ${p.account}`.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((post) => (
                    <label key={post.id} style={{ display: 'block' }}>
                      <input
                        type="checkbox"
                        checked={output.postIds.includes(post.id)}
                        onChange={(e) =>
                          void perform(
                            () => api.linkVideo(id, output.fileId, post.id, e.target.checked),
                            true,
                          )
                        }
                      />
                      {post.title || 'Untitled post'} · {post.account}
                    </label>
                  ))}
                {!posts.length && <p>No collected posts yet.</p>}
              </article>
            ))}
        </fieldset>
      )}
    </Modal>
  );
}
