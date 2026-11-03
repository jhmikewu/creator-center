import type {
  Account,
  AppSettings,
  MigrationPreview,
  MigrationResult,
  CommunityState,
  Dashboard,
  Merge,
  Plan,
  Post,
  SyncState,
  Todo,
} from '@creator-center/shared';

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    credentials: 'same-origin',
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    throw new ApiError(
      response.status,
      typeof record.error === 'string' ? record.error : `Request failed (${response.status}).`,
      record.fields && typeof record.fields === 'object'
        ? (record.fields as Record<string, string>)
        : {},
    );
  }
  return payload as T;
}

export interface Bootstrap {
  version: string;
  today: string;
  timezone: string;
  settings: AppSettings;
  accounts: Account[];
  schemaVersion: number;
  desktop: boolean;
}

export interface PlannerResponse {
  items: Plan[];
  tags: { tag: string; count: number }[];
  accounts: Account[];
  posts: Post[];
}

export interface AccountDetail {
  account: Account;
  history: import('@creator-center/shared').HistoryPoint[];
  posts: Post[];
  plans: Plan[];
  merges: Merge[];
}

export const api = {
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),
  dashboard: (scope: { account?: string | null; platform?: string | null } = {}) => {
    const params = new URLSearchParams();
    if (scope.account) params.set('account', scope.account);
    else if (scope.platform) params.set('platform', scope.platform);
    const query = params.toString();
    return request<Dashboard>(`/api/dashboard${query ? `?${query}` : ''}`);
  },
  planner: () => request<PlannerResponse>('/api/plans'),
  account: (id: string) => request<AccountDetail>(`/api/accounts/${encodeURIComponent(id)}`),
  createAccount: (body: unknown) =>
    request<Account>('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
  updateAccount: (id: string, body: unknown) =>
    request<Account>(`/api/accounts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAccount: (id: string) =>
    request<void>(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createPlan: (body: unknown) =>
    request<Plan>('/api/plans', { method: 'POST', body: JSON.stringify(body) }),
  updatePlan: (id: string, body: unknown) =>
    request<Plan>(`/api/plans/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deletePlan: (id: string) =>
    request<void>(`/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createMerge: (body: unknown) =>
    request<Merge>('/api/merges', { method: 'POST', body: JSON.stringify(body) }),
  updateMerge: (id: string, body: unknown) =>
    request<Merge>(`/api/merges/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteMerge: (id: string) =>
    request<void>(`/api/merges/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  todos: () => request<{ items: Todo[] }>('/api/todos'),
  createTodo: (title: string) =>
    request<Todo>('/api/todos', { method: 'POST', body: JSON.stringify({ title }) }),
  updateTodo: (id: string, body: unknown) =>
    request<Todo>(`/api/todos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteTodo: (id: string) =>
    request<void>(`/api/todos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  community: () => request<CommunityState>('/api/community'),
  refreshCommunity: () =>
    request<CommunityState>('/api/community/refresh', { method: 'POST' }),
  settings: () => request<AppSettings>('/api/settings'),
  updateSettings: (body: Partial<AppSettings>) =>
    request<AppSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  sync: () =>
    request<{ started: boolean; running: boolean; state: SyncState }>('/api/sync', {
      method: 'POST',
    }),
  syncState: () => request<SyncState>('/api/sync'),
  previewMigration: (sourcePath: string) =>
    request<MigrationPreview>('/api/migration/old/preview', {
      method: 'POST',
      body: JSON.stringify({ path: sourcePath }),
    }),
  importMigration: (sourcePath: string) =>
    request<MigrationResult>('/api/migration/old', {
      method: 'POST',
      body: JSON.stringify({ path: sourcePath }),
    }),
  seedDemo: () => request<{ ok: boolean; accounts: Account[] }>('/api/demo/seed', { method: 'POST' }),
  removeDemo: () => request<void>('/api/demo', { method: 'DELETE' }),
};
