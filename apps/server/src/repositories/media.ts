import { randomUUID } from 'node:crypto';
import type { MediaFile, MediaProject, MediaLink } from '@creator-center/shared';
import { isoNow } from '@creator-center/shared';
import type { DB } from '../db.js';

interface MediaProjectRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MediaFileRow {
  id: string;
  project_id: string;
  name: string;
  relative_path: string;
  bytes: number;
  mime_type: string;
  created_at: string;
}

export interface NewMediaFile {
  projectId: string;
  name: string;
  relativePath: string;
  bytes: number;
  mimeType: string;
}

export function listMediaProjects(db: DB): MediaProject[] {
  const projects = (db.prepare('SELECT * FROM media_projects ORDER BY created_at DESC').all() as MediaProjectRow[]).map(
    (row) => mapProject(db, row),
  );
  const byId = new Map(projects.map((project) => [project.id, project]));
  const files = db
    .prepare('SELECT * FROM media_files ORDER BY created_at, name')
    .all() as MediaFileRow[];
  for (const row of files) {
    const project = byId.get(row.project_id);
    if (!project) continue;
    const file = mapFile(row);
    project.files.push(file);
    project.bytes += file.bytes;
  }
  return projects;
}

export function getMediaProject(db: DB, id: string): MediaProject | null {
  const row = db.prepare('SELECT * FROM media_projects WHERE id = ?').get(id) as
    | MediaProjectRow
    | undefined;
  if (!row) return null;
  const project = mapProject(db, row);
  const files = db
    .prepare('SELECT * FROM media_files WHERE project_id = ? ORDER BY created_at, name')
    .all(id) as MediaFileRow[];
  project.files = files.map(mapFile);
  project.bytes = project.files.reduce((total, file) => total + file.bytes, 0);
  return project;
}

export function getMediaFile(db: DB, id: string): MediaFile | null {
  const row = db.prepare('SELECT * FROM media_files WHERE id = ?').get(id) as
    | MediaFileRow
    | undefined;
  return row ? mapFile(row) : null;
}

export function createMediaProjectRow(db: DB, title: string): MediaProject {
  const id = randomUUID();
  const now = isoNow();
  db.prepare(
    'INSERT INTO media_projects(id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run(id, title, now, now);
  return { id, title, createdAt: now, updatedAt: now, files: [], links: [], bytes: 0 };
}

export function insertMediaFile(db: DB, input: NewMediaFile): MediaFile {
  const id = randomUUID();
  const now = isoNow();
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO media_files(id, project_id, name, relative_path, bytes, mime_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.projectId, input.name, input.relativePath, input.bytes, input.mimeType, now);
    db.prepare('UPDATE media_projects SET updated_at = ? WHERE id = ?').run(now, input.projectId);
  });
  run();
  return {
    id,
    projectId: input.projectId,
    name: input.name,
    relativePath: input.relativePath,
    bytes: input.bytes,
    mimeType: input.mimeType,
    createdAt: now,
  };
}

export function touchMediaProject(db: DB, id: string): void {
  db.prepare('UPDATE media_projects SET updated_at = ? WHERE id = ?').run(isoNow(), id);
}

export function deleteMediaFileRow(db: DB, id: string): boolean {
  return db.prepare('DELETE FROM media_files WHERE id = ?').run(id).changes > 0;
}

export function deleteMediaProjectRow(db: DB, id: string): boolean {
  return db.prepare('DELETE FROM media_projects WHERE id = ?').run(id).changes > 0;
}

export function mediaProjectCount(db: DB): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM media_projects').get() as { count: number };
  return row.count;
}

export function mediaTotals(db: DB): { fileCount: number; bytes: number } {
  const row = db
    .prepare('SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes FROM media_files')
    .get() as { count: number; bytes: number };
  return { fileCount: row.count, bytes: row.bytes };
}

function mapProject(db: DB, row: MediaProjectRow): MediaProject {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    links: mediaLinks(db, row.id),
    files: [],
    bytes: 0,
  };
}

function mapFile(row: MediaFileRow): MediaFile {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    relativePath: row.relative_path,
    bytes: row.bytes,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

export function mediaLinks(db: DB, projectId?: string): MediaLink[] {
  return [
    ...db.prepare(`SELECT 'plan' AS kind, p.id, p.title, NULL AS account FROM plans p
      ${projectId === undefined ? '' : 'JOIN media_plan_links l ON l.target_id = p.id WHERE l.project_id = ?'}
      ORDER BY p.title, p.id`).all(...(projectId === undefined ? [] : [projectId])) as MediaLink[],
    ...db.prepare(`SELECT 'post' AS kind, p.id, p.title,
      a.platform || ' · ' || a.display_name AS account FROM posts p
      JOIN accounts a ON a.id = p.account_id
      ${projectId === undefined ? '' : 'JOIN media_post_links l ON l.target_id = p.id WHERE l.project_id = ?'}
      ORDER BY p.title, p.id`).all(...(projectId === undefined ? [] : [projectId])) as MediaLink[],
  ];
}
