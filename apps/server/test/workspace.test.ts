import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/api.js';
import { openDatabase, schemaVersion } from '../src/db.js';
import { getSettings } from '../src/repositories/settings.js';
import { createAccount, listAccounts } from '../src/repositories/accounts.js';
import { upsertPost } from '../src/repositories/posts.js';
import { SyncService } from '../src/services/sync.js';
import { seedDemoWorkspace } from '../src/demo/seed.js';
import { normalizeCommunityPayload } from '../src/services/community.js';

const openWorkspaces: { close: () => void }[] = [];

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-center-test-'));
  const db = openDatabase(dir);
  const sync = new SyncService(db, () => getSettings(db, dir));
  const app = createApp({ db, dataDir: dir, version: 'test', sync });
  openWorkspaces.push({
    close: () => {
      sync.stopAuto();
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  });
  return { dir, db, sync, app };
}

afterEach(() => {
  while (openWorkspaces.length) openWorkspaces.pop()?.close();
});

describe('workspace API', () => {
  it('starts with an empty local workspace and persists settings', async () => {
    const { app } = workspace();
    const bootstrap = await request(app).get('/api/bootstrap').expect(200);
    expect(bootstrap.body.accounts).toEqual([]);
    expect(bootstrap.body.settings.theme).toBe('system');
    const updated = await request(app)
      .patch('/api/settings')
      .send({ theme: 'dark', fontScale: 1.3 })
      .expect(200);
    expect(updated.body.theme).toBe('dark');
    expect(updated.body.fontScale).toBe(1.3);
    const bootstrapAgain = await request(app).get('/api/bootstrap').expect(200);
    expect(bootstrapAgain.body.settings.theme).toBe('dark');
    expect(bootstrapAgain.body.settings.fontScale).toBe(1.3);
    const clamped = await request(app).patch('/api/settings').send({ fontScale: 9 }).expect(200);
    expect(clamped.body.fontScale).toBe(1.4);
  });

  it('creates multiple accounts on the same platform with separate ids', async () => {
    const { app } = workspace();
    const first = await request(app)
      .post('/api/accounts')
      .send({ platform: 'douyin', displayName: 'Liam Physics', handle: 'liamphysics' })
      .expect(201);
    const second = await request(app)
      .post('/api/accounts')
      .send({ platform: 'douyin', displayName: 'Liam Shorts', handle: 'liamshorts' })
      .expect(201);
    expect(first.body.id).not.toBe(second.body.id);
    expect(first.body.platform).toBe('douyin');
    const list = await request(app).get('/api/accounts').expect(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.map((account: { displayName: string }) => account.displayName)).toEqual([
      'Liam Physics',
      'Liam Shorts',
    ]);
  });

  it('creates a plan, normalises tags and resolves platform targets', async () => {
    const { app, db } = workspace();
    const main = createAccount(db, { platform: 'douyin', displayName: 'Liam Physics' });
    createAccount(db, { platform: 'douyin', displayName: 'Liam Shorts' });
    const plan = await request(app)
      .post('/api/plans')
      .send({
        title: 'Rotational dynamics',
        notes: 'Cover #BPhO and #AL.',
        contentType: 'paper_walkthrough',
        format: 'video',
        targets: [{ platform: 'douyin', accountId: null }],
        tags: ['mechanics'],
        scheduledFor: '2026-11-10',
      })
      .expect(201);
    expect(plan.body.tags).toEqual(['a-level', 'bpho', 'mechanics']);
    const planner = await request(app).get('/api/plans').expect(200);
    expect(planner.body.items).toHaveLength(1);
    expect(planner.body.tags).toEqual(
      expect.arrayContaining([
        { tag: 'bpho', count: 1 },
        { tag: 'a-level', count: 1 },
        { tag: 'mechanics', count: 1 },
      ]),
    );
    expect(planner.body.accounts.map((account: { id: string }) => account.id)).toContain(main.id);
  });

  it('validates malformed plans and preserves field errors', async () => {
    const { app } = workspace();
    const response = await request(app)
      .post('/api/plans')
      .send({ title: '', contentType: 'nope', targets: [] })
      .expect(400);
    expect(response.body.error).toBeTruthy();
    expect(Object.keys(response.body.fields)).toEqual(
      expect.arrayContaining(['title', 'contentType', 'targets']),
    );
  });

  it('links a plan to a published post from the same account', async () => {
    const { app, db } = workspace();
    const account = createAccount(db, { platform: 'bilibili', displayName: 'Liam Physics' });
    const published = upsertPost(db, {
      accountId: account.id,
      platform: 'bilibili',
      remoteId: 'bv-1',
      title: 'A published video',
      url: 'https://example.test/bv-1',
      format: 'video',
      status: 'published',
      publishedAt: '2026-11-01T02:00:00.000Z',
      scheduledAt: null,
      metrics: { views: 100 },
      collectedAt: '2026-11-03T00:00:00.000Z',
    });
    const plan = await request(app)
      .post('/api/plans')
      .send({
        title: 'Linked plan',
        contentType: 'paper_walkthrough',
        targets: [{ platform: 'bilibili', accountId: account.id }],
        scheduledFor: '2026-11-05',
        publications: [{ accountId: account.id, postId: published.id }],
      })
      .expect(201);
    expect(plan.body.publications).toEqual([
      expect.objectContaining({ accountId: account.id, postId: published.id, title: 'A published video' }),
    ]);
    const dashboard = await request(app).get('/api/dashboard').expect(200);
    expect(dashboard.body.plans[0].publications[0].postId).toBe(published.id);
  });

  it('merges two posts and rejects two posts from the same account', async () => {
    const { app, db } = workspace();
    const douyin = createAccount(db, { platform: 'douyin', displayName: 'Liam Physics' });
    const xhs = createAccount(db, { platform: 'xiaohongshu', displayName: 'Liam Notes' });
    const first = upsertPost(db, {
      accountId: douyin.id,
      platform: 'douyin',
      remoteId: 'dy-1',
      title: 'Same content',
      url: '',
      format: 'video',
      status: 'published',
      publishedAt: '2026-11-01T02:00:00.000Z',
      scheduledAt: null,
      metrics: {},
      collectedAt: '2026-11-03T00:00:00.000Z',
    });
    const second = upsertPost(db, {
      accountId: xhs.id,
      platform: 'xiaohongshu',
      remoteId: 'xhs-1',
      title: 'Same content',
      url: '',
      format: 'video',
      status: 'published',
      publishedAt: '2026-11-02T02:00:00.000Z',
      scheduledAt: null,
      metrics: {},
      collectedAt: '2026-11-03T00:00:00.000Z',
    });
    const merge = await request(app)
      .post('/api/merges')
      .send({
        members: [
          { accountId: douyin.id, postId: first.id },
          { accountId: xhs.id, postId: second.id },
        ],
        customTitle: 'Cross-posted',
      })
      .expect(201);
    expect(merge.body.members).toHaveLength(2);
    await request(app)
      .post('/api/merges')
      .send({
        members: [
          { accountId: douyin.id, postId: first.id },
          { accountId: douyin.id, postId: first.id },
        ],
      })
      .expect(400);
  });

  it('removes an account\'s posts, publication links and plan targets', async () => {
    const { app, db } = workspace();
    const account = createAccount(db, { platform: 'bilibili', displayName: 'Temporary account' });
    const post = upsertPost(db, {
      accountId: account.id,
      platform: 'bilibili',
      remoteId: 'temp-1',
      title: 'Temporary post',
      url: '',
      format: 'video',
      status: 'published',
      publishedAt: '2026-11-01T02:00:00.000Z',
      scheduledAt: null,
      metrics: {},
      collectedAt: '2026-11-03T00:00:00.000Z',
    });
    const plan = await request(app)
      .post('/api/plans')
      .send({
        title: 'Temporary plan',
        contentType: 'short_lecture',
        targets: [{ platform: 'bilibili', accountId: account.id }],
        publications: [{ accountId: account.id, postId: post.id }],
      })
      .expect(201);
    await request(app).delete(`/api/accounts/${account.id}`).expect(204);
    const planner = await request(app).get('/api/plans').expect(200);
    const remaining = planner.body.items.find((item: { id: string }) => item.id === plan.body.id);
    expect(remaining.publications).toEqual([]);
    expect(remaining.targets).toEqual([]);
  });

  it('scopes the dashboard to a single account', async () => {
    const { app, db } = workspace();
    const douyin = createAccount(db, { platform: 'douyin', displayName: 'Liam Physics' });
    createAccount(db, { platform: 'youtube', displayName: 'Liam YouTube' });
    const scoped = await request(app).get(`/api/dashboard?account=${douyin.id}`).expect(200);
    expect(scoped.body.scope.kind).toBe('account');
    expect(scoped.body.accounts).toHaveLength(1);
    expect(scoped.body.accounts[0].id).toBe(douyin.id);
  });

  it('does not leak other accounts into an unknown account scope', async () => {
    const { app, db } = workspace();
    const account = createAccount(db, { platform: 'douyin', displayName: 'Real account' });
    upsertPost(db, {
      accountId: account.id,
      platform: 'douyin',
      remoteId: 'dy-1',
      title: 'Should not appear',
      url: '',
      format: 'video',
      status: 'published',
      publishedAt: '2026-11-01T02:00:00.000Z',
      scheduledAt: null,
      metrics: {},
      collectedAt: '2026-11-03T00:00:00.000Z',
    });
    const scoped = await request(app).get('/api/dashboard?account=missing-account').expect(200);
    expect(scoped.body.accounts).toEqual([]);
    expect(scoped.body.posts).toEqual([]);
    expect(scoped.body.plans).toEqual([]);
    expect(scoped.body.history).toEqual([]);
  });

  it('adds, completes and deletes to-dos', async () => {
    const { app } = workspace();
    const created = await request(app).post('/api/todos').send({ title: 'Check the schedule' }).expect(201);
    const completed = await request(app)
      .patch(`/api/todos/${created.body.id}`)
      .send({ done: true })
      .expect(200);
    expect(completed.body.done).toBe(true);
    await request(app).delete(`/api/todos/${created.body.id}`).expect(204);
    const list = await request(app).get('/api/todos').expect(200);
    expect(list.body.items).toEqual([]);
  });

  it('loads and removes a demo workspace without touching real data', async () => {
    const { app, db } = workspace();
    const seeded = await request(app).post('/api/demo/seed').expect(201);
    expect(seeded.body.accounts).toHaveLength(6);
    const dashboard = await request(app).get('/api/dashboard').expect(200);
    expect(dashboard.body.accounts).toHaveLength(6);
    expect(dashboard.body.plans.length).toBeGreaterThan(3);
    expect(dashboard.body.merges.length).toBeGreaterThan(0);
    expect(dashboard.body.community.snapshot.status).toBe('connected');
    await request(app).delete('/api/demo').expect(204);
    expect(listAccounts(db)).toEqual([]);
    const empty = await request(app).get('/api/dashboard').expect(200);
    expect(empty.body.accounts).toEqual([]);
  });

  it('refuses to load the demo workspace over existing accounts', async () => {
    const { app, db } = workspace();
    createAccount(db, { platform: 'douyin', displayName: 'Real account' });
    await request(app).post('/api/demo/seed').expect(409);
  });

  it('normalises a known community status shape and rejects an unknown one', () => {
    const oldShape = normalizeCommunityPayload(
      {
        remote: {
          connectivity: { reachable: true, authenticated: true, latency_ms: 120 },
          catalogue: {
            status: 'ready',
            complete: true,
            stale: false,
            last_success_at: '2026-11-03T01:00:00.000Z',
            totals: { topics: 10, latex_formulas: 20, manim_animations: 3 },
            last_24_hours: { topics: 1 },
            last_7_days: { topics: 4 },
          },
        },
        local: { workers: [] },
      },
      'https://forum.test/status',
      '2026-11-03T02:00:00.000Z',
    );
    expect(oldShape.status).toBe('connected');
    expect(oldShape.totals).toEqual(
      expect.objectContaining({ topics: 10, formulas: 20, animations: 3 }),
    );
    expect(oldShape.catalogueComplete).toBe(true);

    const unknown = normalizeCommunityPayload(
      { hello: 'not a status payload' },
      'https://forum.test/status',
      '2026-11-03T02:00:00.000Z',
    );
    expect(unknown.status).toBe('error');
    expect(unknown.error).toMatch(/does not understand/);
  });

  it('reopens a database with schema migrations applied once', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-center-db-'));
    const first = openDatabase(dir);
    expect(schemaVersion(first)).toBe(3);
    first.close();
    const second = openDatabase(dir);
    expect(schemaVersion(second)).toBe(3);
    expect(() => seedDemoWorkspace(second, getSettings(second, dir))).not.toThrow();
    second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
