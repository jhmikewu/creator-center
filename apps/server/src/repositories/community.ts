import type { CommunityHistoryPoint, CommunitySnapshot } from '@creator-center/shared';
import type { DB } from '../db.js';

interface SnapshotRow {
  day: string;
  captured_at: string;
  payload: string;
}

export function latestCommunitySnapshot(db: DB): CommunitySnapshot | null {
  const row = db
    .prepare('SELECT * FROM community_snapshots ORDER BY day DESC LIMIT 1')
    .get() as SnapshotRow | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as CommunitySnapshot;
  } catch {
    return null;
  }
}

export function getCommunityHistory(db: DB, days = 90): CommunityHistoryPoint[] {
  const rows = db
    .prepare('SELECT * FROM community_snapshots ORDER BY day DESC LIMIT ?')
    .all(days) as SnapshotRow[];
  return rows
    .map((row) => {
      try {
        const snapshot = JSON.parse(row.payload) as CommunitySnapshot;
        if (
          snapshot.status !== 'connected' ||
          !snapshot.catalogueComplete ||
          snapshot.catalogueStale
        ) {
          return null;
        }
        return {
          day: row.day,
          topics: snapshot.totals.topics ?? null,
          formulas: snapshot.totals.formulas ?? null,
          graphs: snapshot.totals.graphs ?? null,
          animations: snapshot.totals.animations ?? null,
        };
      } catch {
        return null;
      }
    })
    .filter((point): point is CommunityHistoryPoint => point !== null)
    .sort((left, right) => left.day.localeCompare(right.day));
}

/**
 * Keep the latest reading, but only a connected, complete and fresh snapshot
 * contributes a history point. Older captures never overwrite newer ones, and
 * cached polls do not invent a new day.
 */
export function saveCommunitySnapshot(db: DB, snapshot: CommunitySnapshot): void {
  db.prepare(
    `INSERT INTO community_snapshots(day, captured_at, payload) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET captured_at=excluded.captured_at, payload=excluded.payload
     WHERE excluded.captured_at >= community_snapshots.captured_at`,
  ).run(snapshot.sourceDate, snapshot.capturedAt, JSON.stringify(snapshot));
}
