import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Circle,
  Database,
  FileClock,
  Github,
  ListTodo,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useWorkspace } from '../state';
import { cn, openExternal } from '../utils';
import { Badge, Button, IconButton, TextInput } from '../components/ui';

const CHANGELOG = [
  {
    version: '0.1.0',
    date: '3 November 2026',
    title: 'First implementation increment',
    items: [
      'Electron desktop shell with a local API and SQLite database.',
      'Per-account data model, account switcher and a detailed per-account view.',
      'Redesigned overview with account cards, KPI band, follower dot pool and platform breakdown.',
      'Content planner with content-type defaults, tags, exam aliases, targets and publication links.',
      'Adaptive publishing timeline with plans, published posts, scheduled releases, drag/keyboard rescheduling and cross-post merges.',
      'Community monitor with configurable endpoint, cached snapshots, growth history and worker health.',
      'About/to-dos and changelog.',
      'Demo workspace for evaluation; real platform collectors, media processing and covers are the next increments.',
    ],
  },
];

const NEXT = [
  'Embedded signed-in browser sessions for 抖音, 小红书, 公众号 and Bilibili, isolated per account.',
  'The four browser collectors and the official YouTube OAuth connection.',
  'Local FFmpeg media pipeline: inbox watching, conversion, chapters, exclusions, two-screen joins and cover sets.',
  'Old-workspace SQLite/media migration and backup/restore.',
  'Installer, signing and auto-update path.',
];

export function AboutPage() {
  const { todos, createTodo, toggleTodo, deleteTodo, bootstrap, notify } = useWorkspace();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createTodo(title);
      setTitle('');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not add the to-do.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page about-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">ABOUT THIS WORKSPACE</span>
          <h1>About &amp; to-dos</h1>
          <p>A personal workspace, the decisions behind it, and the small list that keeps it moving.</p>
        </div>
        <Badge tone="neutral">Version {bootstrap?.version ?? '0.1.0'}</Badge>
      </header>

      <div className="about-grid">
        <section className="panel todos-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-eyebrow">Personal list</span>
              <h2>To-dos</h2>
            </div>
            <ListTodo size={18} className="muted" />
          </div>
          <div className="todo-add">
            <TextInput
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void add();
              }}
              placeholder="Add something small and concrete"
              aria-label="New to-do"
              maxLength={300}
            />
            <Button onClick={() => void add()} disabled={busy || !title.trim()}>
              <Plus size={15} /> Add
            </Button>
          </div>
          <div className="todo-list">
            {todos.length === 0 && <p className="muted">The list is empty. Add the next physical action.</p>}
            {todos.map((todo) => (
              <div className={cn('todo-row', todo.done && 'is-done')} key={todo.id}>
                <button
                  className="todo-check"
                  aria-label={todo.done ? `Mark ${todo.title} not done` : `Mark ${todo.title} done`}
                  onClick={() => void toggleTodo(todo)}
                >
                  {todo.done ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                </button>
                <span>{todo.title}</span>
                <IconButton label={`Delete ${todo.title}`} onClick={() => void deleteTodo(todo.id)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
          <p className="panel-footnote">Stored locally in the SQLite workspace, newest first, completed items kept.</p>
        </section>

        <section className="panel about-story">
          <span className="panel-eyebrow">Why this exists</span>
          <h2>One physics creator's workspace.</h2>
          <p>
            Creator Center is built for one person managing five platforms: 抖音, 小红书, 公众号,
            Bilibili and YouTube. It plans content, tracks what was published, keeps the per-account
            analytics honest and watches the community forum.
          </p>
          <p>
            The old app was a LAN dashboard with Docker, a separate Chromium host and a media worker.
            This version is a standalone desktop app. The core workspace runs locally; the existing
            Unraid worker and NFS share remain optional for media.
          </p>
          <div className="about-principles">
            <div><ShieldCheck size={17} /><span><strong>Local-first.</strong> No cloud account, no telemetry, no hosted backend.</span></div>
            <div><Database size={17} /><span><strong>Account-keyed.</strong> Two accounts on the same platform never share a metric or history row.</span></div>
            <div><Check size={17} /><span><strong>Read/plan/track.</strong> The app never publishes, likes or comments for you.</span></div>
          </div>
          <button
            className="text-link about-repo"
            onClick={() => openExternal('https://github.com/jhmikewu/creator-center')}
          >
            <Github size={14} /> View the repository
          </button>
        </section>
      </div>

      <div className="about-grid about-lower">
        <section className="panel changelog">
          <div className="panel-heading">
            <div>
              <span className="panel-eyebrow">Release notes</span>
              <h2>Changelog</h2>
            </div>
            <FileClock size={18} className="muted" />
          </div>
          {CHANGELOG.map((release) => (
            <article className="release" key={release.version}>
              <div className="release-head">
                <strong>v{release.version}</strong>
                <span>{release.date}</span>
                <Badge tone="accent">{release.title}</Badge>
              </div>
              <ul>
                {release.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="panel next-up">
          <div className="panel-heading">
            <div>
              <span className="panel-eyebrow">Roadmap</span>
              <h2>Next increments</h2>
            </div>
          </div>
          <ol>
            {NEXT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <div className="data-box">
            <span className="panel-eyebrow">Data directory</span>
            <code>{bootstrap?.settings.dataDir ?? 'Unknown'}</code>
            <span>Schema {bootstrap?.schemaVersion ?? '—'} · SQLite · Asia/Shanghai dates</span>
          </div>
          {bootstrap?.settings.firstRunCompleted !== undefined && (
            <p className="panel-footnote">
              First-run setup is deliberately minimal: the app explains the data location and never asks
              for a cloud account. Platform sessions and OAuth belong to the collector increment.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
