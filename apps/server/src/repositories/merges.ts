import { randomUUID } from 'node:crypto';
import type { Merge, MergeMember, Platform, PostStatus } from '@creator-center/shared';
import { isoNow } from '@creator-center/shared';
import type { DB } from '../db.js';

interface MergeRow {
  id: string;
  custom_title: string;
  title_from_account_id: string | null;
  title_from_post_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  merge_id: string;
  account_id: string;
  post_id: string;
  platform: string;
  title: string | null;
  published_at: string | null;
  scheduled_at: string | null;
  status: string | null;
}

export interface MergeWriteInput {
  members: { accountId: string; postId: string }[];
  titleFrom: { accountId: string; postId: string } | null;
  customTitle: string;
}

export function listMerges(db: DB): Merge[] {
  const rows = db.prepare('SELECT * FROM merges ORDER BY created_at').all() as MergeRow[];
  return rows.map((row) => hydrateMerge(db, row));
}

export function getMerge(db: DB, id: string): Merge | null {
  const row = db.prepare('SELECT * FROM merges WHERE id = ?').get(id) as MergeRow | undefined;
  return row ? hydrateMerge(db, row) : null;
}

export function createMerge(db: DB, input: MergeWriteInput): Merge {
  const id = randomUUID();
  const now = isoNow();
  const run = db.transaction(() => {
    db.prepare(
      'INSERT INTO merges(id, custom_title, title_from_account_id, title_from_post_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      input.customTitle,
      input.titleFrom?.accountId ?? null,
      input.titleFrom?.postId ?? null,
      now,
      now,
    );
    const insert = db.prepare(
      'INSERT INTO merge_members(merge_id, account_id, post_id, platform) VALUES (?, ?, ?, ?)',
    );
    for (const member of input.members) {
      const platform = (
        db.prepare('SELECT platform FROM posts WHERE id = ?').get(member.postId) as
          | { platform: string }
          | undefined
      )?.platform;
      if (!platform) continue;
      insert.run(id, member.accountId, member.postId, platform);
    }
  });
  run();
  return getMerge(db, id) as Merge;
}

export function updateMerge(db: DB, id: string, input: MergeWriteInput): Merge | null {
  if (!getMerge(db, id)) return null;
  const now = isoNow();
  const run = db.transaction(() => {
    db.prepare(
      'UPDATE merges SET custom_title=?, title_from_account_id=?, title_from_post_id=?, updated_at=? WHERE id=?',
    ).run(
      input.customTitle,
      input.titleFrom?.accountId ?? null,
      input.titleFrom?.postId ?? null,
      now,
      id,
    );
    db.prepare('DELETE FROM merge_members WHERE merge_id = ?').run(id);
    const insert = db.prepare(
      'INSERT INTO merge_members(merge_id, account_id, post_id, platform) VALUES (?, ?, ?, ?)',
    );
    for (const member of input.members) {
      const platform = (
        db.prepare('SELECT platform FROM posts WHERE id = ?').get(member.postId) as
          | { platform: string }
          | undefined
      )?.platform;
      if (!platform) continue;
      insert.run(id, member.accountId, member.postId, platform);
    }
  });
  run();
  return getMerge(db, id);
}

export function deleteMerge(db: DB, id: string): boolean {
  return db.prepare('DELETE FROM merges WHERE id = ?').run(id).changes > 0;
}

export function mergePostIds(db: DB): Set<string> {
  return new Set(
    (db.prepare('SELECT post_id FROM merge_members').all() as { post_id: string }[]).map(
      (row) => row.post_id,
    ),
  );
}

export function removePostFromMerges(db: DB, postId: string): string[] {
  const mergeIds = (
    db.prepare('SELECT merge_id FROM merge_members WHERE post_id = ?').all(postId) as {
      merge_id: string;
    }[]
  ).map((row) => row.merge_id);
  db.prepare('DELETE FROM merge_members WHERE post_id = ?').run(postId);
  const remaining: string[] = [];
  for (const mergeId of mergeIds) {
    const count = (
      db.prepare('SELECT COUNT(*) AS count FROM merge_members WHERE merge_id = ?').get(mergeId) as {
        count: number;
      }
    ).count;
    if (count < 2) {
      db.prepare('DELETE FROM merges WHERE id = ?').run(mergeId);
    } else {
      remaining.push(mergeId);
    }
  }
  return remaining;
}

export function removeAccountFromMerges(db: DB, accountId: string): void {
  const postIds = (
    db.prepare('SELECT id FROM posts WHERE account_id = ?').all(accountId) as { id: string }[]
  ).map((row) => row.id);
  for (const postId of postIds) removePostFromMerges(db, postId);
}

function hydrateMerge(db: DB, row: MergeRow): Merge {
  const members = db
    .prepare(
      `SELECT mm.merge_id, mm.account_id, mm.post_id, mm.platform,
              posts.title, posts.published_at, posts.scheduled_at, posts.status
       FROM merge_members mm
       LEFT JOIN posts ON posts.id = mm.post_id
       WHERE mm.merge_id = ? ORDER BY mm.platform, mm.account_id`,
    )
    .all(row.id) as MemberRow[];
  return {
    id: row.id,
    members: members.map(
      (member): MergeMember => ({
        accountId: member.account_id,
        postId: member.post_id,
        platform: member.platform as Platform,
        title: member.title,
        publishedAt: member.published_at ?? member.scheduled_at,
        status: (member.status ?? 'published') as PostStatus,
      }),
    ),
    titleFrom: row.title_from_account_id && row.title_from_post_id
      ? { accountId: row.title_from_account_id, postId: row.title_from_post_id }
      : null,
    customTitle: row.custom_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
