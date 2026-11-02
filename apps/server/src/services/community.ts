import type {
  AppSettings,
  CommunityHistoryPoint,
  CommunitySnapshot,
  CommunityState,
  Counts,
  WorkerHealth,
} from '@creator-center/shared';
import { shanghaiDay, todayShanghai } from '@creator-center/shared';
import type { DB } from '../db.js';
import {
  getCommunityHistory,
  latestCommunitySnapshot,
  saveCommunitySnapshot,
} from '../repositories/community.js';

export function getCommunityState(db: DB, settings: AppSettings): CommunityState {
  const snapshot = latestCommunitySnapshot(db);
  return {
    configured: Boolean(settings.communityEndpoint && settings.communityEnabled),
    endpoint: settings.communityEndpoint,
    snapshot,
    history: getCommunityHistory(db),
    stale: snapshot
      ? snapshot.status !== 'connected' ||
        !snapshot.catalogueComplete ||
        snapshot.catalogueStale
      : true,
  };
}

export async function syncCommunity(db: DB, settings: AppSettings): Promise<CommunitySnapshot | null> {
  if (!settings.communityEnabled || !settings.communityEndpoint) return null;
  if (settings.communityEndpoint.startsWith('demo://')) return null;
  const previous = latestCommunitySnapshot(db);
  const capturedAt = new Date().toISOString();
  try {
    const response = await fetch(settings.communityEndpoint, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`The status endpoint returned HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    const snapshot = normalizeCommunityPayload(payload, settings.communityEndpoint, capturedAt);
    saveCommunitySnapshot(db, snapshot);
    return snapshot;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The status endpoint could not be read.';
    if (previous) {
      // Keep the last good snapshot. The next successful refresh will replace it.
      return previous;
    }
    const failed: CommunitySnapshot = {
      capturedAt,
      sourceDate: todayShanghai(),
      status: 'error',
      reachable: false,
      authenticated: false,
      latencyMs: null,
      endpoint: settings.communityEndpoint,
      error: detail,
      catalogueStatus: 'unknown',
      catalogueComplete: false,
      catalogueStale: true,
      totals: {},
      last24Hours: {},
      last7Days: {},
      workers: [],
      mentionJobs: { available: false, total: null, retryable: null, byStatus: {} },
      drawings: {
        available: false,
        trackedPosts: null,
        publishedGraphs: null,
        publishedAnimations: null,
      },
      pdfs: { available: false, trackedTopics: null, published: null, pending: null },
    };
    saveCommunitySnapshot(db, failed);
    return failed;
  }
}

export function normalizeCommunityPayload(
  payload: unknown,
  endpoint: string,
  capturedAt: string,
): CommunitySnapshot {
  const root = isRecord(payload) ? payload : {};
  const recognized =
    isRecord(root.remote) ||
    isRecord(root.connectivity) ||
    isRecord(root.catalogue) ||
    isRecord(root.totals) ||
    isRecord(root.local);
  if (!recognized) {
    return {
      capturedAt,
      sourceDate: todayShanghai(),
      status: 'error',
      reachable: false,
      authenticated: false,
      latencyMs: null,
      endpoint,
      error: 'The status endpoint returned a shape this monitor does not understand.',
      catalogueStatus: 'unknown',
      catalogueComplete: false,
      catalogueStale: true,
      totals: {},
      last24Hours: {},
      last7Days: {},
      workers: [],
      mentionJobs: { available: false, total: null, retryable: null, byStatus: {} },
      drawings: { available: false, trackedPosts: null, publishedGraphs: null, publishedAnimations: null },
      pdfs: { available: false, trackedTopics: null, published: null, pending: null },
    };
  }
  const remote = isRecord(root.remote) ? root.remote : {};
  const local = isRecord(root.local) ? root.local : {};
  const connectivity = isRecord(remote.connectivity)
    ? remote.connectivity
    : isRecord(root.connectivity)
      ? root.connectivity
      : {};
  const catalogue = isRecord(remote.catalogue)
    ? remote.catalogue
    : isRecord(root.catalogue)
      ? root.catalogue
      : {};
  const management = isRecord(local.management) ? local.management : {};
  const mentionJobs = isRecord(management.mention_jobs) ? management.mention_jobs : {};
  const drawings = isRecord(management.drawings) ? management.drawings : {};
  const pdfs = isRecord(management.pdfs) ? management.pdfs : {};
  const reachable = booleanValue(connectivity.reachable, true);
  const authenticated = booleanValue(connectivity.authenticated, true);
  const catalogueStatus = stringValue(catalogue.status, reachable ? 'ready' : 'unavailable');
  const sourceStamp = stringValue(
    catalogue.last_success_at ?? root.generated_at ?? connectivity.checked_at,
    capturedAt,
  );
  const sourceDate = shanghaiDay(sourceStamp) ?? todayShanghai();
  const workers = Array.isArray(local.workers)
    ? local.workers.filter(isRecord).map(normalizeWorker)
    : [];
  return {
    capturedAt,
    sourceDate,
    status: reachable && authenticated ? 'connected' : 'error',
    reachable,
    authenticated,
    latencyMs: numberValue(connectivity.latency_ms),
    endpoint,
    error: stringValue(connectivity.error, '') || null,
    catalogueStatus,
    catalogueComplete: booleanValue(catalogue.complete, isRecord(catalogue.totals)),
    catalogueStale: booleanValue(catalogue.stale, false),
    totals: normalizeCounts(catalogue.totals),
    last24Hours: normalizeCounts(catalogue.last_24_hours),
    last7Days: normalizeCounts(catalogue.last_7_days),
    workers,
    mentionJobs: {
      available: booleanValue(mentionJobs.available, false),
      total: numberValue(mentionJobs.total),
      retryable: numberValue(mentionJobs.retryable),
      byStatus: isRecord(mentionJobs.by_status)
        ? Object.fromEntries(
            Object.entries(mentionJobs.by_status).map(([key, value]) => [key, numberValue(value) ?? 0]),
          )
        : {},
    },
    drawings: {
      available: booleanValue(drawings.available, false),
      trackedPosts: numberValue(drawings.tracked_posts),
      publishedGraphs: numberValue(drawings.published_graphs),
      publishedAnimations: numberValue(drawings.published_manim_animations),
    },
    pdfs: {
      available: booleanValue(pdfs.available, false),
      trackedTopics: numberValue(pdfs.tracked_topics),
      published: numberValue(pdfs.published),
      pending: numberValue(pdfs.pending),
    },
  };
}

export function demoCommunitySnapshot(today: string): CommunitySnapshot {
  return {
    capturedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    sourceDate: today,
    status: 'connected',
    reachable: true,
    authenticated: true,
    latencyMs: 184,
    endpoint: 'demo://community',
    error: null,
    catalogueStatus: 'ready',
    catalogueComplete: true,
    catalogueStale: false,
    totals: {
      topics: 1284,
      posts: 8642,
      words: 2_841_900,
      formulas: 18_240,
      images: 6_420,
      graphs: 1_486,
      animations: 312,
      videos: 118,
    },
    last24Hours: {
      topics: 6,
      posts: 38,
      words: 12_480,
      formulas: 96,
      images: 24,
      graphs: 12,
      animations: 4,
      videos: 1,
    },
    last7Days: {
      topics: 31,
      posts: 214,
      words: 68_400,
      formulas: 512,
      images: 140,
      graphs: 62,
      animations: 18,
      videos: 5,
    },
    workers: [
      {
        unit: 'creator-centre-community-worker.service',
        label: 'Graph worker',
        description: 'Renders graph requests and publishes worked samples.',
        kind: 'service',
        state: 'running',
        health: 'healthy',
        lastRun: null,
        nextRun: null,
        statusText: 'Serving the queue',
      },
      {
        unit: 'creator-centre-mention-monitor.service',
        label: 'Mention monitor',
        description: 'Watches mentions and queues replies for review.',
        kind: 'service',
        state: 'running',
        health: 'healthy',
        lastRun: null,
        nextRun: null,
        statusText: '6 jobs in the last day',
      },
      {
        unit: 'creator-centre-pdf-sync.timer',
        label: 'PDF sync scheduler',
        description: 'Rebuilds worked-sample PDFs when a topic changes.',
        kind: 'timer',
        state: 'waiting',
        health: 'healthy',
        lastRun: '2026-11-02T23:00:00.000Z',
        nextRun: '2026-11-03T11:00:00.000Z',
        statusText: 'Next build at 19:00 Shanghai',
      },
      {
        unit: 'creator-centre-suite-dashboard.service',
        label: 'Suite dashboard',
        description: 'Internal status page for the community tooling.',
        kind: 'service',
        state: 'running',
        health: 'degraded',
        lastRun: null,
        nextRun: null,
        statusText: 'One render worker is restarting',
      },
    ],
    mentionJobs: { available: true, total: 42, retryable: 3, byStatus: { done: 36, queued: 4, failed: 2 } },
    drawings: { available: true, trackedPosts: 1_284, publishedGraphs: 2_140, publishedAnimations: 486 },
    pdfs: { available: true, trackedTopics: 642, published: 598, pending: 44 },
  };
}

export function demoCommunityHistory(today: string, days = 30): {
  day: string;
  snapshot: CommunitySnapshot;
}[] {
  const result: { day: string; snapshot: CommunitySnapshot }[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - index);
    const day = date.toISOString().slice(0, 10);
    const progress = (days - index) / days;
    const snapshot = demoCommunitySnapshot(day);
    snapshot.totals = {
      topics: Math.round(1_180 + progress * 104),
      posts: Math.round(7_900 + progress * 742),
      words: Math.round(2_610_000 + progress * 231_900),
      formulas: Math.round(17_400 + progress * 840),
      images: Math.round(6_000 + progress * 420),
      graphs: Math.round(1_320 + progress * 166),
      animations: Math.round(284 + progress * 28),
      videos: Math.round(104 + progress * 14),
    };
    snapshot.last24Hours = { topics: 4 + (index % 4), posts: 30 + (index % 12), words: 10_800 + (index % 12) * 240, formulas: 72 + (index % 20), images: 18 + (index % 9), graphs: 8 + (index % 5), animations: 2 + (index % 3), videos: 1 + (index % 2) };
    snapshot.last7Days = { topics: 27 + (index % 6), posts: 198 + (index % 20), words: 62_000 + (index % 20) * 320, formulas: 480 + (index % 40), images: 120 + (index % 15), graphs: 54 + (index % 10), animations: 15 + (index % 4), videos: 4 + (index % 3) };
    result.push({ day, snapshot });
  }
  return result;
}

function normalizeWorker(value: Record<string, unknown>): WorkerHealth {
  const kind = value.kind === 'timer' ? 'timer' : 'service';
  return {
    unit: stringValue(value.unit, 'unknown.service'),
    label: stringValue(value.label, 'Unknown worker'),
    description: stringValue(value.description, ''),
    kind,
    state: stringValue(value.state ?? value.active_state, 'unknown'),
    health: stringValue(value.health, 'unknown'),
    lastRun: stringValue(value.last_run, '') || null,
    nextRun: stringValue(value.next_run, '') || null,
    statusText: stringValue(value.status_text, '') || null,
  };
}

function normalizeCounts(value: unknown): Counts {
  if (!isRecord(value)) return {};
  return {
    topics: numberValue(value.topics),
    posts: numberValue(value.posts),
    words: numberValue(value.words),
    formulas: numberValue(value.formulas ?? value.latex_formulas),
    images: numberValue(value.images),
    graphs: numberValue(value.graphs),
    animations: numberValue(value.animations ?? value.manim_animations),
    videos: numberValue(value.videos),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function communityHistoryPoint(snapshot: CommunitySnapshot): CommunityHistoryPoint {
  return {
    day: snapshot.sourceDate,
    topics: snapshot.totals.topics ?? null,
    formulas: snapshot.totals.formulas ?? null,
    graphs: snapshot.totals.graphs ?? null,
    animations: snapshot.totals.animations ?? null,
  };
}
