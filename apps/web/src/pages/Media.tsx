import {
  Archive,
  ArrowRight,
  Clapperboard,
  Film,
  FolderOpen,
  Image,
  MonitorPlay,
  Scissors,
} from 'lucide-react';
import { useWorkspace } from '../state';
import { Badge, Button } from '../components/ui';

const STEPS = [
  {
    icon: FolderOpen,
    number: '01',
    title: 'Watched inbox',
    requirement: 'MED-01',
  },
  {
    icon: Film,
    number: '02',
    title: 'Full MP4',
    requirement: 'MED-02',
  },
  {
    icon: Scissors,
    number: '03',
    title: 'Chapters & exclusions',
    requirement: 'MED-03',
  },
  {
    icon: MonitorPlay,
    number: '04',
    title: 'Two-screen join',
    requirement: 'MED-04',
  },
  {
    icon: Image,
    number: '05',
    title: 'Cover sets',
    requirement: 'COV-01–07',
  },
  {
    icon: Archive,
    number: '06',
    title: 'Link & archive',
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
          <h1>Media workspace</h1>
        </div>
        <Badge tone="warning">Next implementation increment</Badge>
      </header>

      <section className="media-callout">
        <span className="media-callout-icon"><Clapperboard size={24} /></span>
        <div>
          <h2>FFmpeg pipeline</h2>
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
            <span className="media-requirement">{step.requirement}</span>
            {index < STEPS.length - 1 && <span className="media-connector" aria-hidden="true" />}
          </div>
        ))}
      </section>

    </div>
  );
}
