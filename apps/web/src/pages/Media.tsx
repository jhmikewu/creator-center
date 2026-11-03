import {
  Archive,
  ArrowRight,
  Clapperboard,
  Film,
  FolderOpen,
  Image,
  MonitorPlay,
  Scissors,
  Server,
} from 'lucide-react';
import { useWorkspace } from '../state';
import { Badge, Button } from '../components/ui';

const STEPS = [
  {
    icon: FolderOpen,
    number: '01',
    title: 'Watched inbox',
    body: 'Detect .mov and .mp4 recordings, wait for a growing file to settle, then queue one job.',
    requirement: 'MED-01',
  },
  {
    icon: Film,
    number: '02',
    title: 'Full MP4',
    body: 'H.264/AAC with fast-start, preserve the original, and surface unusual audio, HDR or PCM warnings.',
    requirement: 'MED-02',
  },
  {
    icon: Scissors,
    number: '03',
    title: 'Chapters & exclusions',
    body: 'Parse mm:ss title lines, cut clips without unnecessary re-encoding, and shift times around excluded ranges.',
    requirement: 'MED-03',
  },
  {
    icon: MonitorPlay,
    number: '04',
    title: 'Two-screen join',
    body: 'Pair iPad and MacBook recordings by name, align by sound, switch the active screen per range and cut claps at boundaries.',
    requirement: 'MED-04',
  },
  {
    icon: Image,
    number: '05',
    title: 'Cover sets',
    body: 'Four deterministic PNG ratios from bundled fonts and exam-paper presets, with a seven-day reservation window.',
    requirement: 'COV-01–07',
  },
  {
    icon: Archive,
    number: '06',
    title: 'Link & archive',
    body: 'Link finished files to plans or posts, archive safely and recover interrupted moves. Core works without the worker.',
    requirement: 'MED-07–12',
  },
];

export function MediaPage({ onSettings }: { onSettings: () => void }) {
  const { settings } = useWorkspace();
  const paths = [
    { label: 'Inbox', value: settings?.mediaInbox },
    { label: 'Outputs', value: settings?.mediaOutput },
    { label: 'Archive', value: settings?.mediaArchive },
    { label: 'External worker', value: settings?.externalWorkerUrl },
  ];
  return (
    <div className="page media-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">RECORDINGS · CHAPTERS · COVERS</span>
          <h1>Media workspace</h1>
          <p>A local pipeline for long lesson recordings, with the existing Unraid worker and NFS share as an option, never a requirement.</p>
        </div>
        <Badge tone="warning">Next implementation increment</Badge>
      </header>

      <section className="media-callout">
        <span className="media-callout-icon"><Clapperboard size={24} /></span>
        <div>
          <h2>The workspace is ready; the FFmpeg pipeline is next.</h2>
          <p>
            This increment lands the desktop shell, SQLite workspace, per-account model, planner,
            timeline and community monitor. The media paths are stored and shown here, but conversion,
            chapter export, two-screen joins and cover rendering are deliberately scoped to the next
            PR so they can be built and verified against real recordings.
          </p>
          <Button variant="secondary" onClick={onSettings}>
            Configure media paths
          </Button>
        </div>
      </section>

      <section className="media-locations">
        {paths.map((entry) => (
          <div key={entry.label} className="media-location">
            <span>{entry.label}</span>
            <code>{entry.value || 'Not configured'}</code>
          </div>
        ))}
      </section>

      <section className="media-pipeline">
        {STEPS.map((step, index) => (
          <div className="media-step" key={step.title}>
            <div className="media-step-top">
              <span className="media-step-icon"><step.icon size={20} /></span>
              <span className="media-step-number">{step.number}</span>
              <ArrowRight size={15} className="media-step-arrow" />
            </div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            <span className="media-requirement">{step.requirement}</span>
            {index < STEPS.length - 1 && <span className="media-connector" aria-hidden="true" />}
          </div>
        ))}
      </section>

      <div className="media-grid">
        <section className="panel media-principles">
          <span className="panel-eyebrow">Rules for this increment</span>
          <h2>Designed for a laptop first</h2>
          <ul>
            <li><strong>Local by default.</strong> FFmpeg runs on the machine; the worker and NFS are optional.</li>
            <li><strong>No silent work loss.</strong> A queued job survives a worker disconnect or app restart.</li>
            <li><strong>One job at a time.</strong> Progress, stage, cancel, retry and a lease recovery path.</li>
            <li><strong>Portable projects.</strong> Media folders stay readable outside SQLite and move with the app data.</li>
            <li><strong>Actionable errors.</strong> The server's real detail is shown, not a generic HTTP code.</li>
          </ul>
        </section>
        <section className="panel media-architecture">
          <span className="panel-eyebrow">Planned architecture</span>
          <h2>One worker contract, two runtimes</h2>
          <div className="arch-row">
            <span className="arch-icon"><Server size={17} /></span>
            <div><strong>Local FFmpeg worker</strong><p>Child process managed by the desktop app. Default for most recordings.</p></div>
          </div>
          <div className="arch-row">
            <span className="arch-icon"><Server size={17} /></span>
            <div><strong>Optional Unraid worker</strong><p>Configured endpoint, health check and lease. Falls back to local processing when missing.</p></div>
          </div>
          <div className="arch-row">
            <span className="arch-icon"><Image size={17} /></span>
            <div><strong>Deterministic covers</strong><p>Hidden Chromium render inside Electron, bundled fonts and the four presets. No image model.</p></div>
          </div>
          <p className="panel-footnote">
            The pipeline will be wired to plans, posts and merges, so a finished recording can be linked
            to the content it belongs to and archived once the link exists.
          </p>
        </section>
      </div>
    </div>
  );
}
