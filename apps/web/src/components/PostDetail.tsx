import {
  PLATFORMS,
  formatDay,
  formatMetric,
  formatTime,
} from '@creator-center/shared';
import type { Account, MetricKey, Post } from '@creator-center/shared';
import { safeHref } from '../utils';
import { Badge, Button, Modal } from './ui';

export function PostDetailModal({
  detail,
  onClose,
  onOpenAccount,
}: {
  detail: { post: Post; account: Account } | null;
  onClose: () => void;
  onOpenAccount: (id: string) => void;
}) {
  if (!detail) return null;
  const metrics = Object.entries(detail.post.metrics).filter(([, value]) => value !== null && value !== undefined);
  const pending = detail.post.status === 'scheduled';
  return (
    <Modal
      open
      onClose={onClose}
      title={detail.post.title || 'Untitled post'}
      eyebrow={`${PLATFORMS[detail.account.platform].label} · ${detail.account.displayName}`}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => onOpenAccount(detail.account.id)}>Open account</Button>
        </>
      }
    >
      <div className="post-detail">
        <div className="post-detail-meta">
          <Badge tone={pending ? 'info' : 'success'}>{pending ? 'Scheduled' : 'Published'}</Badge>
          <span>
            {pending
              ? `Releases ${detail.post.scheduledAt ? formatDay(detail.post.scheduledAt.slice(0, 10), { month: 'short', day: 'numeric' }) : 'soon'} at ${formatTime(detail.post.scheduledAt)}`
              : `${detail.post.publishedAt ? formatDay(detail.post.publishedAt.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown date'} at ${formatTime(detail.post.publishedAt)}`}
          </span>
          {detail.post.url && safeHref(detail.post.url) && (
            <a href={safeHref(detail.post.url)} target="_blank" rel="noreferrer">
              Open on platform
            </a>
          )}
        </div>
        {pending ? (
          <p className="muted">The platform has this post scheduled. Statistics arrive once it is live.</p>
        ) : metrics.length ? (
          <div className="metric-chip-grid">
            {metrics.map(([key, value]) => (
              <div className="metric-chip" key={key}>
                <span>{key.replaceAll('_', ' ')}</span>
                <strong>{formatMetric(value as number, key as MetricKey)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No per-post statistics were returned for this post.</p>
        )}
        <p className="subtle-note">
          Collected {formatDay(detail.post.collectedAt.slice(0, 10), { month: 'short', day: 'numeric' })}.
        </p>
      </div>
    </Modal>
  );
}
