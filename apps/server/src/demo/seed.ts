import type { AppSettings } from '@creator-center/shared';
import { todayShanghai } from '@creator-center/shared';
import type { DB } from '../db.js';
import {
  createAccount,
  deleteAccount,
  listAccounts,
  replaceMetrics,
  saveHistoryPoint,
} from '../repositories/accounts.js';
import { upsertPost } from '../repositories/posts.js';
import { createPlan } from '../repositories/plans.js';
import { createMerge } from '../repositories/merges.js';
import { createTodo } from '../repositories/todos.js';
import { saveCommunitySnapshot } from '../repositories/community.js';
import { updateSettings } from '../repositories/settings.js';
import { demoCommunityHistory } from '../services/community.js';
import {
  demoAccounts,
  demoHistory,
  demoMerges,
  demoMetricInputs,
  demoPlans,
  demoPostInputs,
  demoTodos,
} from './fixtures.js';

export function seedDemoWorkspace(db: DB, _settings: AppSettings): void {
  if (listAccounts(db).length) {
    throw new Error('The demo workspace can only be loaded into an empty workspace.');
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const today = todayShanghai(now);
  try {
    for (const spec of demoAccounts()) {
      createAccount(db, {
        id: spec.id,
        platform: spec.platform,
        displayName: spec.displayName,
        handle: spec.handle,
        isDemo: true,
        status: 'connected',
        statusDetail: 'Demo account. The browser session and collection are simulated locally.',
        analyticsStatus: 'ready',
        analyticsDetail: 'Demo analytics are available.',
        contentStatus: 'ready',
        contentDetail: 'Demo content is in the current collection window.',
        lastAttemptAt: nowIso,
        lastSuccessAt: nowIso,
        capturedAt: nowIso,
      });
      replaceMetrics(db, spec.id, demoMetricInputs(spec, nowIso));
      for (const point of demoHistory(spec, today)) {
        saveHistoryPoint(db, { accountId: spec.id, ...point });
      }
      for (const post of demoPostInputs(spec, today, nowIso)) {
        upsertPost(db, post);
      }
    }

    const allPosts = (
      db.prepare('SELECT id, remote_id, account_id FROM posts').all() as {
        id: string;
        remote_id: string;
        account_id: string;
      }[]
    );
    const postByRemote = new Map(allPosts.map((post) => [post.remote_id, post]));

    for (const planSpec of demoPlans()) {
      const publications = (planSpec.publicationRemoteIds ?? [])
        .map((remoteId) => postByRemote.get(remoteId))
        .filter((post): post is { id: string; remote_id: string; account_id: string } => Boolean(post))
        .map((post) => ({ accountId: post.account_id, postId: post.id }));
      const plan = createPlan(db, {
        title: planSpec.title,
        notes: planSpec.notes,
        contentType: planSpec.contentType,
        format: planSpec.format,
        targets: planSpec.targets,
        tags: planSpec.tags,
        scheduledFor:
          planSpec.dayOffset === null
            ? null
            : shanghaiDayAtOffset(today, planSpec.dayOffset),
        publications,
      });
      recordDemoEntity(db, 'plan', plan.id);
    }

    for (const mergeSpec of demoMerges()) {
      const members = mergeSpec.remoteIds
        .map((remoteId) => postByRemote.get(remoteId))
        .filter((post): post is { id: string; remote_id: string; account_id: string } => Boolean(post))
        .map((post) => ({ accountId: post.account_id, postId: post.id }));
      if (members.length < 2) continue;
      const merge = createMerge(db, {
        members,
        titleFrom: null,
        customTitle: mergeSpec.title,
      });
      recordDemoEntity(db, 'merge', merge.id);
    }

    for (const todo of demoTodos()) {
      const created = createTodo(db, todo.title);
      if (todo.done) {
        db.prepare('UPDATE todos SET done = 1, updated_at = ? WHERE id = ?').run(nowIso, created.id);
      }
      recordDemoEntity(db, 'todo', created.id);
    }

    for (const entry of demoCommunityHistory(today)) {
      saveCommunitySnapshot(db, entry.snapshot);
      recordDemoEntity(db, 'community', entry.day);
    }

    updateSettings(db, {
      demoMode: true,
      communityEndpoint: 'demo://community',
      communityEnabled: true,
      firstRunCompleted: true,
    });
  } catch (error) {
    removeDemoWorkspace(db);
    throw error;
  }
}

export function removeDemoWorkspace(db: DB): void {
  const demoAccounts = listAccounts(db).filter((account) => account.isDemo);
  const demoPlanIds = demoEntities(db, 'plan');
  const demoMergeIds = demoEntities(db, 'merge');
  const demoTodoIds = demoEntities(db, 'todo');
  const demoCommunityDays = demoEntities(db, 'community');
  const run = db.transaction(() => {
    for (const account of demoAccounts) {
      db.prepare('DELETE FROM publications WHERE account_id = ?').run(account.id);
    }
    for (const id of demoPlanIds) db.prepare('DELETE FROM plans WHERE id = ?').run(id);
    for (const id of demoMergeIds) db.prepare('DELETE FROM merges WHERE id = ?').run(id);
    for (const id of demoTodoIds) db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    for (const day of demoCommunityDays) {
      db.prepare('DELETE FROM community_snapshots WHERE day = ?').run(day);
    }
    for (const account of demoAccounts) deleteAccount(db, account.id);
    db.prepare('DELETE FROM demo_entities').run();
    db.prepare("DELETE FROM settings WHERE key = 'demoMode'").run();
  });
  run();
  updateSettings(db, {
    demoMode: false,
    communityEndpoint: '',
    firstRunCompleted: false,
  });
}

export function isDemoWorkspace(db: DB): boolean {
  return listAccounts(db).some((account) => account.isDemo);
}

function recordDemoEntity(db: DB, type: string, id: string): void {
  db.prepare('INSERT OR IGNORE INTO demo_entities(entity_type, entity_id) VALUES (?, ?)').run(type, id);
}

function demoEntities(db: DB, type: string): string[] {
  return (
    db.prepare('SELECT entity_id FROM demo_entities WHERE entity_type = ?').all(type) as {
      entity_id: string;
    }[]
  ).map((row) => row.entity_id);
}

function shanghaiDayAtOffset(today: string, offset: number): string {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
