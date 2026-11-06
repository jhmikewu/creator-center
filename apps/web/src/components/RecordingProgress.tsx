import { useEffect, useState } from 'react';
import type { RecordingProgress as Progress } from '@creator-center/shared';
import { api } from '../api';

export function RecordingProgress({
  projectId,
  fallback = 'Preparing recording',
}: {
  projectId: string | null;
  fallback?: string;
}) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    setProgress(null);
    setUnavailable(false);
    if (!projectId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api.recordingProgress(projectId!);
        if (active) {
          setProgress(next);
          setUnavailable(false);
        }
      } catch {
        if (active) setUnavailable(true);
      }
      if (active) timer = setTimeout(() => void poll(), 500);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [projectId]);
  const label = unavailable
    ? 'Progress unavailable — waiting for server'
    : (progress?.stage ?? fallback);
  const percent = unavailable ? null : progress?.percent;
  return (
    <div className="recording-progress" role="status">
      <div>
        <span>{label}</span>
        <span>{percent != null ? `${percent}%` : ''}</span>
      </div>
      <progress aria-label={label} max={100} value={percent ?? undefined} />
    </div>
  );
}
