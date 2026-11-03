import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AccountStatus,
  AnalyticsStatus,
  ContentStatus,
  ContentType,
  MetricAvailability,
  MetricKey,
  MetricScope,
  MigrationCounts,
  MigrationPreview,
  MigrationResult,
  Platform,
  PostFormat,
  PostStatus,
} from '@creator-center/shared';
import {
  METRIC_KEYS,
  PLATFORMS,
  canonicalTag,
  defaultPlanFormat,
  isContentType,
  isFormat,
  isPlatform,
  isoNow,
  isMetricUnsupported,
  normalizePlanDraft,
} from '@creator-center/shared';
import type { DB } from '../db.js';
import type { HistoryPoint } from '@creator-center/shared';
import type { Account } from '@creator-center/shared';
import type { MetricInput } from '../repositories/accounts.js';
import { createAccount, listAccounts, replaceMetrics, saveHistoryPoint } from '../repositories/accounts.js';
import type { PostInput } from '../repositories/posts.js';
import { upsertPost } from '../repositories/posts.js';
import { createPlan } from '../repositories/plans.js';
import { createMerge } from '../repositories/merges.js';
import { saveCommunitySnapshot } from '../repositories/community.js';
import { normalizeCommunityPayload } from './community.js';

const REQUIRED_TABLES = [
  'accounts',
  'history',
  'plans',
  'tags',
  'post_merges',
  'discourse_history',
  'todos',
] as const;

export class MigrationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

export function emptyCounts(): MigrationCounts {
  return {
    accounts: 0,
    history: 0,
    content: 0,
    scheduled: 0,
    plans: 0,
    merges: 0,
    todos: 0,
    tags: 0,
    communityDays: 0,
    mediaJobs: 0,
  };
}

export function resolveMigrationSource(input: string): string {
  let value = input.trim();
  if (!value) throw new MigrationError(400, 'Choose the old SQLite database file.');
  if (value === '~') value = os.homedir();
  else if (value.startsWith('~/')) value = path.join(os.homedir(), value.slice(2));
  const resolved = path.resolve(value);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new MigrationError(400, `The database file does not exist: ${resolved}`);
  }
  if (!stat.isFile()) throw new MigrationError(400, `That path is not a file: ${resolved}`);
  return resolved;
}

export function previewOldWorkspace(
  db: DB,
  dataDir: string,
  sourceInput: string,
): MigrationPreview {
  let sourcePath = sourceInput.trim();
  try {
    sourcePath = resolveMigrationSource(sourceInput);
    const old = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
      return inspectOldDatabase(old, db, dataDir, sourcePath);
    } finally {
      old.close();
    }
  } catch (error) {
    return {
      sourcePath,
      valid: false,
      error: error instanceof Error ? error.message : 'The old database could not be inspected.',
      tables: [],
      missingTables: [...REQUIRED_TABLES],
      counts: emptyCounts(),
      destinationReady: listAccounts(db).length === 0,
      destinationAccounts: listAccounts(db).length,
      warnings: [],
    };
  }
}

function inspectOldDatabase(old: Database.Database, db: DB, dataDir: string, sourcePath: string): MigrationPreview {
  const tables = tableNames(old);
  const missingTables = REQUIRED_TABLES.filter((table) => !tables.includes(table));
  const countRows = (table: string): number => {
    if (!tables.includes(table)) return 0;
    return (old.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  };
  const counts = emptyCounts();
  counts.accounts = countRows('accounts');
  counts.history = countRows('history');
  counts.plans = countRows('plans');
  counts.merges = countRows('post_merges');
  counts.todos = countRows('todos');
  counts.tags = countRows('tags');
  counts.communityDays = countRows('discourse_history');
  counts.mediaJobs = countRows('media_jobs');
  const warnings: string[] = [];
  for (const row of old.prepare('SELECT payload FROM accounts').all() as { payload: string }[]) {
    try {
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      counts.content += Array.isArray(payload.latest_content) ? payload.latest_content.length : 0;
      counts.scheduled += Array.isArray(payload.scheduled_content) ? payload.scheduled_content.length : 0;
    } catch {
      warnings.push('One account payload is not valid JSON and will be skipped.');
    }
  }
  const accounts = listAccounts(db);
  const destinationPlanCount = countDestinationTable(db, 'plans');
  const destinationMergeCount = countDestinationTable(db, 'merges');
  const destinationTodoCount = countDestinationTable(db, 'todos');
  const destinationReady =
    accounts.length === 0 && destinationPlanCount === 0 && destinationMergeCount === 0 && destinationTodoCount === 0;
  if (!destinationReady) {
    warnings.push(
      'The new workspace is not empty. Remove the demo workspace or any existing accounts, plans, merges and to-dos before importing.',
    );
  }
  if (path.resolve(sourcePath) === path.resolve(path.join(dataDir, 'creator-center.db'))) {
    throw new MigrationError(400, 'Choose the old workspace database, not the current Creator Center database.');
  }
  if (counts.mediaJobs > 0) {
    warnings.push('Media project metadata is preserved in a legacy staging table; the media pipeline will consume it later.');
  }
  warnings.push('Platform browser sessions and YouTube OAuth tokens are not imported. Reconnect each account after import.');
  if (tables.includes('auth_sessions') && countRows('auth_sessions') > 0) {
    warnings.push('Old dashboard sessions are ignored.');
  }
  if (missingTables.length) {
    return {
      sourcePath,
      valid: false,
      error: `This does not look like the old Creator Center database. Missing tables: ${missingTables.join(', ')}.`,
      tables,
      missingTables,
      counts,
      destinationReady,
      destinationAccounts: accounts.length,
      warnings,
    };
  }
  return {
    sourcePath,
    valid: true,
    error: null,
    tables,
    missingTables: [],
    counts,
    destinationReady,
    destinationAccounts: accounts.length,
    warnings,
  };
}

function countDestinationTable(db: DB, table: 'plans' | 'merges' | 'todos'): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function tableNames(db: Database.Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
    (row) => row.name,
  );
}

export function importOldWorkspace(db: DB, dataDir: string, sourceInput: string): MigrationResult {
  const preview = previewOldWorkspace(db, dataDir, sourceInput);
  if (!preview.valid) throw new MigrationError(400, preview.error ?? 'The old database is not readable.');
  if (!preview.destinationReady) {
    throw new MigrationError(
      409,
      'The new workspace already has accounts. Remove the demo workspace or existing accounts before importing.',
    );
  }
  const sourcePath = resolveMigrationSource(sourceInput);
  const old = new Database(sourcePath, { readonly: true, fileMustExist: true });
  const imported = emptyCounts();
  const skipped: MigrationResult['skipped'] = { plans: 0, merges: 0, content: 0, publications: 0 };
  const warnings = [...preview.warnings];
  let backupPath = '';
  try {
    backupPath = backupBeforeImport(db, dataDir);
    const postByPlatformContent = new Map<string, string>();
    const accountByPlatform = new Map<Platform, Account>();
    let now = isoNow();

    const importedCommunityDays = new Set<string>();
    const run = db.transaction(() => {
      // Accounts, metrics, content and history.
      for (const row of old.prepare('SELECT id, payload FROM accounts').all() as { id: string; payload: string }[]) {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(row.payload) as Record<string, unknown>;
        } catch {
          skipped.content += 1;
          continue;
        }
        const platform = isPlatform(payload.id) ? payload.id : isPlatform(row.id) ? row.id : null;
        if (!platform) {
          warnings.push(`Skipped an account with an unknown platform (${row.id}).`);
          continue;
        }
        if (accountByPlatform.has(platform)) {
          warnings.push(`Skipped a duplicate ${platform} account; the new model imported the first one.`);
          continue;
        }
        const accountId = `legacy-${platform}`;
        const account = createAccount(db, {
          id: accountId,
          platform,
          displayName: stringValue(payload.name) || platformLabel(platform),
          handle: nullableString(payload.handle),
          avatarUrl: nullableString(payload.avatar_url),
          profileUrl: nullableString(payload.profile_url),
          studioUrl: nullableString(payload.studio_url),
          status: statusValue(payload.status),
          statusDetail: textValue(payload.status_detail, 'Imported from the old workspace; reconnect this platform.'),
          analyticsStatus: analyticsValue(payload.analytics_status),
          analyticsDetail: textValue(payload.analytics_detail, ''),
          contentStatus: contentValue(payload.content_status),
          contentDetail: textValue(payload.content_detail, ''),
          lastAttemptAt: nullableString(payload.last_attempt_at),
          lastSuccessAt: nullableString(payload.last_success_at),
          stale: payload.stale === true,
          capturedAt: nullableString(payload.captured_at),
          isDemo: false,
        });
        replaceMetrics(db, account.id, oldMetrics(payload, platform));
        accountByPlatform.set(platform, account);
        imported.accounts += 1;

        const collectedAt =
          nullableString(payload.content_captured_at) ??
          nullableString(payload.captured_at) ??
          nullableString(payload.last_success_at) ??
          now;
        const content = Array.isArray(payload.latest_content) ? payload.latest_content : [];
        for (const item of content) {
          const importedPost = oldPost(item, platform, account.id, 'published', collectedAt);
          if (!importedPost) {
            skipped.content += 1;
            continue;
          }
          const post = upsertPost(db, importedPost);
          postByPlatformContent.set(`${platform}:${importedPost.remoteId}`, post.id);
          imported.content += 1;
        }
        const scheduled = Array.isArray(payload.scheduled_content) ? payload.scheduled_content : [];
        for (const item of scheduled) {
          const importedPost = oldPost(item, platform, account.id, 'scheduled', collectedAt);
          if (!importedPost) {
            skipped.content += 1;
            continue;
          }
          const key = `${platform}:${importedPost.remoteId}`;
          if (postByPlatformContent.has(key)) continue;
          const post = upsertPost(db, importedPost);
          postByPlatformContent.set(key, post.id);
          imported.scheduled += 1;
        }
      }

      // History rows are keyed by platform in the old model.
      for (const row of old.prepare('SELECT day, platform, payload FROM history').all() as {
        day: string;
        platform: string;
        payload: string;
      }[]) {
        if (!isPlatform(row.platform)) continue;
        const account = accountByPlatform.get(row.platform);
        if (!account) continue;
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(row.payload) as Record<string, unknown>;
        } catch {
          continue;
        }
        const point: HistoryPoint = {
          accountId: account.id,
          day: row.day,
          followers: numberValue(payload.followers),
          posts: numberValue(payload.posts),
          views: numberValue(payload.views),
          likes: numberValue(payload.likes),
          comments: numberValue(payload.comments),
          shares: numberValue(payload.shares),
          saves: numberValue(payload.saves),
        };
        saveHistoryPoint(db, point);
        imported.history += 1;
      }

      // Tag catalogue (plans add their own tags too).
      for (const row of old.prepare('SELECT name FROM tags').all() as { name: string }[]) {
        try {
          const tag = canonicalTag(row.name);
          db.prepare('INSERT OR IGNORE INTO tags(name, created_at) VALUES (?, ?)').run(tag, now);
          imported.tags += 1;
        } catch {
          warnings.push(`Skipped an invalid old tag (${row.name}).`);
        }
      }

      // Plans: old platforms become platform-level targets; old content links resolve by content ID.
      const accounts = listAccounts(db);
      for (const row of old.prepare('SELECT id, payload FROM plans').all() as { id: string; payload: string }[]) {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(row.payload) as Record<string, unknown>;
        } catch {
          skipped.plans += 1;
          continue;
        }
        const oldPlatforms = (Array.isArray(payload.platforms) ? payload.platforms : []).filter(isPlatform);
        if (!oldPlatforms.length) {
          skipped.plans += 1;
          warnings.push(`Skipped a plan without target platforms (${row.id}).`);
          continue;
        }
        const contentType = contentFromOld(payload);
        const format = isFormat(payload.format) ? payload.format : defaultPlanFormat(contentType);
        const publications: { accountId: string; postId: string }[] = [];
        const oldPublications =
          payload.publications && typeof payload.publications === 'object'
            ? (payload.publications as Record<string, unknown>)
            : {};
        for (const [platform, contentId] of Object.entries(oldPublications)) {
          if (!isPlatform(platform) || typeof contentId !== 'string') continue;
          const account = accountByPlatform.get(platform);
          const postId = postByPlatformContent.get(`${platform}:${contentId}`);
          if (!account || !postId) {
            skipped.publications += 1;
            continue;
          }
          publications.push({ accountId: account.id, postId });
        }
        try {
          const draft = normalizePlanDraft(
            {
              title: payload.title,
              notes: oldNotes(payload),
              contentType,
              format,
              targets: oldPlatforms.map((platform) => ({ platform, accountId: null })),
              tags: Array.isArray(payload.tags) ? payload.tags : [],
              scheduledFor: nullableString(payload.scheduled_for),
              publications,
            },
            accounts,
          );
          const plan = createPlan(db, {
            title: draft.title,
            notes: draft.notes,
            contentType: draft.contentType,
            format: draft.format,
            targets: draft.targets,
            tags: draft.tags,
            scheduledFor: draft.scheduledFor,
            publications: draft.publications,
          });
          preserveTimestamps(db, 'plans', plan.id, payload);
          imported.plans += 1;
        } catch (error) {
          skipped.plans += 1;
          warnings.push(
            `Skipped plan ${row.id}: ${error instanceof Error ? error.message : 'invalid legacy plan'}.`,
          );
        }
      }

      // Merges are resolved after all posts exist; one post per platform/account is enforced.
      for (const row of old.prepare('SELECT id, payload FROM post_merges').all() as {
        id: string;
        payload: string;
      }[]) {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(row.payload) as Record<string, unknown>;
        } catch {
          skipped.merges += 1;
          continue;
        }
        const members: { accountId: string; postId: string }[] = [];
        const seenAccounts = new Set<string>();
        const rawMembers = Array.isArray(payload.members) ? payload.members : [];
        for (const item of rawMembers) {
          if (!item || typeof item !== 'object') continue;
          const entry = item as Record<string, unknown>;
          if (!isPlatform(entry.platform) || typeof entry.content_id !== 'string') continue;
          const account = accountByPlatform.get(entry.platform);
          const postId = postByPlatformContent.get(`${entry.platform}:${entry.content_id}`);
          if (!account || !postId || seenAccounts.has(account.id)) continue;
          seenAccounts.add(account.id);
          members.push({ accountId: account.id, postId });
        }
        if (members.length < 2) {
          skipped.merges += 1;
          continue;
        }
        let titleFrom: { accountId: string; postId: string } | null = null;
        if (payload.title_from && typeof payload.title_from === 'object') {
          const entry = payload.title_from as Record<string, unknown>;
          if (isPlatform(entry.platform) && typeof entry.content_id === 'string') {
            const account = accountByPlatform.get(entry.platform);
            const postId = postByPlatformContent.get(`${entry.platform}:${entry.content_id}`);
            if (account && postId && members.some((member) => member.accountId === account.id && member.postId === postId)) {
              titleFrom = { accountId: account.id, postId };
            }
          }
        }
        try {
          const merge = createMerge(db, {
            members,
            titleFrom,
            customTitle: stringValue(payload.custom_title),
          });
          preserveTimestamps(db, 'merges', merge.id, payload);
          imported.merges += 1;
        } catch (error) {
          skipped.merges += 1;
          warnings.push(
            `Skipped merge ${row.id}: ${error instanceof Error ? error.message : 'invalid legacy merge'}.`,
          );
        }
      }

      // To-dos keep their old ids and timestamps.
      const insertTodo = db.prepare(
        'INSERT OR IGNORE INTO todos(id, title, done, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      );
      for (const row of old.prepare('SELECT id, title, done, created_at, updated_at FROM todos').all() as {
        id: string;
        title: string;
        done: number;
        created_at: string;
        updated_at: string;
      }[]) {
        if (!row.title?.trim()) continue;
        insertTodo.run(row.id, row.title.trim(), row.done ? 1 : 0, row.created_at, row.updated_at);
        imported.todos += 1;
      }

      // Community history: old history becomes the daily catalogue series.
      for (const row of old.prepare('SELECT day, captured_at, payload FROM discourse_history').all() as {
        day: string;
        captured_at: string;
        payload: string;
      }[]) {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(row.payload) as Record<string, unknown>;
        } catch {
          continue;
        }
        saveCommunitySnapshot(
          db,
          legacyCommunitySnapshot(row.day, row.captured_at, payload, 'legacy://discourse'),
        );
        importedCommunityDays.add(row.day);
        imported.communityDays += 1;
      }
      // Keep the most recent full Discourse snapshot if the old app had one.
      if (tableNames(old).includes('state')) {
        const stateRow = old
          .prepare("SELECT payload FROM state WHERE key = 'discourse'")
          .get() as { payload: string } | undefined;
        if (stateRow) {
          try {
            const state = JSON.parse(stateRow.payload) as Record<string, unknown>;
            if (state.data && typeof state.data === 'object') {
              const capturedAt = nullableString(state.last_success_at) ?? now;
              const snapshot = normalizeCommunityPayload(state.data, 'legacy://discourse', capturedAt);
              saveCommunitySnapshot(db, snapshot);
              if (snapshot.sourceDate && !importedCommunityDays.has(snapshot.sourceDate)) {
                imported.communityDays += 1;
              }
            }
          } catch {
            warnings.push('The old Discourse snapshot could not be read.');
          }
        }
      }

      // Media metadata is preserved for the future media pipeline.
      if (tableNames(old).includes('media_jobs')) {
        const insertMedia = db.prepare(
          'INSERT OR IGNORE INTO legacy_media_jobs(id, source_path, source_size, source_mtime_ns, status, payload, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        );
        for (const row of old.prepare('SELECT * FROM media_jobs').all() as Record<string, unknown>[]) {
          if (typeof row.id !== 'string' || typeof row.payload !== 'string') continue;
          insertMedia.run(
            row.id,
            String(row.source_path ?? ''),
            typeof row.source_size === 'number' ? row.source_size : null,
            typeof row.source_mtime_ns === 'number' ? row.source_mtime_ns : null,
            String(row.status ?? 'unknown'),
            row.payload,
            now,
          );
          imported.mediaJobs += 1;
        }
      }
    });
    run();
    now = isoNow();
  } finally {
    old.close();
  }
  warnings.push('Imported accounts need fresh platform sessions or YouTube consent before they can sync.');
  return {
    ...preview,
    sourcePath,
    imported,
    skipped,
    backupPath,
    warnings: [...new Set(warnings)],
  };
}


function backupBeforeImport(db: DB, dataDir: string): string {
  const backups = path.join(dataDir, 'backups');
  fs.mkdirSync(backups, { recursive: true });
  db.pragma('wal_checkpoint(TRUNCATE)');
  const file = path.join(dataDir, 'creator-center.db');
  if (!fs.existsSync(file)) return '';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backups, `creator-center-before-import-${stamp}.db`);
  fs.copyFileSync(file, target);
  return target;
}

function oldMetrics(payload: Record<string, unknown>, platform: Platform): MetricInput[] {
  const metrics = (payload.metrics && typeof payload.metrics === 'object' ? payload.metrics : {}) as Record<
    string,
    unknown
  >;
  const metadata = (
    payload.metric_metadata && typeof payload.metric_metadata === 'object'
      ? payload.metric_metadata
      : {}
  ) as Record<string, unknown>;
  return METRIC_KEYS.map((key) => {
    const meta = (metadata[key] && typeof metadata[key] === 'object' ? metadata[key] : {}) as Record<
      string,
      unknown
    >;
    const value = numberValue(metrics[key]);
    const availability: MetricAvailability =
      meta.availability === 'unsupported' || meta.availability === 'pending' || meta.availability === 'value'
        ? meta.availability
        : value !== null
          ? 'value'
          : isMetricUnsupported(platform, key)
            ? 'unsupported'
            : 'pending';
    const scope: MetricScope =
      meta.scope === 'lifetime' || meta.scope === 'current' || meta.scope === 'window' ? meta.scope : 'current';
    return {
      key,
      scope,
      availability,
      value,
      period: textValue(meta.period, 'Unknown'),
      source: textValue(meta.source, 'Legacy workspace'),
      reason: nullableString(meta.reason),
      measuredAt: nullableString(meta.as_of) ?? nullableString(payload.captured_at),
    };
  });
}

function oldPost(
  item: unknown,
  platform: Platform,
  accountId: string,
  status: PostStatus,
  collectedAt: string,
): PostInput | null {
  if (!item || typeof item !== 'object') return null;
  const content = item as Record<string, unknown>;
  const remoteId = stringValue(content.id);
  if (!remoteId) return null;
  const metrics: Partial<Record<MetricKey, number | null>> = {};
  const rawMetrics = content.metrics && typeof content.metrics === 'object' ? content.metrics : {};
  for (const [key, value] of Object.entries(rawMetrics)) {
    if ((METRIC_KEYS as readonly string[]).includes(key)) {
      metrics[key as MetricKey] = numberValue(value);
    }
  }
  const format = typeof content.format === 'string' ? content.format : null;
  return {
    accountId,
    platform,
    remoteId,
    title: stringValue(content.title),
    url: stringValue(content.url),
    format: format as PostFormat,
    status,
    publishedAt: status === 'published' ? nullableString(content.published_at) : null,
    scheduledAt: status === 'scheduled' ? nullableString(content.scheduled_at) : null,
    metrics,
    collectedAt,
  };
}

function contentFromOld(payload: Record<string, unknown>): ContentType {
  if (isContentType(payload.content)) return payload.content;
  if (isContentType(payload.format)) return payload.format;
  return 'short_lecture';
}

function oldNotes(payload: Record<string, unknown>): string {
  let notes = stringValue(payload.notes);
  const reference = nullableString(payload.reference_url);
  if (reference && !notes.includes(reference)) notes += (notes ? '\n\n' : '') + reference;
  return notes;
}

function preserveTimestamps(
  db: DB,
  table: 'plans' | 'merges',
  id: string,
  payload: Record<string, unknown>,
): void {
  const createdAt = nullableString(payload.created_at);
  const updatedAt = nullableString(payload.updated_at);
  if (!createdAt && !updatedAt) return;
  db.prepare(`UPDATE ${table} SET created_at = COALESCE(?, created_at), updated_at = COALESCE(?, updated_at) WHERE id = ?`).run(
    createdAt,
    updatedAt,
    id,
  );
}

function legacyCommunitySnapshot(
  day: string,
  capturedAt: string,
  payload: Record<string, unknown>,
  endpoint: string,
) {
  return {
    capturedAt,
    sourceDate: day,
    status: 'connected' as const,
    reachable: true,
    authenticated: true,
    latencyMs: null,
    endpoint,
    error: null,
    catalogueStatus: 'ready',
    catalogueComplete: true,
    catalogueStale: false,
    totals: {
      topics: numberValue(payload.topics),
      formulas: numberValue(payload.latex_formulas),
      graphs: numberValue(payload.graphs),
      animations: numberValue(payload.manim_animations),
    },
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
}

function platformLabel(platform: Platform): string {
  return PLATFORMS[platform].label;
}

function statusValue(value: unknown): AccountStatus {
  return value === 'connected' ||
    value === 'login_required' ||
    value === 'setup_required' ||
    value === 'error' ||
    value === 'pending'
    ? value
    : 'setup_required';
}

function analyticsValue(value: unknown): AnalyticsStatus {
  return value === 'ready' ||
    value === 'no_data' ||
    value === 'access_pending' ||
    value === 'login_required' ||
    value === 'setup_required' ||
    value === 'unknown'
    ? value
    : 'unknown';
}

function contentValue(value: unknown): ContentStatus {
  return value === 'ready' || value === 'empty' || value === 'partial' || value === 'unavailable'
    ? value
    : 'unavailable';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
