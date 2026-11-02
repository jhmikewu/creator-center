import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '@creator-center/shared';
import {
  MergeValidationError,
  PlanValidationError,
  isPlatform,
  normalizePlanDraft,
  validateMergeInput,
} from '@creator-center/shared';
import type { DB } from './db.js';
import { schemaVersion } from './db.js';
import { createAccount, deleteAccount, listAccounts, updateAccount } from './repositories/accounts.js';
import {
  createMerge,
  deleteMerge,
  listMerges,
  removeAccountFromMerges,
  updateMerge,
} from './repositories/merges.js';
import {
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  tagCatalogue,
  updatePlan,
} from './repositories/plans.js';
import { listPosts } from './repositories/posts.js';
import { createTodo, deleteTodo, listTodos, updateTodo } from './repositories/todos.js';
import { getSettings, updateSettings } from './repositories/settings.js';
import { accountDetail, dashboardFor, parseScope } from './services/dashboard.js';
import { getCommunityState, syncCommunity } from './services/community.js';
import { seedDemoWorkspace, removeDemoWorkspace } from './demo/seed.js';
import type { SyncService } from './services/sync.js';

export interface AppOptions {
  db: DB;
  dataDir: string;
  version: string;
  sync: SyncService;
  webDist?: string;
  desktop?: boolean;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function createApp(options: AppOptions): Express {
  const { db, dataDir, sync, webDist, version, desktop } = options;
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  const settings = () => getSettings(db, dataDir);

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      version,
      dataDir,
      schemaVersion: schemaVersion(db),
      desktop: Boolean(desktop),
      timezone: 'Asia/Shanghai',
    });
  });

  app.get('/api/bootstrap', (_request, response) => {
    response.json({
      version,
      today: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }),
      timezone: 'Asia/Shanghai',
      settings: settings(),
      accounts: listAccounts(db),
      schemaVersion: schemaVersion(db),
      desktop: Boolean(desktop),
    });
  });

  app.get('/api/dashboard', (request, response) => {
    const scope = parseScope(request.query as Record<string, unknown>);
    response.json(dashboardFor(db, settings(), sync, scope));
  });

  app.get('/api/accounts', (_request, response) => {
    response.json({ items: listAccounts(db) });
  });

  app.post('/api/accounts', (request, response) => {
    const body = request.body as Record<string, unknown>;
    if (!isPlatform(body.platform)) throw new HttpError(400, 'Choose a supported platform.');
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (!displayName) throw new HttpError(400, 'Give the account a display name.');
    if (displayName.length > 120) throw new HttpError(400, 'Keep the display name under 120 characters.');
    const account = createAccount(db, {
      platform: body.platform,
      displayName,
      handle: typeof body.handle === 'string' ? body.handle : null,
      avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl : null,
      profileUrl: typeof body.profileUrl === 'string' ? body.profileUrl : null,
      studioUrl: typeof body.studioUrl === 'string' ? body.studioUrl : null,
    });
    response.status(201).json(account);
  });

  app.get('/api/accounts/:id', (request, response) => {
    const detail = accountDetail(db, request.params.id);
    if (!detail) throw new HttpError(404, 'Account not found.');
    response.json(detail);
  });

  app.patch('/api/accounts/:id', (request, response) => {
    const body = request.body as Record<string, unknown>;
    const patch: Parameters<typeof updateAccount>[2] = {};
    if (typeof body.displayName === 'string') patch.displayName = body.displayName;
    if (typeof body.handle === 'string' || body.handle === null) patch.handle = body.handle;
    if (typeof body.avatarUrl === 'string' || body.avatarUrl === null) patch.avatarUrl = body.avatarUrl;
    if (typeof body.profileUrl === 'string' || body.profileUrl === null) patch.profileUrl = body.profileUrl;
    if (typeof body.studioUrl === 'string' || body.studioUrl === null) patch.studioUrl = body.studioUrl;
    const account = updateAccount(db, request.params.id, patch);
    if (!account) throw new HttpError(404, 'Account not found.');
    response.json(account);
  });

  app.delete('/api/accounts/:id', (request, response) => {
    removeAccountFromMerges(db, request.params.id);
    const removed = deleteAccount(db, request.params.id);
    if (!removed) throw new HttpError(404, 'Account not found.');
    response.status(204).end();
  });

  app.get('/api/plans', (_request, response) => {
    response.json({
      items: listPlans(db),
      tags: tagCatalogue(db),
      accounts: listAccounts(db),
      posts: listPosts(db),
    });
  });

  app.get('/api/plans/:id', (request, response) => {
    const plan = getPlan(db, request.params.id);
    if (!plan) throw new HttpError(404, 'Plan not found.');
    response.json(plan);
  });

  app.post('/api/plans', (request, response) => {
    const input = planInput(db, request.body);
    const plan = createPlan(db, input);
    response.status(201).json(plan);
  });

  app.patch('/api/plans/:id', (request, response) => {
    if (!getPlan(db, request.params.id)) throw new HttpError(404, 'Plan not found.');
    const input = planInput(db, request.body);
    const plan = updatePlan(db, request.params.id, input);
    response.json(plan);
  });

  app.delete('/api/plans/:id', (request, response) => {
    if (!deletePlan(db, request.params.id)) throw new HttpError(404, 'Plan not found.');
    response.status(204).end();
  });

  app.get('/api/merges', (_request, response) => {
    response.json({ items: listMerges(db) });
  });

  app.post('/api/merges', (request, response) => {
    const input = mergeInput(db, request.body);
    response.status(201).json(createMerge(db, input));
  });

  app.patch('/api/merges/:id', (request, response) => {
    const input = mergeInput(db, request.body);
    const merge = updateMerge(db, request.params.id, input);
    if (!merge) throw new HttpError(404, 'Merge not found.');
    response.json(merge);
  });

  app.delete('/api/merges/:id', (request, response) => {
    if (!deleteMerge(db, request.params.id)) throw new HttpError(404, 'Merge not found.');
    response.status(204).end();
  });

  app.get('/api/todos', (_request, response) => {
    response.json({ items: listTodos(db) });
  });

  app.post('/api/todos', (request, response) => {
    const title = typeof request.body?.title === 'string' ? request.body.title : '';
    try {
      response.status(201).json(createTodo(db, title));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Could not add the to-do.');
    }
  });

  app.patch('/api/todos/:id', (request, response) => {
    const body = request.body as Record<string, unknown>;
    const todo = updateTodo(db, request.params.id, {
      ...(typeof body.title === 'string' ? { title: body.title } : {}),
      ...(typeof body.done === 'boolean' ? { done: body.done } : {}),
    });
    if (!todo) throw new HttpError(404, 'To-do not found.');
    response.json(todo);
  });

  app.delete('/api/todos/:id', (request, response) => {
    if (!deleteTodo(db, request.params.id)) throw new HttpError(404, 'To-do not found.');
    response.status(204).end();
  });

  app.get('/api/community', (_request, response) => {
    response.json(getCommunityState(db, settings()));
  });

  app.post('/api/community/refresh', async (_request, response, next) => {
    try {
      const current = settings();
      if (!current.communityEnabled || !current.communityEndpoint) {
        throw new HttpError(400, 'Configure a Community status endpoint first.');
      }
      await syncCommunity(db, current);
      response.json(getCommunityState(db, current));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/settings', (_request, response) => {
    response.json(settings());
  });

  app.patch('/api/settings', (request, response) => {
    const body = request.body as Record<string, unknown>;
    const patch: Partial<AppSettings> = {};
    if (typeof body.communityEndpoint === 'string') {
      const endpoint = body.communityEndpoint.trim();
      if (endpoint && !/^(https?:\/\/|demo:\/\/)/i.test(endpoint)) {
        throw new HttpError(400, 'The status endpoint must start with http:// or https://.');
      }
      patch.communityEndpoint = endpoint;
    }
    if (typeof body.communityEnabled === 'boolean') patch.communityEnabled = body.communityEnabled;
    if (body.theme === 'light' || body.theme === 'dark' || body.theme === 'system') {
      patch.theme = body.theme;
    }
    if (typeof body.demoMode === 'boolean') patch.demoMode = body.demoMode;
    if (typeof body.firstRunCompleted === 'boolean') patch.firstRunCompleted = body.firstRunCompleted;
    for (const key of ['mediaInbox', 'mediaOutput', 'mediaArchive', 'externalWorkerUrl'] as const) {
      const value = body[key];
      if (value === null || typeof value === 'string') {
        patch[key] = value === null ? null : value.trim() || null;
      }
    }
    if (Array.isArray(body.accountOrder)) {
      patch.accountOrder = body.accountOrder.filter((item): item is string => typeof item === 'string');
    }
    updateSettings(db, patch);
    response.json(settings());
  });

  app.get('/api/sync', (_request, response) => {
    response.json(sync.state());
  });

  app.post('/api/sync', async (_request, response) => {
    const result = await sync.syncNow('manual');
    response.status(202).json({ ...result, state: sync.state() });
  });

  app.post('/api/demo/seed', (_request, response) => {
    if (listAccounts(db).length) {
      throw new HttpError(
        409,
        'This workspace already has accounts. Remove them before loading the demo workspace.',
      );
    }
    seedDemoWorkspace(db, settings());
    response.status(201).json({ ok: true, accounts: listAccounts(db) });
  });

  app.delete('/api/demo', (_request, response) => {
    removeDemoWorkspace(db);
    response.status(204).end();
  });

  if (webDist && fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_request, response) => {
      response.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    app.get('/', (_request, response) => {
      response.type('text/plain').send(
        'Creator Center API is running. Start the Vite dev server for the workspace UI.',
      );
    });
  }

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found.' });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message, fields: error.fields });
      return;
    }
    if (error instanceof PlanValidationError) {
      response.status(400).json({ error: error.message, fields: error.fields });
      return;
    }
    if (error instanceof MergeValidationError) {
      response.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    response.status(500).json({ error: 'Something went wrong on the local server.' });
  });

  return app;
}

function planInput(db: DB, body: unknown): Parameters<typeof createPlan>[1] {
  const accounts = listAccounts(db);
  const normalized = normalizePlanDraft(body, accounts);
  const posts = listPosts(db);
  for (const publication of normalized.publications) {
    const account = accounts.find((candidate) => candidate.id === publication.accountId);
    const post = posts.find((candidate) => candidate.id === publication.postId);
    if (!account || !post || post.accountId !== account.id) {
      throw new HttpError(400, 'A publication link must point at a post from the same account.');
    }
    if (post.status !== 'published') {
      throw new HttpError(400, 'A plan can only link to a published post.');
    }
  }
  return {
    title: normalized.title,
    notes: normalized.notes,
    contentType: normalized.contentType,
    format: normalized.format,
    targets: normalized.targets,
    tags: normalized.tags,
    scheduledFor: normalized.scheduledFor,
    publications: normalized.publications,
  };
}

function mergeInput(db: DB, body: unknown): Parameters<typeof createMerge>[1] {
  const accounts = listAccounts(db);
  const posts = listPosts(db);
  return validateMergeInput(body, posts, accounts);
}
