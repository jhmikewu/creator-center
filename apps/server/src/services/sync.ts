import type { AppSettings, SyncResult, SyncState } from '@creator-center/shared';
import { addDays, todayShanghai } from '@creator-center/shared';
import type { DB } from '../db.js';
import { adapterFor } from '../adapters/index.js';
import {
  deleteHistoryBefore,
  listAccounts,
  listHistory,
  replaceMetrics,
  saveHistoryPoint,
  updateAccount,
  updateAccountState,
} from '../repositories/accounts.js';
import { postsForAccount, savePosts } from '../repositories/posts.js';
import { finishSyncRun, latestSyncRun, startSyncRun } from '../repositories/sync.js';
import { syncCommunity } from './community.js';

const SIX_HOURS = 6 * 60 * 60 * 1000;

export class SyncService {
  private running = false;
  private startedAt: string | null = null;
  private finishedAt: string | null = null;
  private error: string | null = null;
  private lastResults: SyncResult[] = [];
  private timer: NodeJS.Timeout | null = null;
  private nextRunAt: string | null = null;

  constructor(
    private readonly db: DB,
    private readonly settings: () => AppSettings,
  ) {
    const latest = latestSyncRun(db);
    if (latest) {
      this.finishedAt = latest.finishedAt;
      this.error = latest.error;
      this.lastResults = latest.results;
      const base = latest.finishedAt ?? latest.startedAt;
      this.nextRunAt = new Date(new Date(base).getTime() + SIX_HOURS).toISOString();
    } else {
      this.nextRunAt = new Date(Date.now() + SIX_HOURS).toISOString();
    }
  }

  state(): SyncState {
    return {
      running: this.running,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      nextRunAt: this.nextRunAt,
      error: this.error,
      lastResults: this.lastResults,
    };
  }

  startAuto(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.syncNow('automatic');
    }, SIX_HOURS);
    this.timer.unref();
    const due = this.nextRunAt ? new Date(this.nextRunAt).getTime() <= Date.now() : true;
    if (due) {
      setTimeout(() => {
        void this.syncNow('startup');
      }, 1_500).unref();
    }
  }

  stopAuto(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async syncNow(trigger = 'manual'): Promise<{ started: boolean; running: boolean }> {
    if (this.running) return { started: false, running: true };
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.error = null;
    this.lastResults = [];
    const runId = startSyncRun(this.db, trigger);
    void this.run(runId);
    return { started: true, running: true };
  }

  private async run(runId: string): Promise<void> {
    const results: SyncResult[] = [];
    let fatal: string | null = null;
    try {
      const accounts = listAccounts(this.db);
      for (const account of accounts) {
        const adapter = adapterFor(account);
        try {
          const result = await adapter.sync({
            account,
            posts: postsForAccount(this.db, account.id),
            history: listHistory(this.db, [account.id]),
            now: new Date(),
          });
          if (result.success) {
            const write = this.db.transaction(() => {
              updateAccountState(this.db, account.id, {
                status: result.status,
                statusDetail: result.statusDetail,
                analyticsStatus: result.analyticsStatus,
                analyticsDetail: result.analyticsDetail,
                contentStatus: result.contentStatus,
                contentDetail: result.contentDetail,
                lastAttemptAt: result.capturedAt,
                lastSuccessAt: result.capturedAt,
                stale: false,
                capturedAt: result.capturedAt,
              });
              if (result.handle !== undefined) updateAccount(this.db, account.id, { handle: result.handle });
              replaceMetrics(this.db, account.id, result.metrics);
              if (result.history) saveHistoryPoint(this.db, result.history);
              savePosts(
                this.db,
                account.id,
                [...result.posts, ...result.scheduled],
                result.scheduledAuthoritative ?? true,
              );
              deleteHistoryBefore(this.db, addDays(todayShanghai(), -90));
            });
            write();
            results.push({
              accountId: account.id,
              platform: account.platform,
              displayName: account.displayName,
              status: 'ok',
              detail: result.contentStatus === 'empty' ? 'Connected; no content in the collection window.' : 'Account refreshed.',
              at: result.capturedAt,
            });
          } else {
            updateAccountState(this.db, account.id, {
              status: result.status,
              statusDetail: result.detail,
              lastAttemptAt: result.capturedAt,
              stale: result.keepPrevious,
            });
            results.push({
              accountId: account.id,
              platform: account.platform,
              displayName: account.displayName,
              status: 'error',
              detail: result.detail,
              at: result.capturedAt,
            });
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Collection failed.';
          updateAccountState(this.db, account.id, {
            status: account.lastSuccessAt ? 'connected' : 'error',
            statusDetail: detail,
            lastAttemptAt: new Date().toISOString(),
            stale: Boolean(account.lastSuccessAt),
          });
          results.push({
            accountId: account.id,
            platform: account.platform,
            displayName: account.displayName,
            status: 'error',
            detail,
            at: new Date().toISOString(),
          });
        }
      }
      await syncCommunity(this.db, this.settings());
    } catch (error) {
      fatal = error instanceof Error ? error.message : 'Sync failed.';
    } finally {
      const failed = results.filter((result) => result.status === 'error');
      const status = fatal || failed.length ? 'error' : 'ok';
      this.error = fatal ?? (failed.length ? `${failed.length} account${failed.length === 1 ? '' : 's'} could not refresh.` : null);
      this.lastResults = results;
      this.finishedAt = new Date().toISOString();
      this.nextRunAt = new Date(Date.now() + SIX_HOURS).toISOString();
      this.running = false;
      finishSyncRun(this.db, runId, status, results, this.error);
    }
  }
}
