import { randomUUID } from 'node:crypto';
import type { MetricKey, Platform, Post, PostStatus } from '@creator-center/shared';
import type { DB } from '../db.js';

interface PostRow {
  id: string;
  account_id: string;
  platform: string;
  remote_id: string;
  title: string;
  url: string;
  format: string | null;
  status: string;
  published_at: string | null;
  scheduled_at: string | null;
  metrics: string;
  collected_at: string;
}

export interface PostInput {
  accountId: string;
  platform: Platform;
  remoteId: string;
  title: string;
  url: string;
  format: string | null;
  status: PostStatus;
  publishedAt: string | null;
  scheduledAt: string | null;
  metrics: Partial<Record<MetricKey, number | null>>;
  collectedAt: string;
}

export function listPosts(db: DB, accountIds?: readonly string[]): Post[] {
  const rows = accountIds?.length
    ? (db
        .prepare(
          `SELECT * FROM posts WHERE account_id IN (${accountIds.map(() => '?').join(',')}) ORDER BY COALESCE(published_at, scheduled_at) DESC`,
        )
        .all(...accountIds) as PostRow[])
    : (db
        .prepare('SELECT * FROM posts ORDER BY COALESCE(published_at, scheduled_at) DESC')
        .all() as PostRow[]);
  return rows.map(mapPost);
}

export function getPost(db: DB, id: string): Post | null {
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as PostRow | undefined;
  return row ? mapPost(row) : null;
}

export function postsForAccount(db: DB, accountId: string): Post[] {
  const rows = db.prepare('SELECT * FROM posts WHERE account_id = ?').all(accountId) as PostRow[];
  return rows.map(mapPost);
}

export function upsertPost(db: DB, input: PostInput): Post {
  const existing = db
    .prepare('SELECT * FROM posts WHERE account_id = ? AND remote_id = ?')
    .get(input.accountId, input.remoteId) as PostRow | undefined;
  const now = input.collectedAt;
  if (existing) {
    db.prepare(
      `UPDATE posts SET title=?, url=?, format=?, status=?, published_at=?, scheduled_at=?, metrics=?, collected_at=?
       WHERE id=?`,
    ).run(
      input.title,
      input.url,
      input.format,
      input.status,
      input.publishedAt,
      input.scheduledAt,
      JSON.stringify(input.metrics),
      now,
      existing.id,
    );
    return getPost(db, existing.id) as Post;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO posts(id, account_id, platform, remote_id, title, url, format, status, published_at, scheduled_at, metrics, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.accountId,
    input.platform,
    input.remoteId,
    input.title,
    input.url,
    input.format,
    input.status,
    input.publishedAt,
    input.scheduledAt,
    JSON.stringify(input.metrics),
    now,
  );
  return getPost(db, id) as Post;
}

/**
 * Save a collection result. Published posts are kept as history even when a
 * later collection no longer returns them; scheduled posts are authoritative
 * for the account and cancelled schedules disappear.
 */
export function savePosts(
  db: DB,
  accountId: string,
  posts: readonly PostInput[],
  scheduledAuthoritative = true,
): void {
  const incomingScheduled = new Set(
    posts.filter((post) => post.status === 'scheduled').map((post) => post.remoteId),
  );
  const run = db.transaction(() => {
    for (const post of posts) upsertPost(db, post);
    if (scheduledAuthoritative) {
      const rows = db
        .prepare("SELECT id, remote_id FROM posts WHERE account_id = ? AND status = 'scheduled'")
        .all(accountId) as { id: string; remote_id: string }[];
      for (const row of rows) {
        if (!incomingScheduled.has(row.remote_id)) {
          db.prepare('DELETE FROM posts WHERE id = ?').run(row.id);
        }
      }
    }
  });
  run();
}

export function deletePost(db: DB, id: string): void {
  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
}

export function countPosts(db: DB, accountId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS count FROM posts WHERE account_id = ?').get(accountId) as {
      count: number;
    }
  ).count;
}

function mapPost(row: PostRow): Post {
  let metrics: Partial<Record<MetricKey, number | null>> = {};
  try {
    metrics = JSON.parse(row.metrics) as Partial<Record<MetricKey, number | null>>;
  } catch {
    metrics = {};
  }
  return {
    id: row.id,
    accountId: row.account_id,
    platform: row.platform as Platform,
    remoteId: row.remote_id,
    title: row.title,
    url: row.url,
    format: row.format,
    status: row.status as PostStatus,
    publishedAt: row.published_at,
    scheduledAt: row.scheduled_at,
    metrics,
    collectedAt: row.collected_at,
  };
}
