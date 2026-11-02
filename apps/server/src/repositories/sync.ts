import { randomUUID } from 'node:crypto';
import type { SyncResult } from '@creator-center/shared';
import type { DB } from '../db.js';

interface SyncRunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  error: string | null;
  results: string;
}

export function startSyncRun(db: DB, trigger: string): string {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO sync_runs(id, started_at, status, trigger, results) VALUES (?, ?, ?, ?, ?)',
  ).run(id, new Date().toISOString(), 'running', trigger, '[]');
  return id;
}

export function finishSyncRun(
  db: DB,
  id: string,
  status: 'ok' | 'error',
  results: readonly SyncResult[],
  error: string | null,
): void {
  db.prepare(
    'UPDATE sync_runs SET finished_at = ?, status = ?, results = ?, error = ? WHERE id = ?',
  ).run(new Date().toISOString(), status, JSON.stringify(results), error, id);
}

export function latestSyncRun(db: DB): {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  trigger: string;
  error: string | null;
  results: SyncResult[];
} | null {
  const row = db
    .prepare('SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1')
    .get() as SyncRunRow | undefined;
  if (!row) return null;
  let results: SyncResult[] = [];
  try {
    results = JSON.parse(row.results) as SyncResult[];
  } catch {
    results = [];
  }
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    trigger: row.trigger,
    error: row.error,
    results,
  };
}
