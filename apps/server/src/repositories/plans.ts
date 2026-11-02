import { randomUUID } from 'node:crypto';
import type {
  ContentType,
  Format,
  Plan,
  PlanTarget,
  Platform,
  PublicationLink,
} from '@creator-center/shared';
import { isoNow } from '@creator-center/shared';
import type { DB } from '../db.js';

interface PlanRow {
  id: string;
  title: string;
  notes: string;
  content_type: string;
  format: string;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
}

interface TargetRow {
  plan_id: string;
  platform: string;
  account_key: string;
  account_id: string | null;
}

interface PublicationRow {
  plan_id: string;
  account_id: string;
  post_id: string;
  platform: string | null;
  title: string | null;
  published_at: string | null;
}

export interface PlanWriteInput {
  title: string;
  notes: string;
  contentType: ContentType;
  format: Format;
  targets: PlanTarget[];
  tags: string[];
  scheduledFor: string | null;
  publications: { accountId: string; postId: string }[];
}

export interface TagCatalogueEntry {
  tag: string;
  count: number;
}

export function listPlans(db: DB): Plan[] {
  const rows = db
    .prepare('SELECT * FROM plans ORDER BY scheduled_for IS NULL, scheduled_for, title')
    .all() as PlanRow[];
  return rows.map((row) => hydratePlan(db, row));
}

export function getPlan(db: DB, id: string): Plan | null {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanRow | undefined;
  return row ? hydratePlan(db, row) : null;
}

export function createPlan(db: DB, input: PlanWriteInput): Plan {
  const id = randomUUID();
  const now = isoNow();
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO plans(id, title, notes, content_type, format, scheduled_for, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.title, input.notes, input.contentType, input.format, input.scheduledFor, now, now);
    writeRelations(db, id, input);
  });
  run();
  return getPlan(db, id) as Plan;
}

export function updatePlan(db: DB, id: string, input: PlanWriteInput): Plan | null {
  const existing = getPlan(db, id);
  if (!existing) return null;
  const now = isoNow();
  const run = db.transaction(() => {
    db.prepare(
      `UPDATE plans SET title=?, notes=?, content_type=?, format=?, scheduled_for=?, updated_at=? WHERE id=?`,
    ).run(input.title, input.notes, input.contentType, input.format, input.scheduledFor, now, id);
    db.prepare('DELETE FROM plan_targets WHERE plan_id = ?').run(id);
    db.prepare('DELETE FROM plan_tags WHERE plan_id = ?').run(id);
    db.prepare('DELETE FROM publications WHERE plan_id = ?').run(id);
    writeRelations(db, id, input, true);
  });
  run();
  return getPlan(db, id);
}

export function deletePlan(db: DB, id: string): boolean {
  return db.prepare('DELETE FROM plans WHERE id = ?').run(id).changes > 0;
}

export function tagCatalogue(db: DB): TagCatalogueEntry[] {
  const rows = db
    .prepare(
      `SELECT tag, COUNT(*) AS count FROM plan_tags GROUP BY tag
       UNION
       SELECT name AS tag, 0 AS count FROM tags WHERE name NOT IN (SELECT tag FROM plan_tags)
       ORDER BY tag`,
    )
    .all() as { tag: string; count: number }[];
  return rows;
}

export function setPlanTags(db: DB, planId: string, tags: readonly string[]): void {
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags(name, created_at) VALUES (?, ?)');
  const insertPlanTag = db.prepare('INSERT OR IGNORE INTO plan_tags(plan_id, tag) VALUES (?, ?)');
  for (const tag of tags) {
    insertTag.run(tag, isoNow());
    insertPlanTag.run(planId, tag);
  }
}

export function allTags(db: DB): string[] {
  return (db.prepare('SELECT name FROM tags ORDER BY name').all() as { name: string }[]).map(
    (row) => row.name,
  );
}

function writeRelations(
  db: DB,
  planId: string,
  input: PlanWriteInput,
  _updating = false,
): void {
  const targetStatement = db.prepare(
    'INSERT OR IGNORE INTO plan_targets(plan_id, platform, account_key, account_id) VALUES (?, ?, ?, ?)',
  );
  for (const target of input.targets) {
    targetStatement.run(planId, target.platform, target.accountId ?? '*', target.accountId);
  }
  setPlanTags(db, planId, input.tags);
  const publicationStatement = db.prepare(
    'INSERT INTO publications(plan_id, account_id, post_id, created_at) VALUES (?, ?, ?, ?)',
  );
  for (const publication of input.publications) {
    publicationStatement.run(planId, publication.accountId, publication.postId, isoNow());
  }
}

function hydratePlan(db: DB, row: PlanRow): Plan {
  const targets = db
    .prepare('SELECT * FROM plan_targets WHERE plan_id = ? ORDER BY platform, account_key')
    .all(row.id) as TargetRow[];
  const tags = (
    db.prepare('SELECT tag FROM plan_tags WHERE plan_id = ? ORDER BY tag').all(row.id) as {
      tag: string;
    }[]
  ).map((tag) => tag.tag);
  const publicationRows = db
    .prepare(
      `SELECT p.plan_id, p.account_id, p.post_id, a.platform, posts.title, posts.published_at
       FROM publications p
       LEFT JOIN accounts a ON a.id = p.account_id
       LEFT JOIN posts ON posts.id = p.post_id
       WHERE p.plan_id = ? ORDER BY p.account_id`,
    )
    .all(row.id) as PublicationRow[];
  const publications: PublicationLink[] = publicationRows.map((publication) => ({
    accountId: publication.account_id,
    platform: (publication.platform ?? 'douyin') as Platform,
    postId: publication.post_id,
    title: publication.title,
    publishedAt: publication.published_at,
  }));
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    contentType: row.content_type as ContentType,
    format: row.format as Format,
    targets: targets.map((target) => ({
      platform: target.platform as Platform,
      accountId: target.account_id,
    })),
    tags,
    scheduledFor: row.scheduled_for,
    publications,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
