import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, schemaVersion } from '../src/db.js';
import { importOldWorkspace, previewOldWorkspace, MigrationError } from '../src/services/import-old.js';
import { listAccounts, listHistory } from '../src/repositories/accounts.js';
import { listPosts } from '../src/repositories/posts.js';
import { listPlans } from '../src/repositories/plans.js';
import { listMerges } from '../src/repositories/merges.js';
import { listTodos } from '../src/repositories/todos.js';
import { getCommunityHistory } from '../src/repositories/community.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function oldAccountPayload(platform: string, name: string, contentId: string, followers: number) {
  return {
    id: platform,
    name,
    handle: platform,
    profile_url: null,
    studio_url: `https://studio.test/${platform}`,
    status: 'connected',
    status_detail: 'Imported.',
    analytics_status: 'ready',
    analytics_detail: 'Analytics ready.',
    last_attempt_at: '2026-11-01T00:00:00.000Z',
    last_success_at: '2026-11-01T00:00:00.000Z',
    captured_at: '2026-11-01T00:00:00.000Z',
    stale: false,
    metrics: {
      followers,
      posts: 1,
      views: 100,
      likes: 10,
      comments: 2,
      shares: 1,
      saves: 3,
      following: null,
      watch_hours: null,
      avg_view_seconds: null,
      completion_rate: null,
    },
    metric_metadata: {
      followers: {
        period: 'Current account total',
        as_of: '2026-11-01T00:00:00.000Z',
        source: 'https://source.test',
        reason: null,
        scope: 'current',
        availability: 'value',
      },
      following: {
        period: '—',
        as_of: null,
        source: 'https://source.test',
        reason: 'Not reported.',
        scope: 'current',
        availability: 'unsupported',
      },
    },
    latest_content: [
      {
        id: contentId,
        title: `Published ${platform}`,
        url: `https://post.test/${contentId}`,
        published_at: '2026-10-30T10:00:00.000Z',
        format: 'video',
        metrics: { views: 100, likes: 10 },
      },
    ],
    scheduled_content: [
      {
        id: `${contentId}-scheduled`,
        title: `Scheduled ${platform}`,
        url: `https://post.test/${contentId}-scheduled`,
        scheduled_at: '2026-11-05T10:00:00.000Z',
        format: 'video',
      },
    ],
    content_status: 'ready',
    content_detail: 'Content imported.',
    content_captured_at: '2026-11-01T00:00:00.000Z',
  };
}

function makeOldDatabase(): string {
  const dir = tempDir('creator-center-old-fixture-');
  const file = path.join(dir, 'old.sqlite3');
  const old = new Database(file);
  old.exec(`
    CREATE TABLE accounts (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE history (day TEXT NOT NULL, platform TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(day, platform));
    CREATE TABLE plans (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE tags (name TEXT PRIMARY KEY);
    CREATE TABLE post_merges (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE discourse_history (day TEXT PRIMARY KEY, captured_at TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE state (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE todos (id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at REAL NOT NULL, remember INTEGER NOT NULL, credential_fingerprint TEXT NOT NULL);
    CREATE TABLE media_jobs (id TEXT PRIMARY KEY, source_path TEXT NOT NULL, source_size INTEGER NOT NULL, source_mtime_ns INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT, lease_token TEXT, lease_expires REAL, archived INTEGER NOT NULL DEFAULT 0);
  `);
  old.prepare('INSERT INTO accounts VALUES (?, ?)').run('douyin', JSON.stringify(oldAccountPayload('douyin', 'Douyin account', 'dy-1', 100)));
  old.prepare('INSERT INTO accounts VALUES (?, ?)').run('xiaohongshu', JSON.stringify(oldAccountPayload('xiaohongshu', 'XHS account', 'xhs-1', 200)));
  old.prepare('INSERT INTO history VALUES (?, ?, ?)').run('2026-10-31', 'douyin', JSON.stringify({ followers: 95, posts: 1, views: 80, likes: 8, comments: 1, shares: 1, saves: 2 }));
  old.prepare('INSERT INTO history VALUES (?, ?, ?)').run('2026-11-01', 'douyin', JSON.stringify({ followers: 100, posts: 1, views: 100, likes: 10, comments: 2, shares: 1, saves: 3 }));
  old.prepare('INSERT INTO history VALUES (?, ?, ?)').run('2026-10-31', 'xiaohongshu', JSON.stringify({ followers: 190, posts: 1, views: 180, likes: 18, comments: 3, shares: 2, saves: 4 }));
  old.prepare('INSERT INTO history VALUES (?, ?, ?)').run('2026-11-01', 'xiaohongshu', JSON.stringify({ followers: 200, posts: 1, views: 200, likes: 20, comments: 4, shares: 2, saves: 5 }));
  old.prepare('INSERT INTO tags VALUES (?)').run('bpho');
  old.prepare('INSERT INTO tags VALUES (?)').run('AL');
  old.prepare('INSERT INTO tags VALUES (?)').run('mechanics');
  old.prepare('INSERT INTO plans VALUES (?, ?)').run(
    'plan-1',
    JSON.stringify({
      id: 'plan-1',
      title: 'Imported plan',
      notes: 'A plan with #BPhO.',
      content: 'paper_walkthrough',
      format: 'video',
      platforms: ['douyin', 'xiaohongshu'],
      scheduled_for: '2026-11-06',
      tags: ['mechanics'],
      publications: { douyin: 'dy-1', xiaohongshu: 'xhs-1' },
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-02T00:00:00.000Z',
    }),
  );
  old.prepare('INSERT INTO post_merges VALUES (?, ?)').run(
    'merge-1',
    JSON.stringify({
      id: 'merge-1',
      members: [
        { platform: 'douyin', content_id: 'dy-1' },
        { platform: 'xiaohongshu', content_id: 'xhs-1' },
      ],
      title_from: { platform: 'douyin', content_id: 'dy-1' },
      custom_title: 'Imported merge',
      created_at: '2026-10-03T00:00:00.000Z',
      updated_at: '2026-10-04T00:00:00.000Z',
    }),
  );
  old.prepare('INSERT INTO todos VALUES (?, ?, ?, ?, ?)').run('todo-1', 'Imported todo', 1, '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z');
  old.prepare('INSERT INTO discourse_history VALUES (?, ?, ?)').run(
    '2026-11-01',
    '2026-11-01T01:00:00.000Z',
    JSON.stringify({ topics: 10, latex_formulas: 20, graphs: 3, manim_animations: 2 }),
  );
  old.prepare('INSERT INTO media_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'media-1',
    'Lesson.mov',
    100,
    200,
    'complete',
    '2026-10-01T00:00:00.000Z',
    JSON.stringify({ id: 'media-1', files: [{ path: 'archive/Lesson.mp4' }] }),
    null,
    null,
    1,
  );
  old.close();
  return file;
}

describe('old workspace migration', () => {
  it('previews and imports accounts, history, plans, merges, todos, community and media', () => {
    const source = makeOldDatabase();
    const dataDir = tempDir('creator-center-new-');
    const db = openDatabase(dataDir);
    try {
      expect(schemaVersion(db)).toBe(2);
      const preview = previewOldWorkspace(db, dataDir, source);
      expect(preview.valid).toBe(true);
      expect(preview.destinationReady).toBe(true);
      expect(preview.counts).toEqual(
        expect.objectContaining({
          accounts: 2,
          history: 4,
          content: 2,
          scheduled: 2,
          plans: 1,
          merges: 1,
          todos: 1,
          tags: 3,
          communityDays: 1,
          mediaJobs: 1,
        }),
      );

      const result = importOldWorkspace(db, dataDir, source);
      expect(result.imported.accounts).toBe(2);
      expect(result.imported.content).toBe(2);
      expect(result.imported.scheduled).toBe(2);
      expect(result.imported.history).toBe(4);
      expect(result.imported.plans).toBe(1);
      expect(result.imported.merges).toBe(1);
      expect(result.imported.todos).toBe(1);
      expect(result.imported.communityDays).toBe(1);
      expect(result.imported.mediaJobs).toBe(1);
      expect(result.backupPath).not.toBe('');
      expect(fs.existsSync(result.backupPath)).toBe(true);

      const accounts = listAccounts(db);
      expect(accounts.map((account) => account.platform).sort()).toEqual(['douyin', 'xiaohongshu']);
      expect(accounts.every((account) => !account.isDemo)).toBe(true);
      expect(accounts.find((account) => account.platform === 'douyin')?.metrics.find((metric) => metric.key === 'followers')?.value).toBe(100);
      expect(listPosts(db)).toHaveLength(4);
      expect(listHistory(db)).toHaveLength(4);
      const plans = listPlans(db);
      expect(plans).toHaveLength(1);
      expect(plans[0]?.targets).toHaveLength(2);
      expect(plans[0]?.publications).toHaveLength(2);
      expect(plans[0]?.tags).toEqual(expect.arrayContaining(['mechanics', 'bpho']));
      const merges = listMerges(db);
      expect(merges).toHaveLength(1);
      expect(merges[0]?.members).toHaveLength(2);
      expect(listTodos(db)).toHaveLength(1);
      expect(getCommunityHistory(db)).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('refuses a non-empty destination and does not write during a dry run', () => {
    const source = makeOldDatabase();
    const dataDir = tempDir('creator-center-new-');
    const db = openDatabase(dataDir);
    try {
      const preview = previewOldWorkspace(db, dataDir, source);
      expect(preview.destinationReady).toBe(true);
      expect(listAccounts(db)).toEqual([]);
      importOldWorkspace(db, dataDir, source);
      expect(() => importOldWorkspace(db, dataDir, source)).toThrow(MigrationError);
      expect(listAccounts(db)).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  it('treats leftover plans, merges or to-dos as a non-empty destination', () => {
    const source = makeOldDatabase();
    const dataDir = tempDir('creator-center-new-');
    const db = openDatabase(dataDir);
    try {
      db.prepare(
        'INSERT INTO todos(id, title, done, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
      ).run(
        'existing-todo',
        'Existing to-do',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );
      const preview = previewOldWorkspace(db, dataDir, source);
      expect(preview.valid).toBe(true);
      expect(preview.destinationReady).toBe(false);
      expect(preview.destinationAccounts).toBe(0);
      expect(() => importOldWorkspace(db, dataDir, source)).toThrow(MigrationError);
      expect(listAccounts(db)).toEqual([]);
      expect(listTodos(db)).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('returns a readable error for a missing or wrong database', () => {
    const dataDir = tempDir('creator-center-new-');
    const db = openDatabase(dataDir);
    try {
      const missing = previewOldWorkspace(db, dataDir, path.join(dataDir, 'missing.sqlite3'));
      expect(missing.valid).toBe(false);
      expect(missing.error).toMatch(/does not exist/);

      const wrong = path.join(dataDir, 'wrong.sqlite3');
      const wrongDb = new Database(wrong);
      wrongDb.exec('CREATE TABLE random (id TEXT)');
      wrongDb.close();
      const invalid = previewOldWorkspace(db, dataDir, wrong);
      expect(invalid.valid).toBe(false);
      expect(invalid.missingTables).toContain('accounts');
    } finally {
      db.close();
    }
  });
});
