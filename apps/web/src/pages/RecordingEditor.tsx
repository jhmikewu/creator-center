import { RecordingProgress } from '../components/RecordingProgress';
import { useEffect, useRef, useState } from 'react';
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
  const primaryVideo = useRef<HTMLVideoElement>(null);
  const [playhead, setPlayhead] = useState(0);
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
      {loading && <Spinner label="Loading" />}
      {busy && <RecordingProgress projectId={id} fallback="Saving changes" />}
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
          <legend className="sr-only">
            {state.secondary ? 'MacBook + iPad' : 'Single recording'}
          </legend>
          <div className="recording-previews">
            <figure>
              <video
                ref={primaryVideo}
                controls
                preload="metadata"
                src={api.mediaFileUrl(state.primaryMp4)}
                onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
              />
              {state.secondaryMp4 && <figcaption>MacBook</figcaption>}
            </figure>
            {state.secondaryMp4 && (
              <figure>
                <video controls preload="metadata" src={api.mediaFileUrl(state.secondaryMp4)} />
                <figcaption>iPad</figcaption>
              </figure>
            )}
          </div>
          <div className="recording-toolbar">
            <Button
              variant="secondary"
              disabled={
                !state.sections.some((s) => playhead > s.start + 0.01 && playhead < s.end - 0.01)
              }
              onClick={() => {
                const time = primaryVideo.current?.currentTime ?? playhead;
                setState({
                  ...state,
                  sections: state.sections.flatMap((s) =>
                    time > s.start + 0.01 && time < s.end - 0.01
                      ? [
                          { ...s, end: time },
                          { ...s, start: time },
                        ]
                      : [s],
                  ),
                });
              }}
            >
              Cut at playhead ({playhead.toFixed(2)}s)
            </Button>
            {state.secondaryMp4 && (
              <label title="iPad time = MacBook time + offset">
                iPad offset (s)
                <input
                  aria-label="iPad offset (seconds)"
                  type="number"
                  step="0.01"
                  value={state.offset}
                  onChange={(e) => setState({ ...state, offset: Number(e.target.value) })}
                />
              </label>
            )}
          </div>
          <div className="recording-table-scroll">
            <table className="recording-sections">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Start (s)</th>
                  <th>End (s)</th>
                  <th>Source</th>
                  <th>Output</th>
                </tr>
              </thead>
              <tbody>
                {state.sections.map((section, i) => (
                  <tr key={i}>
                    <td>
                      <button
                        type="button"
                        className="recording-seek"
                        aria-label={`Preview section ${i + 1}`}
                        onClick={() => {
                          if (primaryVideo.current)
                            primaryVideo.current.currentTime = section.start;
                          setPlayhead(section.start);
                        }}
                      >
                        {i + 1}
                      </button>
                    </td>
                    <td>
                      <input
                        aria-label={`Section ${i + 1} start`}
                        type="number"
                        step="0.01"
                        min="0"
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
                    </td>
                    <td>
                      <input
                        aria-label={`Section ${i + 1} end`}
                        type="number"
                        step="0.01"
                        min="0"
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
                    </td>
                    <td>
                      <select
                        aria-label={`Section ${i + 1} source`}
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
                    </td>
                    <td>
                      <select
                        aria-label={`Section ${i + 1} output`}
                        disabled={section.source === 'drop'}
                        value={section.output}
                        onChange={(e) => {
                          let output = e.target.value;
                          if (output === '__new_video__') {
                            let number = 1;
                            const names = [
                              ...state.sections.map((s) => s.output),
                              ...state.outputs.map((o) => o.title),
                            ];
                            while (names.includes(`Video ${number}`)) number++;
                            output = `Video ${number}`;
                          }
                          setState({
                            ...state,
                            sections: state.sections.map((s, n) =>
                              n === i ? { ...s, output } : s,
                            ),
                          });
                        }}
                      >
                        {[
                          ...new Set([
                            ...state.sections.map((s) => s.output),
                            ...state.outputs.map((o) => o.title),
                          ]),
                        ].map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                        <option value="__new_video__">+ New video</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="recording-toolbar">
            <Button
              variant="secondary"
              onClick={() =>
                void perform(() => api.saveRecording(id, state.sections, state.offset))
              }
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
          </div>
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
                  className="recording-output-preview"
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
