import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Account,
  AppSettings,
  Dashboard,
  Merge,
  Plan,
  PlanDraft,
  Platform,
  SyncState,
  Todo,
} from '@creator-center/shared';
import { api, type AccountDetail, type Bootstrap, type PlannerResponse } from './api';
import { storageGet, storageSet } from './utils';

export type Scope =
  | { kind: 'all' }
  | { kind: 'platform'; platform: Platform }
  | { kind: 'account'; accountId: string };

interface Notification {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

interface WorkspaceContextValue {
  ready: boolean;
  loading: boolean;
  error: string | null;
  apiOnline: boolean;
  bootstrap: Bootstrap | null;
  dashboard: Dashboard | null;
  catalog: PlannerResponse | null;
  todos: Todo[];
  scope: Scope;
  setScope: (scope: Scope) => void;
  activeAccount: Account | null;
  settings: AppSettings | null;
  sync: SyncState | null;
  notifications: Notification[];
  notify: (message: string, tone?: Notification['tone']) => void;
  dismiss: (id: number) => void;
  refresh: (options?: { quiet?: boolean }) => Promise<void>;
  refreshDashboard: () => Promise<void>;
  savePlan: (plan: Plan | null, draft: PlanDraft) => Promise<Plan>;
  deletePlan: (id: string) => Promise<void>;
  saveMerge: (merge: Merge | null, input: Record<string, unknown>) => Promise<Merge>;
  deleteMerge: (id: string) => Promise<void>;
  addAccount: (input: Record<string, unknown>) => Promise<Account>;
  updateAccount: (id: string, input: Record<string, unknown>) => Promise<Account>;
  removeAccount: (id: string) => Promise<void>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  syncNow: () => Promise<SyncState | null>;
  loadDemo: () => Promise<void>;
  removeDemo: () => Promise<void>;
  loadAccountDetail: (id: string) => Promise<AccountDetail>;
  createTodo: (title: string) => Promise<void>;
  toggleTodo: (todo: Todo) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function scopeFromStorage(): Scope {
  const stored = storageGet<Scope>('creator-center.scope', { kind: 'all' });
  if (stored.kind === 'account' && typeof stored.accountId === 'string') return stored;
  if (stored.kind === 'platform' && typeof stored.platform === 'string') return stored;
  return { kind: 'all' };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [catalog, setCatalog] = useState<PlannerResponse | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [scope, setScopeState] = useState<Scope>(scopeFromStorage);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationId = useRef(0);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const inFlight = useRef(false);

  const notify = useCallback((message: string, tone: Notification['tone'] = 'info') => {
    const id = ++notificationId.current;
    setNotifications((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setNotifications((current) => current.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    storageSet('creator-center.scope', scope);
  }, [scope]);

  const setScope = useCallback((next: Scope) => {
    setScopeState(next);
  }, []);

  const fetchAll = useCallback(
    async (options: { quiet?: boolean } = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (!options.quiet) setLoading(true);
      try {
        const current = scopeRef.current;
        const [boot, dash, planner, todoResponse] = await Promise.all([
          api.bootstrap(),
          api.dashboard(
            current.kind === 'account'
              ? { account: current.accountId }
              : current.kind === 'platform'
                ? { platform: current.platform }
                : {},
          ),
          api.planner(),
          api.todos(),
        ]);
        setBootstrap(boot);
        setDashboard(dash);
        setCatalog(planner);
        setTodos(todoResponse.items);
        setReady(true);
        setError(null);
        setApiOnline(true);
        if (current.kind === 'account' && !boot.accounts.some((account) => account.id === current.accountId)) {
          setScopeState({ kind: 'all' });
        }
        if (current.kind === 'platform' && !boot.accounts.some((account) => account.platform === current.platform)) {
          setScopeState({ kind: 'all' });
        }
      } catch (caught) {
        setApiOnline(false);
        setError(caught instanceof Error ? caught.message : 'The local server could not be reached.');
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [],
  );

  const refreshDashboard = useCallback(async () => {
    try {
      const current = scopeRef.current;
      const dash = await api.dashboard(
        current.kind === 'account'
          ? { account: current.accountId }
          : current.kind === 'platform'
            ? { platform: current.platform }
            : {},
      );
      setDashboard(dash);
      setApiOnline(true);
    } catch (caught) {
      setApiOnline(false);
      setError(caught instanceof Error ? caught.message : 'The dashboard could not be refreshed.');
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!ready) return;
    void refreshDashboard();
  }, [scope, refreshDashboard, ready]);

  useEffect(() => {
    if (!ready) return;
    const delay = dashboard?.sync.running ? 2500 : 30_000;
    const timer = window.setInterval(() => {
      void refreshDashboard();
    }, delay);
    const onVisibility = () => {
      if (!document.hidden) void refreshDashboard();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dashboard?.sync.running, ready, refreshDashboard]);

  const theme = bootstrap?.settings.theme ?? 'system';
  const fontScale = bootstrap?.settings.fontScale ?? 1.12;
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    const scale = Math.min(1.4, Math.max(0.9, fontScale));
    document.documentElement.style.setProperty('--font-scale', String(scale));
    document.documentElement.dataset.fontScale = String(scale);
  }, [fontScale]);

  const settings = bootstrap?.settings ?? null;
  const activeAccount = useMemo(() => {
    if (!dashboard || scope.kind !== 'account') return null;
    return dashboard.accounts.find((account) => account.id === scope.accountId) ?? null;
  }, [dashboard, scope]);

  const savePlan = useCallback(
    async (plan: Plan | null, draft: PlanDraft) => {
      const saved = plan ? await api.updatePlan(plan.id, draft) : await api.createPlan(draft);
      await fetchAll({ quiet: true });
      notify(plan ? 'Plan updated.' : 'Plan created.', 'success');
      return saved;
    },
    [fetchAll, notify],
  );

  const deletePlan = useCallback(
    async (id: string) => {
      await api.deletePlan(id);
      await fetchAll({ quiet: true });
      notify('Plan deleted.', 'success');
    },
    [fetchAll, notify],
  );

  const saveMerge = useCallback(
    async (merge: Merge | null, input: Record<string, unknown>) => {
      const saved = merge ? await api.updateMerge(merge.id, input) : await api.createMerge(input);
      await fetchAll({ quiet: true });
      notify(merge ? 'Merge updated.' : 'Posts merged.', 'success');
      return saved;
    },
    [fetchAll, notify],
  );

  const deleteMerge = useCallback(
    async (id: string) => {
      await api.deleteMerge(id);
      await fetchAll({ quiet: true });
      notify('Merge removed. The posts are separate again.', 'success');
    },
    [fetchAll, notify],
  );

  const addAccount = useCallback(
    async (input: Record<string, unknown>) => {
      const account = await api.createAccount(input);
      await fetchAll({ quiet: true });
      notify('Account added.', 'success');
      return account;
    },
    [fetchAll, notify],
  );

  const updateAccount = useCallback(
    async (id: string, input: Record<string, unknown>) => {
      const account = await api.updateAccount(id, input);
      await fetchAll({ quiet: true });
      notify('Account updated.', 'success');
      return account;
    },
    [fetchAll, notify],
  );

  const removeAccount = useCallback(
    async (id: string) => {
      await api.deleteAccount(id);
      if (scope.kind === 'account' && scope.accountId === id) setScopeState({ kind: 'all' });
      await fetchAll({ quiet: true });
      notify('Account removed with its local data.', 'success');
    },
    [fetchAll, notify, scope],
  );

  const saveSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const saved = await api.updateSettings(patch);
      setBootstrap((current) => (current ? { ...current, settings: saved } : current));
      await refreshDashboard();
      notify('Settings saved.', 'success');
    },
    [notify, refreshDashboard],
  );

  const syncNow = useCallback(async (): Promise<SyncState | null> => {
    try {
      const result = await api.sync();
      if (!result.started) notify('A sync is already running.', 'info');
      await refreshDashboard();
      let state = result.state;
      const deadline = Date.now() + 90_000;
      while (state.running && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        state = await api.syncState();
      }
      await refreshDashboard();
      if (state.running) {
        notify('The sync is taking longer than expected. Open the account to see its current state.', 'info');
      } else {
        const unexpected = state.lastResults.filter(
          (result) => result.status === 'error' && !result.detail.includes('no live collector'),
        );
        const first = unexpected[0];
        if (first) {
          notify(`${first.displayName}: ${first.detail}`, 'error');
        } else {
          notify('Sync finished.', 'success');
        }
      }
      return state;
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Could not start a sync.', 'error');
      return null;
    }
  }, [notify, refreshDashboard]);

  const loadDemo = useCallback(async () => {
    await api.seedDemo();
    setScopeState({ kind: 'all' });
    await fetchAll({ quiet: true });
    notify('Demo workspace loaded. It is clearly marked and can be removed in Settings.', 'success');
  }, [fetchAll, notify]);

  const removeDemo = useCallback(async () => {
    await api.removeDemo();
    setScopeState({ kind: 'all' });
    await fetchAll({ quiet: true });
    notify('Demo workspace removed.', 'success');
  }, [fetchAll, notify]);

  const loadAccountDetail = useCallback((id: string) => api.account(id), []);

  const createTodo = useCallback(
    async (title: string) => {
      await api.createTodo(title);
      setTodos((await api.todos()).items);
    },
    [],
  );

  const toggleTodo = useCallback(async (todo: Todo) => {
    const updated = await api.updateTodo(todo.id, { done: !todo.done });
    setTodos((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  const deleteTodo = useCallback(async (id: string) => {
    await api.deleteTodo(id);
    setTodos((current) => current.filter((item) => item.id !== id));
  }, []);

  const value: WorkspaceContextValue = {
    ready,
    loading,
    error,
    apiOnline,
    bootstrap,
    dashboard,
    catalog,
    todos,
    scope,
    setScope,
    activeAccount,
    settings,
    sync: dashboard?.sync ?? null,
    notifications,
    notify,
    dismiss,
    refresh: fetchAll,
    refreshDashboard,
    savePlan,
    deletePlan,
    saveMerge,
    deleteMerge,
    addAccount,
    updateAccount,
    removeAccount,
    saveSettings,
    syncNow,
    loadDemo,
    removeDemo,
    loadAccountDetail,
    createTodo,
    toggleTodo,
    deleteTodo,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider.');
  return value;
}

