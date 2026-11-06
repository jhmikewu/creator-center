import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '@creator-center/shared';
import { isoNow } from '@creator-center/shared';

export type DB = Database.Database;

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'core workspace',
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        display_name TEXT NOT NULL,
        handle TEXT,
        avatar_url TEXT,
        profile_url TEXT,
        studio_url TEXT,
        status TEXT NOT NULL,
        status_detail TEXT NOT NULL DEFAULT '',
        analytics_status TEXT NOT NULL,
        analytics_detail TEXT NOT NULL DEFAULT '',
        content_status TEXT NOT NULL,
        content_detail TEXT NOT NULL DEFAULT '',
        last_attempt_at TEXT,
        last_success_at TEXT,
        stale INTEGER NOT NULL DEFAULT 0,
        captured_at TEXT,
        is_demo INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX accounts_platform ON accounts(platform, position);

      CREATE TABLE account_metrics (
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        scope TEXT NOT NULL,
        availability TEXT NOT NULL,
        value REAL,
        period TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        reason TEXT,
        measured_at TEXT,
        PRIMARY KEY(account_id, key)
      );

      CREATE TABLE account_history (
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        followers REAL,
        posts REAL,
        views REAL,
        likes REAL,
        comments REAL,
        shares REAL,
        saves REAL,
        PRIMARY KEY(account_id, day)
      );

      CREATE TABLE posts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        remote_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        format TEXT,
        status TEXT NOT NULL,
        published_at TEXT,
        scheduled_at TEXT,
        metrics TEXT NOT NULL DEFAULT '{}',
        collected_at TEXT NOT NULL,
        UNIQUE(account_id, remote_id)
      );
      CREATE INDEX posts_account ON posts(account_id, status, published_at);
      CREATE INDEX posts_scheduled ON posts(status, scheduled_at);

      CREATE TABLE plans (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL,
        format TEXT NOT NULL,
        scheduled_for TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX plans_date ON plans(scheduled_for);

      CREATE TABLE plan_targets (
        plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        account_key TEXT NOT NULL,
        account_id TEXT,
        PRIMARY KEY(plan_id, platform, account_key)
      );

      CREATE TABLE plan_tags (
        plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY(plan_id, tag)
      );
      CREATE INDEX plan_tags_tag ON plan_tags(tag);

      CREATE TABLE tags (
        name TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );

      CREATE TABLE publications (
        plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(plan_id, account_id)
      );

      CREATE TABLE merges (
        id TEXT PRIMARY KEY,
        custom_title TEXT NOT NULL DEFAULT '',
        title_from_account_id TEXT,
        title_from_post_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE merge_members (
        merge_id TEXT NOT NULL REFERENCES merges(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        PRIMARY KEY(merge_id, account_id)
      );

      CREATE TABLE community_snapshots (
        day TEXT PRIMARY KEY,
        captured_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );

      CREATE TABLE todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sync_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        trigger TEXT NOT NULL,
        error TEXT,
        results TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE demo_entities (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        PRIMARY KEY(entity_type, entity_id)
      );
    `,
  },
  {
    version: 2,
    name: 'legacy media staging',
    sql: `
      CREATE TABLE legacy_media_jobs (
        id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL,
        source_size INTEGER,
        source_mtime_ns INTEGER,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 3,
    name: 'local media storage',
    sql: `
      CREATE TABLE media_projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE media_files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES media_projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        relative_path TEXT NOT NULL UNIQUE,
        bytes INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX media_files_project ON media_files(project_id);
    `,
  },
  {
    version: 4,
    name: 'media project links',
    sql: `
      CREATE TABLE media_plan_links (
        project_id TEXT NOT NULL REFERENCES media_projects(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        PRIMARY KEY(project_id, target_id)
      );
      CREATE TABLE media_post_links (
        project_id TEXT NOT NULL REFERENCES media_projects(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        PRIMARY KEY(project_id, target_id)
      );
      CREATE INDEX media_plan_target ON media_plan_links(target_id);
      CREATE INDEX media_post_target ON media_post_links(target_id);
    `,
  },
  {
    version: 5,
    name: 'recording workflows',
    sql: `CREATE TABLE media_workflows (
      project_id TEXT PRIMARY KEY REFERENCES media_projects(id) ON DELETE CASCADE,
      state TEXT NOT NULL
    );
    CREATE TABLE media_video_posts (
      file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY(file_id, post_id)
    );
    CREATE INDEX media_video_post_target ON media_video_posts(post_id);`,
  },
];

export const DEFAULT_SETTINGS: Omit<AppSettings, 'dataDir'> = {
  communityEndpoint: '',
  communityEnabled: true,
  theme: 'system',
  fontScale: 1.12,
  demoMode: false,
  accountOrder: [],
  mediaInbox: null,
  mediaOutput: null,
  mediaArchive: null,
  mediaRoot: null,
  externalWorkerUrl: null,
  firstRunCompleted: false,
};

export function openDatabase(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'creator-center.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 10000');
  migrate(db);
  seedSettings(db, dataDir);
  return db;
}

export function migrate(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (row) => row.version,
    ),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        isoNow(),
      );
    });
    run();
  }
}

function seedSettings(db: DB, dataDir: string): void {
  const insert = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  const rows: [keyof AppSettings, unknown][] = [
    ['dataDir', dataDir],
    ...(Object.entries(DEFAULT_SETTINGS) as [keyof AppSettings, unknown][]),
  ];
  const run = db.transaction(() => {
    for (const [key, value] of rows) insert.run(key, JSON.stringify(value));
  });
  run();
}

export function schemaVersion(db: DB): number {
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined;
  return row?.version ?? 0;
}
