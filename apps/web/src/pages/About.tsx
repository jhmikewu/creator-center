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
    version: '0.1.3',
    date: '3 November 2026',
    title: 'Live 抖音 collection',
    items: [
      'Added isolated per-account browser sessions with a Sign in action in the account view.',
      'The first live collector reads the signed-in 抖音 creator console: profile, metrics, published and scheduled posts, and follower history.',
      'The other browser collectors and YouTube OAuth are the next stage; those accounts stay truthfully setup-required or login-required until then.',
    ],
  },
  {
    version: '0.1.2',
    date: '3 November 2026',
    title: 'Old workspace import',
    items: [
      'Added an opt-in importer for the old SQLite workspace: accounts, metrics, history, posts, plans, tags, merges, to-dos and Community history.',
      'Every import previews the source first, requires an empty workspace, creates a timestamped database backup, and preserves media project metadata for the media increment.',
      'Old browser sessions and YouTube tokens are deliberately not imported; accounts reconnect after migration.',
      'The per-account metric table is now labelled Account metrics, its rows share a first-line baseline and one column grid, and the import file actions line up with the database field.',
      'Trimmed redundant secondary labels and descriptions across the workspace; the layout carries more of the explanation.',
    ],
  },
  {
    version: '0.1.1',
    date: '3 November 2026',
    title: 'Readability and macOS window controls',
    items: [
      'Added a Text size setting (Compact, Comfortable, Large) with a live preview; every label, table and card scales together.',
      'Metric detail now opens collapsed to followers, posts, likes, comments and shares, with one click to reveal all 11 metrics.',
      'Moved the sidebar brand below the native macOS traffic lights and made the strip draggable.',
    ],
  },
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
          <h1>About &amp; to-dos</h1>
        </div>
        <Badge tone="neutral">Version {bootstrap?.version ?? '0.1.3'}</Badge>
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
            {todos.length === 0 && <p className="muted">Nothing here yet.</p>}
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
        </section>

        <section className="panel about-story">
          <span className="panel-eyebrow">Why this exists</span>
          <h2>One physics creator's workspace.</h2>
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
        </section>
      </div>
    </div>
  );
}
