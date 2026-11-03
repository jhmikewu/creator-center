# Creator Center — implementation notes

This document records what the first implementation increment actually delivers, how the
workspace is put together, and what is deliberately left for the next increments. The source of
truth for product behaviour remains [REQUIREMENTS.md](../REQUIREMENTS.md).

## Architecture

```
Electron main (apps/desktop)
  ├─ spawns Node sidecar on an ephemeral 127.0.0.1 port
  ├─ waits for GET /api/health
  ├─ loads the built React renderer from apps/web/dist
  └─ window state + single-instance lock + native notification bridge

Node sidecar (apps/server)
  ├─ Express JSON API on loopback only
  ├─ SQLite database in the configured data directory
  ├─ repositories for accounts, metrics/history, posts, plans, merges,
  │  tags, Community snapshots, to-dos, settings and sync runs
  ├─ pure domain logic from packages/shared
  ├─ sync coordinator with a platform-adapter contract
  └─ serves the renderer build in production

React renderer (apps/web)
  ├─ workspace context: bootstrap, dashboard scope, plans, to-dos, settings
  ├─ overview, account drawer, planner, post graph/merges, Community,
  │  Media roadmap, About/to-dos, Settings
  └─ shared domain logic imported from packages/shared
```

The sidecar is a separate Node process so `better-sqlite3`'s native binary uses the Node ABI,
not Electron's. In a packaged build the same contract can bundle a Node runtime; packaging is
not part of this increment.

## Data model

| Table | Purpose |
| --- | --- |
| `accounts` | One row per platform account, including two accounts on the same platform. |
| `account_metrics` | One row per metric with scope, availability, value, period, source, reason and measured-at. |
| `account_history` | Daily per-account follower/post/engagement history for the 90-day retention. |
| `posts` | Published or platform-scheduled content, keyed by `(account_id, remote_id)`. |
| `plans` | Local plans; plans never publish. |
| `plan_targets` | Platform-level (`account_key = '*'`) or specific-account targets. |
| `plan_tags`, `tags` | Normalised tag catalogue. |
| `publications` | One existing published post per plan and account; a record, never an action. |
| `merges`, `merge_members` | Local 2–5 post groups, at most one post per account. |
| `community_snapshots` | Latest status/catalogue payload per source day. |
| `todos` | Personal to-do list. |
| `settings` | Key/value settings; `dataDir` is reported from the runtime. |
| `sync_runs` | Start/finish, trigger, errors and per-account results. |
| `demo_entities` | IDs created by the demo seed, so removal does not touch real data. |

The important invariant is that **prices, metrics, posts and history are always joined through
an account ID**, never a platform key. A plan target may be a platform (meaning every current
and future account on it) or a specific account (Q25).

## Requirement status

Legend: **Done** = implemented and exercised in this increment; **Partial** = foundation or
read-side present, live integration absent; **Next** = deliberately deferred.

### Accounts and sessions (ACC)

| Requirement | Status | Notes |
| --- | --- | --- |
| ACC-01, ACC-02 | Done | Add accounts on four enabled platforms; multiple accounts per platform; stable account IDs. YouTube is disabled in this build. |
| ACC-03, ACC-04, ACC-09, ACC-10 | Partial | Embedded isolated sessions and all four live collectors (抖音, Bilibili, 小红书, 公众号) are in. YouTube is disabled while its OAuth collector is deferred; connection management remains. |
| ACC-05 | Done | Per-account status, analytics/content state, last attempt/success and re-auth action. |
| ACC-06 | Partial | Six-hour/manual sync coordinator, overlap guard, progress and results; real adapters next. |
| ACC-07 | Done | A failed refresh keeps the previous reading and marks it stale. |
| ACC-08 | Done | Studio and public-profile links per account. |
| ACC-11 | Done | Platform adapter contract + capability declarations in `packages/shared` and `apps/server/adapters`. |
| ACC-12 | Done | Rename/remove, confirmation, local cascade; remove is tested at the API level. |

### Overview and monitoring (MON)

| Requirement | Status | Notes |
| --- | --- | --- |
| MON-01, MON-02, MON-09 | Done | Cards, detailed drawer, on-demand sync and automatic refresh. |
| MON-03, MON-04 | Done | Metric scope/availability/period/source/reason; measured zero, pending and unsupported are distinct. |
| MON-05 | Done | Follower dot pool, 7-day gain, per-account history; separate Community sparklines. |
| MON-06 | Done | Latest measurement time and next-sync indicator. |
| MON-07 | Partial | 90-day history retained/pruned; 30-day chart shown. Seeded demo has 30 days. |
| MON-08 | Done | Per-post metrics in the 60-day window on the account view. |
| MON-10, MON-12 | Done | Scope switcher (all/platform/account), explicit sums and labels. |
| MON-11 | Done | Redesigned hierarchy: KPI band, account cards, growth, distribution, 30-day posting graph. |

### Content planner (PLN)

| Requirement | Status | Notes |
| --- | --- | --- |
| PLN-01..07, PLN-09, PLN-11 | Done | Full CRUD, defaults, formats, tags/aliases, filters, privacy, dirty-guard, delete confirmation, undated plans, platform/all-account/specific targets. |
| PLN-08 | Done | One published post per selected account; links survive collection-window changes. |
| PLN-10 | Partial (v0.1.7) | Plan dates are edited in the plan dialog; the overview drag surface was removed with the timeline in v0.1.7 (issue #17). Pinned publication plans still stay put. |

### Timeline, publications and merges (TML)

> v0.1.7 replaces the overview timeline with the 30-day post-date graph (issue #17): the rows below describe the v0.1.6 calendar that was dropped. Merges, post details, links and scheduling data are still shown, now from the graph and the Content planner. The TML-01..03 calendar requirements are superseded by the owner's issue.

| Requirement | Status | Notes |
| --- | --- | --- |
| TML-01..05, TML-08, TML-10 | Done | 15-day Asia/Shanghai calendar, lanes, distinct markers, account labels, metrics, links, 2–5 post merges (one per account), edit/unmerge, ideas and plan list. |
| TML-06 | Done in model/UI | Scheduled posts show pending; a published post keeps its ID so a merge survives. |
| TML-07 | Done | Merges and links are resolved from collected posts with graceful fallback when a member leaves the window. |
| TML-09 | Done | Responsive layout, full-height rows, scrollable lanes, no clipped slivers. |
| TML-11 | Next | The 公众号 adapter will add scheduled-post collection; capability is declared, data not live. |

### Analytics (ANL)

| Requirement | Status | Notes |
| --- | --- | --- |
| ANL-01..04, ANL-07 | Partial | Normalised metric set, scopes, availability, per-account daily history and per-post breakdown are in place; live platform semantics await collectors. |
| ANL-05, ANL-06 | Done | Audience sum with "not unique people" caveat; Community kept separate. |
| ANL-08..10 | Next/Partial | CSV export and period comparison deliberately deferred; account/platform scope selection exists. |

### Media and covers (MED/COV)

| Requirement | Status | Notes |
| --- | --- | --- |
| MED-01..12, COV-01..07 | Next | Media paths/worker endpoint/theme are stored, and the Media page describes the pipeline. No FFmpeg job runs yet. |

### Community (COM)

| Requirement | Status | Notes |
| --- | --- | --- |
| COM-01..04 | Done | Configurable endpoint, connectivity/auth/latency, 24h/7d/all-time counts, worker/timer health, management cards, 30-day history and last-good snapshot. |
| COM-05 | Done | Optional endpoint; missing/unavailable endpoint degrades without affecting the rest. |

### Desktop and operations (DES)

| Requirement | Status | Notes |
| --- | --- | --- |
| DES-01, DES-02 | Partial | Electron shell starts a local Node sidecar with no Docker, TLS or external server; installers/packaging next. |
| DES-03 | Done | Database/settings in a documented app-data directory; media paths configurable. |
| DES-04 | Done | Background sync coordinator, progress, manual sync, non-blocking UI. |
| DES-05, DES-09, DES-10 | Next/Partial | Notification bridge exists; tray/auto-update/signing next. |
| DES-06 | Done | Window state restore and single-instance lock. |
| DES-07 | Partial | Cached data remains usable offline; 抖音 is live, the other platform adapters remain unavailable. |
| DES-08 | Partial | Data directory documented and visible; backup/restore next. |
| DES-13 | Partial | External worker URL is stored; validation/health next. |
| DES-11 | Done | English UI, platform names preserved. |
| DES-12 | Next | Optional app lock deferred (Q16 working assumption: OS account is enough). |

### UX, security and data (UX/SEC/DAT)

| Requirement | Status | Notes |
| --- | --- | --- |
| UX-01..05, UX-08..10, UX-12..14 | Done | Coherent design system, account identity everywhere, detailed view with a collapsed 5-metric summary, Text size setting with live preview, visible focus, empty/loading/error states, first-run/empty-state onboarding, dirty guard, cleaner dashboard, account switcher. |
| UX-06, UX-07, UX-11 | Done | Responsive down to laptop widths, light/dark/system, Text size scaling, macOS traffic-light spacing, About/to-dos/changelog. |
| SEC-01, SEC-02 | Partial | Browser session cookies live in Electron's persistent Chromium profile; OAuth tokens are not stored yet and log redaction remains. |
| SEC-03, SEC-04 | Done | Local-only API bind, no telemetry, no inbound listener by default. |
| SEC-05, SEC-06 | Partial | OS account model; least-privilege file mode work next. |
| DAT-01, DAT-07 | Done | Versioned SQLite migrations; reopening and demo seeding are tested. |
| DAT-02, DAT-08 | Done | Old accounts, metrics, history, posts, plans, tags, merges, to-dos and Community history import through a previewed, transactional importer with stable legacy IDs. |
| DAT-03 | Partial | Media project metadata is preserved in `legacy_media_jobs`; media files are not relinked until the media pipeline lands. |
| DAT-04 | Next | YouTube OAuth material is deliberately not migrated; accounts reconnect after import. |
| DAT-05 | Partial | Pre-import backup and a documented data directory exist; general backup/restore remains next. |
| DAT-06, DAT-08 | Partial | 90-day history pruning and cascade removal exist; retention UI and full old-model migration next. |

## Sync and adapter contract

`apps/server/src/adapters/types.ts` defines the seam:

- `AdapterContext` gives the account, its current posts/history and the collection time.
- A successful result supplies account state, metric metadata, an optional history point and the
  full published/scheduled post set. The coordinator writes it atomically.
- A failed result supplies a status/detail and `keepPrevious`; the coordinator only updates the
  attempt state and stale marker.
- The demo adapter (`SimulatorAdapter`) refreshes seeded demo accounts and promotes a scheduled
  post to published with the same ID at its release time.
- The real adapters are `UnavailableAdapter` stubs today: they explicitly report setup required
  or stale, never invent a metric. Replacing one with a live collector does not change the
  overview, planner or timeline.

## Live collection

- `apps/desktop/src/collector/` owns the isolated sessions. `connectSession` opens a login
  window in a `persist:cc-account-<id>` partition; the hidden collector reuses that partition.
- The desktop starts a loopback-only collector bridge and passes its URL to the sidecar as
  `CREATOR_CENTER_COLLECTOR_URL`. The sidecar posts the account to `/collect` and receives only
  the mapped capture, never cookies.
- `apps/server/src/adapters/live.ts` uses the bridge for 抖音, Bilibili, 小红书 and 公众号;
  `apps/server/src/collectors/douyin.ts` parses the profile, published and timed work lists and
  the overview; `bilibili.ts` parses the nav, lifetime index, fans, archive pages, timed
  releases and the video analytics; `xiaohongshu.ts` parses the profile, seven-day note analytics,
  notes and timed releases; `wechat.ts` parses the console totals, publish list, recent
  articles and useranalysis report. `npm test` covers all four parsers and the bridge adapter.
- The Bilibili collector walks the signed-in member home, fans, content manager and data-up
  pages; `apps/server/src/collectors/bilibili.ts` reads the nav, lifetime index, fans, archive
  pages, timed releases and the displayed video analytics. Its live walk needs the owner's
  signed-in session; the parser is covered by tests.
- All four browser collectors are ported. A signed-out session reports `login_required`; a
  failed capture keeps the previous reading and marks it stale. YouTube is disabled while its
  OAuth collector is deferred.
- The first live test exposed a startup deadlock: the CDP network observer was enabled before
  the hidden page had a renderer. The collector now loads `about:blank` first, bounds every
  navigation and page script, and caps a capture at 60 seconds; the sidecar aborts at 75. The
  Sync action waits for completion and refreshes the account.
- The current console no longer requests the old profile and overview JSON endpoints, and its
  manager list is filter-driven. The collector now fetches the profile endpoint in the page's
  signed-in origin, reads the displayed overview analytics when the JSON endpoint is absent,
  and fetches the published (`status=1`) and timed (`status=0`) work lists directly with
  `max_cursor`. A saved-session check returned a ready snapshot with the profile, five
  published posts, analytics and history.

## Migration

`apps/server/src/services/import-old.ts` owns the import:

- `previewOldWorkspace` opens the source read-only, verifies the expected tables, counts accounts,
  content, history, plans, merges, to-dos, tags, Community days and media jobs, and reports
  destination readiness without writing.
- `importOldWorkspace` requires an empty destination, creates a timestamped backup, then runs one
  SQLite transaction. It maps old platform accounts to stable `legacy-<platform>` IDs, metrics to
  scoped/available metadata, history by account, content by `(account, remote id)`, plan targets
  to platform-level targets, publication links by content ID, merges by content ID, to-dos with
  their timestamps, and Community history to snapshots.
- Media payloads go to `legacy_media_jobs` for the media increment; browser sessions, OAuth tokens
  and dashboard sessions are never imported.
- `POST /api/migration/old/preview` and `POST /api/migration/old` expose the same service; the
  Settings card and `npm run import:old` are the two entry points.

## Visual evidence

### UI review follow-up (v0.1.1)

- `before-ui-pass-overview.png` / `after-overview.png` — typography before and after, same 1440×940
  light overview.
- `before-ui-pass-account.png` / `after-account-detail.png` — all-metrics table versus the collapsed
  five-metric essentials.
- `after-settings.png` — Text size control (Compact, Comfortable, Large) and live preview at 112%.
- `after-overview-large.png`, `after-settings-large.png` — the Large 130% setting; no horizontal
  overflow at 1200 px.
- `after-account-metrics-expanded.png` — the expanded all-11-metrics state.
- `after-macos-desktop.png` — actual Electron renderer on macOS with the sidebar moved below the
  traffic lights. `capturePage` omits the native controls; measured in the window: 58 px sidebar
  padding, brand y=58, 46 px drag strip, top bar x=248.
- `after-import-preview.png` — migration preview from the scrubbed old database: 5 accounts,
  20 content items, 107 history points, 6 merges, 5 to-dos, 23 Community days and 10 media jobs.
- `after-import-confirm.png`, `after-import-success.png` — import confirmation and the backup/success state.
- `after-import-overview.png` — the imported accounts in the workspace.

### Original increment

- `before-old-overview.png` — real `creator-center-old` frontend, 1440×940, light, fixture API.
- `after-overview.png` — new overview, 1440×940, light, demo SQLite workspace.
- `after-timeline.png` — the same overview scrolled to the 15-day calendar.
- `after-account-detail.png` — per-account drawer with metric metadata and history.
- `after-planner.png`, `after-plan-dialog.png` — planner list and editor.
- `after-merge-dialog.png` — account-keyed cross-post merge editor.
- `after-community.png`, `after-settings.png`, `after-about.png`, `after-overview-dark.png`.
- `after-overview-full.png` — full-height overview for layout review.

The captures were produced with a browser at a 1440×940 CSS viewport. The fixture API for the old
capture transformed the demo data into the old app's shape; no old-app code was changed.

## Verification performed

- `npm test` — 58 tests, all passing (including the font-scale settings round-trip, the synthetic old-database import, the 抖音 parser and the live bridge adapter).
- `npm run typecheck` — shared, server, web and desktop, with `noUnusedLocals`/`noUnusedParameters`.
- `npm run build` — all four packages build; Vite production bundle produced.
- API smoke: bootstrap, dashboard, plans, sync, Community, settings, demo seed/remove.
- Live collector smoke: the desktop bridge received the sidecar request, the signed-out 抖音 partition returned `login_required`, and the sync updated the account state.
- Desktop shell: Electron launched the sidecar on an ephemeral port, `/api/health` returned
  `desktop: true`, and the renderer loaded from the built assets.
- Visual smoke: overview, account drawer collapsed/expanded metrics, planner, plan dialog, timeline,
  merge dialog, Community, Settings, About, dark theme and Text size preview at 1440×940; Electron
  DOM check on macOS confirmed the 58 px sidebar offset and 46 px drag strip.

## Open limitations

- No live platform session, collector or OAuth flow exists yet; real accounts show a truthful
  setup state.
- No media job, cover render or installer is produced yet.
- Community parsing understands the old app's status shape and a tolerant simple shape; a real
  endpoint should be verified against the owner's service.
- The demo workspace is opt-in and clearly marked; it is not auto-seeded.
- The old app's data has not been imported; this is a separate migration ticket.
