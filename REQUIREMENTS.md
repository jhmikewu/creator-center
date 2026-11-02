# Creator Center — Product Requirements

- **Status:** Draft v0.3 — old app reviewed; owner decisions incorporated
- **Source brief:** [Issue #1](https://github.com/jhmikewu/creator-center/issues/1)
- **Old app:** [jhmikewu/creator-center-old](https://github.com/jhmikewu/creator-center-old) (reviewed 2026-11-03)
- **Last updated:** 2026-11-03

This is the requirements document for the new standalone Creator Center. Version 0.1 was
written before the old app could be opened; version 0.2 was based on the old app's README,
developer notes, backend and frontend code, and tests. Version 0.3 records the owner's answers
to the first round of questions and adds a per-platform publishing feasibility assessment.
The remaining decisions are in §12.

## Decisions recorded (2026-11-03)

- **D1 — Multiple accounts per platform.** Each platform may have more than one account; the
  app must isolate the accounts and show them separately. (Answers Q1.)
- **D2 — Community included.** The Discourse monitor and its growth history are part of the
  work. (Answers Q2 for the Community part; About/to-dos remains Q22.)
- **D3 — No publishing in v1.** The app stays read/plan/track. A per-platform publishing
  feasibility assessment is in §7.1. (Answers Q3.)
- **D4 — Unraid/NFS allowed.** The app may use the existing Unraid media worker and NFS share;
  it must not require them for the core workspace. (Answers Q4.)
- **D5 — Redesign direction.** A cleaner overall dashboard and a more detailed per-account
  view. (Answers Q5's direction; visual references and dark mode remain open.)
- **D6 — 公众号 scheduled posts.** Add 公众号 to the collected scheduled-post coverage.
  (Answers Q17.)

**How to review this draft**

1. Check the old-app summary in §2 and the parity matrix in §8 — correct anything that is
   wrong or missing.
2. Confirm or correct the interpretation of the brief in §3 and the decisions in D1–D6.
3. Review the publishing feasibility in §7.1 and answer the remaining decisions in §12
   (Q6–Q25), especially Q21 (account scale) and Q23 (publishing priority).

---

## Contents

1. [Overview](#1-overview)
2. [The old app today](#2-the-old-app-today)
3. [Requirements from the brief](#3-requirements-from-the-brief)
4. [Goals and non-goals](#4-goals-and-non-goals)
5. [Users and scale](#5-users-and-scale)
6. [Functional requirements](#6-functional-requirements)
7. [Platform scope and collection coverage](#7-platform-scope-and-collection-coverage)
8. [Parity matrix](#8-parity-matrix)
9. [Non-functional requirements](#9-non-functional-requirements)
10. [Technical considerations](#10-technical-considerations)
11. [Proposed delivery phases](#11-proposed-delivery-phases)
12. [Open questions and working assumptions](#12-open-questions-and-working-assumptions)
13. [Risks](#13-risks)
14. [Glossary](#14-glossary)

---

## 1. Overview

Creator Center is a personal workspace for one physics creator. It monitors the creator's
accounts on five platforms — 抖音, 小红书, 公众号, Bilibili and YouTube — tracks followers,
views, likes, comments and other metrics, plans content, follows published and scheduled
posts on a calendar, processes finished recordings into upload-ready clips, generates video
covers, and shows the status of the creator's community forum.

The old app is a single-user web dashboard that runs on a private LAN host with Docker, a
separate Chromium container for platform sessions, and a media-processing worker on another
machine. The new app must deliver the same workflows as a **standalone desktop application for
Windows and macOS**, with a **redesigned** interface and a simpler way to install, run and
maintain it.

This document is written to make the old app's behavior explicit, separate feature parity
from redesign, and surface the decisions that change the architecture.

## 2. The old app today

### 2.1 What it is

- A single-user, private workspace for a physics teacher, used daily.
- English UI, Asia/Shanghai dates and timezone.
- Five platforms — 抖音, 小红书, 公众号, Bilibili, YouTube — with exactly one account each.
- Content types tuned to physics teaching: paper walkthroughs, short lectures, question
  videos, text/image guides, and exam/competition information.
- It does **not** publish to platforms, like or comment on the creator's behalf, or manage
  multiple accounts per platform. Publishing is done manually on each platform; the app
  records what happened. The new app must add multiple accounts per platform (D1), which the
  old app's platform-keyed account model does not support.
- It is a web app, not a desktop app. The phone layout is responsive, so it can be used from
  a phone on the same network.

### 2.2 Current architecture

| Layer | Old implementation |
|---|---|
| UI | React 19 + Vite + TypeScript, served by nginx over HTTPS on the LAN |
| API | Python FastAPI app with SQLite, HTTP client for official APIs, Playwright for browser collectors |
| Platform browser | A separate Chromium container with a persistent profile, exposed as a remote desktop for logins and driven over the Chrome DevTools Protocol |
| Media worker | A separate Docker container on a more powerful host, using FFmpeg to convert recordings and cut chapter clips |
| Media storage | An NFS share mounted by the API and the worker; project folders hold the original, full MP4, edited/joined videos and clips |
| Cover renderer | A separate Chromium service with HTML/CSS templates, fonts and exam-paper presets |
| Deployment | Docker Compose on a private host, plus a worker on another host, a watchdog for the NFS mount, and a self-signed TLS certificate |
| Authentication | One dashboard user with a password file; 30-day or 12-hour sessions stored as hashed tokens in SQLite |

### 2.3 Feature inventory

**Overview**

- Channel cards show followers, views, likes and post counts for each of the five channels.
- Each card shows connection/freshness state and opens a channel notebook.
- A follower growth area shows one dot per follower (scaled above 200), channel colors, the
  7-day gain, and a total; a separate "community forum growth" area shows its catalogue totals.
- A publishing timeline sits beside the cards; it mixes plans, published posts and
  platform-scheduled posts on a calendar.
- The layout is responsive and switches to a simpler stacked/column arrangement on smaller
  viewports.

**Channel notebook**

- Account identity, connection status, analytics status, last attempt/success times.
- Every metric with its scope (`lifetime`, `current`, `window`), availability (`value`,
  `pending`, `unsupported`), reporting period, source and reason.
- Follower history chart for the last 30 days (the API retains 90 days).
- Published content list from the last 60 days plus today, with per-post metrics.
- Links to the platform's creator studio, the public profile, and the browser sessions.
- A "New plan for this channel" action.

**Content planner**

- A plan has a title, optional notes, a content type, a format, one or more platforms, an
  optional calendar date (no time), tags and optional publication links.
- Content type drives default platforms and format:
  - paper walkthrough / short lecture → Bilibili + YouTube, video;
  - question video → 抖音 + 小红书, video;
  - text guide / exam information → 小红书, print.
- Notes support hashtags; tags are normalized, and exam aliases (AS, A2, A-Level, AP, BPhO,
  PhysicsBowl) collapse to canonical tags.
- The plan list supports filtering and exposes the tag catalogue.
- Plans are private: they are never published to a platform.
- Unsaved-change protection and delete confirmation are part of the workflow.

**Timeline and publications**

- An adaptive calendar in Asia/Shanghai with a date column and Video/Print lanes; date rows
  fill the available height and scroll internally when crowded.
- Plans, published posts and platform-scheduled posts have distinct markers. Every item on a
  visible date is shown; there are no preview bundles.
- Tooltips show plan details or per-platform post metrics; cards open the plan editor or post
  details.
- Plans can be dragged to another date, or moved with the keyboard; published or linked items
  stay on their publication date.
- Published posts can be linked to a plan per platform, so the plan shows what was actually
  published. Linking records an existing post; it does not publish anything.
- A **merge** groups 2–5 published posts that carry the same content, at most one per
  platform. The timeline shows one card on the earliest date, with each platform's statistics
  kept separate. A merge can be edited or unmerged.
- Scheduled posts are read from the platforms' creator managers where available (抖音,
  小红书, Bilibili, YouTube); 公众号 is not read yet. They are shown as pending until they go
  live, and a live post keeps the same ID so a merge survives the transition.

**Media processing**

- A watched inbox detects new `.mov`/`.mp4` recordings, including while they are still being
  copied, and waits for the file to settle before queueing it.
- The worker converts the source to a compatible full MP4 (H.264/AAC, fast-start), with
  warnings for unusual audio, HDR, or QuickTime PCM.
- Chapter export uses `mm:ss Title` lines; clips are cut from the existing H.264 video and
  audio without re-encoding where possible. An `# excluding` syntax removes ranges and
  re-renders; chapter times are shifted accordingly.
- Two-screen recordings (a MacBook and an iPad recording of the same lesson) are paired by
  name, aligned by their audio, joined side by side with a switchable screen per range, and
  clap sounds are detected and cut at range boundaries.
- Renders can be parallelised; the worker has a single-job queue with progress, worker
  heartbeat, retry/cancel, and a lease-based recovery.
- Finished projects are archived once their files are linked to a plan or published post;
  archive and discard are journaled and recoverable.
- The Media tab shows the worker health, the watched inbox, detected sources, active and
  archived recordings, downloads, previews, covers, and linked plans/posts.
- Files are served through authenticated, range-capable endpoints.

**Video covers**

- From a recording with a finished full MP4, the app creates four PNG covers: 16:9
  (1920×1080), 4:3 (1600×1200), large-text 4:3 (1600×1200) and 3:4 (1200×1600).
- Inputs: title, optional highlighted word, optional subtitle, optional year and a style.
- Styles: BPhO (default), Cambridge, AP, Edexcel, chosen automatically from keywords in the
  title/subtitle or manually.
- The renderer is deterministic: a blurred, tilted crop of an exam-paper cover behind a
  frosted panel, built from HTML/CSS and fixed fonts/presets. It uses no image model.
- Unreserved cover sets are deleted after 7 days; a set can be reserved to keep it.
- Cover files live with the recording, move to archive with it, and are deleted with it.

**Community monitor**

- Reads a separate Discourse status API and shows:
  - connectivity/authentication/latency of the remote forum;
  - catalogue counts for all time, 24 hours and 7 days (topics, posts, words, formulas,
    images, graphs, animations, videos);
  - worker/service and timer health;
  - mention jobs, graph/animation jobs, and PDF resource status;
  - daily catalogue history for the community growth chart.
- The feed refreshes about once a minute; the app keeps the last successful snapshot when the
  source is unavailable.

**YouTube connection**

- Uses the official YouTube Data API v3 and YouTube Analytics API, read-only.
- The user imports a Google Desktop OAuth client JSON, connects, completes consent in a
  browser, and selects a channel if more than one is available.
- Scopes are `youtube.readonly` and `yt-analytics.readonly`; tokens refresh automatically.
- It collects channel statistics, uploads/published videos, and the last 28 completed days of
  analytics (watch time, average duration, interactions) where available.
- The connection is implemented but, at the time of review, is waiting for the owner's client
  JSON and Google consent; live authorized readings have not been verified.

**Browser sessions**

- A remote Chromium desktop on the LAN, used to sign in to the four browser-collected
  platforms and to complete Google consent. The persistent profile survives restarts.
- The API drives the same browser over CDP to collect metrics and content.
- The desktop is password-free on the trusted LAN; the dashboard itself has a separate login.

**About**

- A personal to-do list stored in SQLite (add, complete, delete).
- A changelog generated from the frontend release notes.

### 2.4 Platforms and data coverage

The old app has exactly one account per platform; the new app must support several (D1). The
coverage below is per account and would be repeated for each account on the same platform.

| Platform | Access method | Account data collected | Content collected | Known limits |
|---|---|---|---|---|
| 抖音 (Douyin) | Signed-in creator console, read through Playwright | Identity, followers, following, received likes, published count, overview analytics | Published works; scheduled works | `watch_hours` unsupported; analytics permission must be enabled; period and lifetime totals have different meanings |
| 小红书 (Xiaohongshu) | Signed-in creator console, read through Playwright | Identity, followers, following, note count, 7-day views/likes/comments/shares/saves | Published notes; scheduled notes | `watch_hours` and `avg_view_seconds` unsupported; profile likes and saves are combined, never split; completion rate unavailable without video views |
| 公众号 (WeChat Official Accounts) | Signed-in console pages | Identity, total followers, yesterday's reads and shares, published count | Published list; add scheduled posts (D6) | Following, likes, comments, saves, watch time, average duration and completion rate are not reported; content rows had not been observed with real content, so parsing is shape-based |
| Bilibili | Signed-in creator console, read through Playwright | Identity, followers, published-video count, per-video metrics | Accepted/published videos; scheduled videos (unverified against a live scheduled row) | `following` and `watch_hours` unsupported; the aggregate overview response was null while per-video statistics worked; the manager label can change |
| YouTube | Official Data and Analytics APIs | Channel statistics (followers/subscribers, public video count, lifetime views) | Uploads, Shorts, livestreams; last 28 completed days of analytics | Requires a Google Desktop OAuth client and consent; `following` and `saves` unsupported; hidden follower counts remain unknown; live authorized readings pending |

All four browser collectors stop at a login, CAPTCHA or setup gate rather than guessing. A
failed refresh keeps the last successful reading and marks it stale. A measured zero is not
the same as an unknown metric, and the UI distinguishes them.

### 2.5 Data model

The old app stores its state in one SQLite database:

| Table / entity | Purpose |
|---|---|
| `accounts` | One JSON payload per platform: identity, status, metrics, metric metadata, latest content, scheduled content, freshness |
| `history` | One daily metric snapshot per platform, used for follower growth and other trends |
| `plans` | One JSON payload per plan: title, notes, content type, format, platforms, date, tags, publication links, timestamps |
| `tags` | The normalized tag catalogue |
| `post_merges` | Local groups of 2–5 published posts across platforms |
| `discourse_history` | Daily community catalogue snapshots (topics, formulas, graphs, animations) |
| `state` | Miscellaneous persisted state, including the last Discourse snapshot |
| `todos` | The personal to-do list |
| `auth_sessions` | Hashed dashboard session tokens |
| Media tables | Media jobs, stages, files, links to plans/posts, cover sets and reservation state |

The media files themselves live outside SQLite in the NFS share. YouTube OAuth material lives
in a private directory, and browser cookies live in the Chromium profile.

The new data model must key an account by its own ID, not by platform, so several accounts on
the same platform can coexist. Each account needs its own identity, session material, status,
metrics, content and history, and plan/merge/media links must be able to point at a specific
account (D1).

### 2.6 Current pain points and gaps

These are the things the redesign and the standalone packaging should address. They come from
the old app's own notes and code.

- **Heavy deployment.** Docker Compose, a separate Chromium container, a second media worker
  host, NFS, a watchdog timer, a self-signed certificate, and several manual recovery steps.
  Losing the media mount makes the Media tab fail until the share is remounted.
- **Fragile browser collectors.** They depend on private creator-console responses, labels and
  page layouts. Bilibili has already renamed a status chip; 公众号 parsing is shape-based;
  YouTube setup is pending. A collector can fail silently while the rest of the account data
  keeps refreshing.
- **Lifetime totals scale poorly.** The old app re-reads every post on each sync with a 40 s
  budget per platform; a long library falls back to a window figure. A per-post table is the
  noted direction, not implemented.
- **Bilibili aggregate analytics are null.** Per-video metrics work, but the aggregate overview
  response is empty; the app correctly does not turn that into zeros.
- **公众号 coverage is thin.** It reports followers, yesterday's reads/shares and a published
  list, but not likes, comments, saves, watch time or completion; scheduled posts were not
  read in the old app (D6 adds them).
- **Cover errors are not actionable.** The cover dialog shows a generic `(503)` instead of the
  server's detail; the developer notes flag this as a bug.
- **UI has known limits.** Timeline slivers at some widths, a mobile range that can show one
  fewer post than optimal, columns hidden at 1024 px, and some focus/scrollbar issues were
  documented during the old app's QA. These are redesign inputs, not requirements to copy.
- **No direct publishing or engagement.** The app plans, links and observes; publishing,
  liking and commenting are manual on the platforms. D3 keeps it that way for v1; §7.1
  assesses the options for later.
- **One account per platform.** The data model is keyed by platform, so a second Douyin
  account would need a schema change. The new app must support multiple accounts (D1).
- **Single-user LAN authentication.** A password-protected web dashboard made sense on a LAN;
  a standalone desktop app needs a different security model.
- **No native desktop integration.** No tray, notifications, auto-update, OS keychain or
  installers.
- **Phone access depends on the LAN.** The responsive web UI works on a phone only while the
  host is reachable.
- **Planned but not built:** a Markdown-to-image post generator (Xiaohongshu-style cards,
  1440×1920 / 3:4, deterministic Chromium rendering, KaTeX), and optional model-assisted steps
  such as frame picking or title suggestions. These are **not** part of the old app and should
  not be treated as parity requirements.

## 3. Requirements from the brief

These are the requirements stated in Issue #1, with the old app's actual behavior beside
them. The interpretation is confirmed by the old app review; the open decisions remain.

| ID | Requirement from the brief | What the old app does | New-app direction |
|---|---|---|---|
| C1 | Manage **multiple accounts across multiple platforms** | Five platform accounts, exactly one per platform | Support **multiple accounts per platform** (D1) across the five platforms |
| C2 | Support **Chinese and foreign platforms** | 抖音, 小红书, 公众号, Bilibili (China) + YouTube (foreign) | Keep these five; Q9 asks about additions |
| C3 | Manage **posts** | Plans content, tracks published posts, links posts to plans, merges cross-posted posts; never publishes | Keep the plan/track/link workflow; no publishing in v1 (D3); §7.1 assesses later publishing |
| C4 | Manage **likes** | Reads likes received as a metric; does not like or comment | Keep the read metric; no engagement actions in v1 (D3) |
| C5 | Manage **subscribers** | Reads followers/subscribers and daily history; no subscriber list management | Keep follower counts and history; no subscriber-list management in v1 (D3) |
| C6 | Manage **analytics** | Per-account and per-post metrics, 30-day charts, 90-day history, explicit unknown/zero states | Keep and improve the analytics view, per account and in aggregate |
| C7 | Cover "**and more**" | Media processing, video covers, merges, scheduled-post display, community status, browser sessions, to-dos | Keep the core; Community included (D2); About/to-dos still Q22 |
| C8 | Work around platforms with **no usable API** | Four signed-in browser collectors + official YouTube APIs | Keep the same access strategy in the desktop app |
| C9 | Run as a **standalone app** | LAN web dashboard with Docker and a remote worker | Standalone desktop app; media may use the existing Unraid worker/NFS (D4) |
| C10 | Run on **Windows and macOS**; Electron suggested | Linux host + browser clients | Electron (or equivalent) for both; Q12 asks about the stack |
| C11 | **Redesign** the old app, keeping what worked | A mature but deployment-heavy web app with known UI limits | Cleaner overall dashboard and a more detailed per-account view (D5) |

## 4. Goals and non-goals

### 4.1 Goals

- **G1 — Parity where it matters.** Every daily workflow the owner uses in the old app is
  available in the new app, including multiple accounts per platform, or is explicitly dropped
  with agreement.
- **G2 — True standalone desktop app.** Install and launch on Windows and macOS; no Docker,
  no separate web server, no self-signed certificate, no browser tab required. The core
  workspace must run locally; media processing may optionally use the existing Unraid worker
  and NFS share (D4).
- **G3 — Local-first app data.** Accounts, plans, history, media records and settings live on
  the user's machine; the app works without a cloud account. Bulk media may live on the
  configured NFS share (D4).
- **G4 — Same trusted data model.** Keep the distinctions between measured zero, unknown,
  unsupported, stale and pending, and keep metric scope/source/period visible.
- **G5 — Reliable collection.** Browser sessions and official APIs work with clear login,
  CAPTCHA and failure handling; one failing platform never hides or corrupts the others.
- **G6 — Efficient content workflow.** Plan, schedule locally, track publications, link media
  and merge cross-posts without leaving the app.
- **G7 — Media without a forced infrastructure change.** Convert, chapter, join and cover
  recordings locally, or with the existing Unraid worker/NFS when configured (D4).
- **G8 — Redesigned UX.** A cleaner overall dashboard, a more detailed per-account view, and a
  modern, accessible interface that fixes the old app's known rough edges (D5).
- **G9 — Safe secrets.** Platform cookies/sessions and YouTube tokens are protected; no
  secrets in logs, exports or plain-text files.
- **G10 — Clear multi-account identity.** The user can see which account is which everywhere,
  switch accounts deliberately, and never confuse one account's metrics or posts with another
  (D1).

### 4.2 Non-goals (working assumptions)

These keep the first release bounded. They are assumptions to confirm:

- Not a multi-user, team or SaaS product; one person uses one installation.
- Not a mobile app in v1 (the old app's responsive phone layout is a separate question, Q7).
- Not a general social-network client for browsing or consuming feeds.
- Not a replacement for the platforms' own creator studios for account settings.
- No automatic CAPTCHA solving or bypassing of platform security controls; the user completes
  challenges.
- No AI content generation or model-assisted steps in v1; the old app planned some but never
  built them.
- No direct publishing in v1 (D3); §7.1 assesses publishing for later. No engagement actions
  (liking, commenting, following) in v1.
- No new platforms beyond the five unless Q9 says otherwise.
- No cloud sync or hosted backend.
- No hidden browser automation for publishing; any later automation must be opt-in and
  disclosed.

## 5. Users and scale

- **Primary user:** one physics creator managing their own channels; the owner of the old app.
- **Accounts:** **multiple accounts per platform** (D1) across the five platforms. The old app
  has exactly one per platform; the number of accounts per platform in the new app is Q21.
- **Content types:** paper walkthroughs, short lectures, question videos, text/image guides,
  exam/competition information.
- **Content volume:** per account, the old app shows the last 60 days plus today of published
  posts and keeps 90 days of metric history; plans can be undated or future-dated.
- **Media volume:** long lesson recordings (the old notes mention multi-gigabyte files of over
  an hour, an 86-minute chapter export and a 7.4 GiB / ~105-minute recording), two-screen
  joins, chapter clips and four cover PNGs per set. Local disk space and processing time matter.
- **Devices:** Windows and macOS desktops. The old app is also usable from a phone browser on
  the LAN; Q7 asks whether that must survive.
- **Network:** the platforms are reached from the user's normal network; some are in China and
  some abroad. No proxy requirement is assumed.

## 6. Functional requirements

Priority words: **MUST** = required for v1, **SHOULD** = expected, **COULD** = optional/later.
Requirements marked "parity" come from the old app; "new" is a result of the standalone or
redesign requirement.

### 6.1 Accounts, sessions and syncing (ACC)

| ID | Requirement | Priority |
|---|---|---|
| ACC-01 | Manage one or more accounts on each of the five platforms (抖音, 小红书, 公众号, Bilibili, YouTube) in one place. | MUST (parity + D1) |
| ACC-02 | Support **multiple accounts per platform** (D1); each account has its own ID, display name, identity, session, status, metrics and content. | MUST (D1) |
| ACC-03 | Sign in to each browser-collected account in an embedded browser, keeping an isolated session per account so two accounts on the same platform cannot overwrite each other. | MUST (parity + D1) |
| ACC-04 | Connect one or more YouTube accounts/channels with a Google Desktop OAuth client, complete consent, choose a channel, refresh tokens, and disconnect locally. | MUST (parity + D1) |
| ACC-05 | Show per-account connection/analytics/content state, last attempt, last success, and a clear re-authentication action. | MUST (parity) |
| ACC-06 | Sync automatically (about every six hours in the old app) and on demand; prevent overlapping syncs and show progress/errors. | MUST (parity) |
| ACC-07 | Keep the last successful reading when a refresh fails and mark it stale; never replace good data with an empty result. | MUST (parity) |
| ACC-08 | Open the platform's creator studio and public profile for a specific account. | SHOULD (parity) |
| ACC-09 | Complete login, CAPTCHA, 2FA and other challenges in the embedded browser; never capture or replay the user's password. | MUST |
| ACC-10 | Store session cookies/tokens encrypted at rest and isolate them per account. | MUST (parity + D1) |
| ACC-11 | Add a new platform adapter without changing the rest of the app. | SHOULD |
| ACC-12 | Add, rename and remove accounts; removing an account wipes its local credentials and cached data after confirmation. | MUST (D1) |

### 6.2 Overview and channel monitoring (MON)

| ID | Requirement | Priority |
|---|---|---|
| MON-01 | Show a card per account with its platform, display name, followers, views, likes, posts and connection/freshness state. | MUST (parity + D1) |
| MON-02 | Open a **detailed per-account view** (D5) with identity, access state, analytics state, metrics, history, published and scheduled content, linked plans/media, and account actions. | MUST (parity + D5) |
| MON-03 | Represent each metric's scope (`lifetime`, `current`, `window`), availability (`value`, `pending`, `unsupported`), reporting period, source and reason. | MUST (parity) |
| MON-04 | Distinguish a measured zero from unknown, unsupported, uninitialized and stale values. | MUST (parity) |
| MON-05 | Show a follower-growth view per account (dot pool, 7-day gain, total) and the separate Community growth sparklines over the same 30-day window (D2). | MUST (parity + D2) |
| MON-06 | Show the latest measurement time, not the page-fetch time, and a next-sync indicator. | MUST (parity) |
| MON-07 | Keep 90 days of daily metric history per account; charts show 30 days by default. | MUST (parity + D1) |
| MON-08 | Show per-post metrics for the collected content window (60 days plus today) per account. | MUST (parity) |
| MON-09 | Manual "sync now" refreshes all sources; results appear without a page reload. | MUST (parity) |
| MON-10 | Provide an account selector/filter: all accounts, one platform, or one account; every overview number must say which accounts it covers. | MUST (D1) |
| MON-11 | Keep the overall dashboard **cleaner** (D5): a clear hierarchy of account cards, KPIs, growth and the timeline, without losing access to the detail. | MUST (D5) |
| MON-12 | Never mix two accounts' metrics into one unlabeled figure; aggregate totals are explicitly sums of the selected accounts. | MUST (D1) |

### 6.3 Content planner (PLN)

| ID | Requirement | Priority |
|---|---|---|
| PLN-01 | Create/edit/delete a plan with title, notes, content type, format, platforms/accounts, optional date, tags and publication links. | MUST (parity + D1) |
| PLN-02 | Apply content-type defaults for platforms and format, while letting the user override them. | MUST (parity) |
| PLN-03 | Support the five content types and the two formats (video, print). | MUST (parity) |
| PLN-04 | Normalise and persist tags, support hashtags in notes and the exam-tag aliases. | MUST (parity) |
| PLN-05 | Filter plans by platform, account and tag; expose the tag catalogue. | MUST (parity + D1) |
| PLN-06 | Keep plans private; saving or editing a plan must never publish to a platform. | MUST (parity) |
| PLN-07 | Protect unsaved edits and confirm destructive actions. | MUST (parity) |
| PLN-08 | Link a plan to one existing published post per selected account, and keep links when a post temporarily drops out of the collection. | MUST (parity + D1) |
| PLN-09 | Allow an undated idea, and a date without a time. | MUST (parity) |
| PLN-10 | Reschedule a plan by dragging it on the timeline or with the keyboard. | SHOULD (parity) |
| PLN-11 | Let a plan target all accounts on a platform or specific accounts, defaulting to all current accounts on the selected platform (Q25). | MUST (D1) |

### 6.4 Timeline, publications and merges (TML)

| ID | Requirement | Priority |
|---|---|---|
| TML-01 | Show an adaptive calendar in Asia/Shanghai with a date column and Video/Print lanes. | MUST (parity) |
| TML-02 | Show plans, published posts and platform-scheduled posts with distinct markers and the account they belong to; every item on a visible date is reachable. | MUST (parity + D1) |
| TML-03 | Open details for a plan or post from the calendar; show per-account metrics and freshness. | MUST (parity + D1) |
| TML-04 | Link a plan to collected posts per selected account and show the plan as published for those targets. | MUST (parity + D1) |
| TML-05 | Merge 2–5 published posts that carry the same content, at most one per **account**; show one card with per-account statistics; support edit and unmerge. | MUST (parity + D1) |
| TML-06 | Show platform-scheduled posts as pending until they go live, and keep an ID/merge when a scheduled post becomes published. | MUST (parity) |
| TML-07 | Keep merged cards, plans and links consistent when a post leaves the 60-day content window. | MUST (parity) |
| TML-08 | Support an undated-ideas area and a full plan list beyond the visible calendar range. | MUST (parity) |
| TML-09 | Fix the old app's known timeline limits (clipped slivers, hidden lanes at 1024 px, mobile range off-by-one) in the redesign. | SHOULD (redesign) |
| TML-10 | Filter the timeline by platform/account and label every card with its account when more than one account is in view. | MUST (D1) |
| TML-11 | Collect and show 公众号 scheduled posts (D6), like the other platforms; if the console does not expose a readable schedule, mark it unsupported rather than inventing entries. | MUST (D6) |

### 6.5 Analytics (ANL)

| ID | Requirement | Priority |
|---|---|---|
| ANL-01 | Normalise the metric set across platforms: followers, following, posts, views, likes, comments, shares, saves, watch hours, average view seconds and completion rate where reported. | MUST (parity) |
| ANL-02 | Keep per-platform and per-account semantics and reporting periods; do not total metrics whose definitions differ. | MUST (parity) |
| ANL-03 | Treat "not reported by this platform" as unsupported and "not collected yet" as pending. | MUST (parity) |
| ANL-04 | Store daily history per account and draw trends only from measured dates; do not interpolate missing days. | MUST (parity + D1) |
| ANL-05 | Show the audience total as a sum of the selected accounts with the "not unique people" caveat, matching the old app. | SHOULD (parity) |
| ANL-06 | Keep the Community metrics separate from platform metrics (D2). | SHOULD (parity + D2) |
| ANL-07 | Provide a per-post, per-account and per-platform breakdown that supports the content workflow. | MUST (parity + D1) |
| ANL-08 | Export analytics data (CSV) for external analysis. | COULD (proposed) |
| ANL-09 | Compare two periods, accounts or platforms side by side. | COULD (proposed) |
| ANL-10 | Let the user choose which accounts contribute to an aggregate chart or total. | SHOULD (D1) |

### 6.6 Media processing (MED)

| ID | Requirement | Priority |
|---|---|---|
| MED-01 | Watch a configurable inbox for `.mov`/`.mp4` recordings, detect new/growing files, and queue a conversion after the file settles. | MUST (parity) |
| MED-02 | Convert to a compatible full MP4 (H.264/AAC, fast-start), preserving originals and surfacing warnings for unusual audio/HDR/PCM. | MUST (parity) |
| MED-03 | Export chapter clips from `mm:ss Title` lines, re-encode only when needed, and support `# excluding` ranges with correct time shifting. | MUST (parity) |
| MED-04 | Pair and align two-screen recordings, join them side by side, switch the active screen per range, and cut detected clap sounds at boundaries. | MUST (parity) |
| MED-05 | Queue one job at a time, show progress/stage, handle cancel/retry and a lost-worker lease without corrupting the project. | MUST (parity) |
| MED-06 | Preview and download the full MP4, joined/edited videos and chapter clips through authenticated endpoints. | MUST (parity) |
| MED-07 | Link media files to plans or published posts, including merged/scheduled posts; archive the project when linked. | MUST (parity) |
| MED-08 | Show active and archived recordings, covers and links; support discard with confirmation and recovery from interrupted archive/discard. | MUST (parity) |
| MED-09 | Run the core workspace without the Unraid worker/NFS; process media locally with FFmpeg or use the existing Unraid worker and NFS share, configurable by the user (D4). | MUST (standalone + D4) |
| MED-10 | Work within the storage and processing limits of a laptop/desktop, with clear progress and actionable errors. | MUST (new) |
| MED-11 | Keep media project folders portable and back up/restore them with the app data; if media lives on NFS, document the path mapping and what is backed up. | SHOULD (new) |
| MED-12 | Show worker/NFS health; if a configured worker or share is unavailable, fail the job clearly or fall back to local processing, and never silently lose queued work. | MUST (D4) |

### 6.7 Video covers (COV)

| ID | Requirement | Priority |
|---|---|---|
| COV-01 | Create four cover PNGs (16:9, 4:3, large-text 4:3, 3:4) from a recording with a finished full MP4. | MUST (parity) |
| COV-02 | Accept title, optional highlighted word, optional subtitle, optional year and a style. | MUST (parity) |
| COV-03 | Provide the BPhO, Cambridge, AP and Edexcel presets; choose a style automatically from keywords or manually. | MUST (parity) |
| COV-04 | Render deterministically from HTML/CSS with bundled fonts and presets; no image model. | MUST (parity) |
| COV-05 | Keep covers with the recording, move them on archive, and delete them on discard. | MUST (parity) |
| COV-06 | Delete unreserved cover sets after 7 days; allow reserving/unreserving; show the remaining time. | MUST (parity) |
| COV-07 | Preview and download each cover; surface the server's real error instead of a generic 503. | MUST (parity + fix) |

### 6.8 Community monitor (COM)

| ID | Requirement | Priority |
|---|---|---|
| COM-01 | Show the community feed's connection, authentication and latency. | MUST (parity; D2) |
| COM-02 | Show catalogue counts for all time, 24 hours and 7 days. | MUST (parity; D2) |
| COM-03 | Show worker/service and timer health, mention jobs, graph/animation jobs and PDF status. | MUST (parity; D2) |
| COM-04 | Keep daily community history for growth charts and retain the last good snapshot when the feed is down. | MUST (parity; D2) |
| COM-05 | Make the status endpoint configurable and degrade gracefully when it is absent. | SHOULD (new) |

### 6.9 Desktop app and operations (DES)

| ID | Requirement | Priority |
|---|---|---|
| DES-01 | Ship as an installable desktop app for Windows and macOS. | MUST (brief) |
| DES-02 | Launch without Docker, a local web server the user must start, a self-signed certificate, NFS, or a second host for the core workspace; media processing may use the existing Unraid worker/NFS when configured (D4). | MUST (standalone + D4) |
| DES-03 | Store the database, settings and (optionally) media in a documented local app-data directory; media may instead live on the configured NFS share (D4). | MUST (new + D4) |
| DES-04 | Run sync in the background without blocking the UI; show progress and allow manual sync. | MUST (parity/new) |
| DES-05 | Support a tray icon and native notifications for sync failures and completed media jobs. | SHOULD (new) |
| DES-06 | Restore the last view/window state; prevent conflicting instances. | SHOULD (new) |
| DES-07 | Work offline with cached data; queue or clearly block actions that need a connection. | SHOULD (new) |
| DES-08 | Provide backup/restore and a documented data directory. | SHOULD (parity/new) |
| DES-13 | Let the user configure the external media worker/NFS endpoint, validate it, and leave the core workspace unaffected when it is missing (D4). | SHOULD (D4) |
| DES-09 | Auto-update or provide a clear manual update path. | SHOULD (new) |
| DES-10 | Sign/notarize builds where distribution requires it; document the requirement. | COULD (new) |
| DES-11 | Support English UI and keep the platform names/branding; Q8 asks whether Chinese UI is needed. | SHOULD (parity) |
| DES-12 | Optionally lock the app when the machine is unattended; Q16 asks whether a local login is needed. | COULD (new) |

### 6.10 Redesign and UX (UX)

| ID | Requirement | Priority |
|---|---|---|
| UX-01 | A modern, coherent visual design and component system; not a copy of the old CSS, and a **cleaner overall dashboard** (D5). | MUST (brief + D5) |
| UX-02 | Preserve the old app's navigation model where it works: Overview, Content planner, Community (included, D2), Media, About (Q22), plus browser sessions/account actions. | MUST (parity) |
| UX-03 | Fix the old app's known UI defects listed in §2.6 instead of reproducing them. | SHOULD (redesign) |
| UX-04 | Complete empty, loading, partial, stale and error states; errors must be actionable, not generic codes. | MUST |
| UX-05 | Keyboard navigation, visible focus, readable contrast and screen-reader labels. | SHOULD |
| UX-06 | Usable at common laptop sizes and when resized; decide whether phone-sized layouts are still needed (Q7). | SHOULD |
| UX-07 | Light and dark appearance. | COULD (confirm Q5) |
| UX-08 | A first-run setup that explains platform sessions, YouTube OAuth and data location. | SHOULD |
| UX-09 | Give each account a **more detailed per-account view** (D5) without hiding the information the owner needs. | MUST (D5) |
| UX-10 | Do not lose data or drafts on navigation, refresh or update. | MUST |
| UX-11 | If Q22 keeps it, show the About view with the personal to-do list (add/complete/delete) and changelog. | SHOULD (parity; Q22) |
| UX-12 | Make the overall dashboard cleaner than the old app: clear grouping, fewer competing panels, obvious drill-down to accounts, and no decorative clutter. | MUST (D5) |
| UX-13 | Account identity (platform, avatar, display name) is visible on every card, chart, list and timeline item when more than one account is in scope. | MUST (D1) |
| UX-14 | An account switcher/selector is reachable from the dashboard and per-account views without losing the current context. | MUST (D1) |

### 6.11 Security and privacy (SEC)

| ID | Requirement | Priority |
|---|---|---|
| SEC-01 | Store platform cookies/session material and YouTube tokens encrypted at rest, using OS-provided secret storage where available. | MUST |
| SEC-02 | Never write secrets to logs, crash reports, diagnostics or exported data; redact them. | MUST |
| SEC-03 | Keep all data local by default; no telemetry or third-party analytics without explicit opt-in. | MUST |
| SEC-04 | Restrict network access to the platforms and the optional community endpoint; do not listen on inbound ports unless the user enables remote access. | SHOULD |
| SEC-05 | Offer an app lock or auto-lock for unattended machines (Q16) and document the local threat model. | COULD |
| SEC-06 | Apply least-privilege file permissions to the data directory and media folders. | SHOULD |

### 6.12 Data and migration (DAT)

| ID | Requirement | Priority |
|---|---|---|
| DAT-01 | Use a durable local database with versioned schema migrations between app versions. | MUST |
| DAT-02 | Import the old app's SQLite data where the schema is understood: plans, tags, history, merges, to-dos, account payloads and media metadata. | SHOULD (Q6) |
| DAT-03 | Map old media paths to the new media root and relink media jobs/files; surface missing files instead of dropping projects. | SHOULD (Q6) |
| DAT-04 | Import the old YouTube OAuth material only if it can be moved safely; otherwise guide a reconnection. | SHOULD (Q6) |
| DAT-05 | Provide backup/restore and a documented data directory; exports must not contain secrets. | MUST |
| DAT-06 | Define retention for history, content snapshots, covers and media projects; let the user clear caches. | MUST |
| DAT-07 | Every upgrade must preserve existing data or fail safely with a backup. | MUST |
| DAT-08 | Migrate the old one-account-per-platform model into per-account records with stable IDs; never merge two accounts' history. | MUST (D1) |

## 7. Platform scope and collection coverage

The five platforms below are the confirmed scope from the old app. The new app must support
**one or more accounts per platform** (D1); the old app has exactly one.

| Platform | Region | Access | Metrics currently available | Content / scheduled posts | Keep in v1? |
|---|---|---|---|---|---|
| 抖音 | China | Signed-in creator console via browser | Followers, following, likes received, posts, views, comments, shares, saves, completion rate (where reported) | Published works; scheduled works (confirmed) | Yes |
| 小红书 | China | Signed-in creator console via browser | Followers, following, posts, 7-day views/likes/comments/shares/saves | Published notes; scheduled notes (confirmed) | Yes |
| 公众号 | China | Signed-in console pages via browser | Followers, yesterday's reads/shares, published count | Published list; **add scheduled posts** (D6) | Yes |
| Bilibili | China | Signed-in creator console via browser | Followers, posts, per-video metrics | Published/accepted videos; scheduled videos (unverified) | Yes |
| YouTube | International | Official Data + Analytics APIs | Subscribers, posts, lifetime views, 28-day analytics | Uploads, Shorts, livestreams; private scheduled/upcoming videos | Yes |

Requirements:

- **PLT-01:** Each platform is an adapter with a declared capability set (read metrics, read
  content, read scheduled posts, write actions) so the UI can show what is available.
- **PLT-02:** Prefer official APIs where they work; use a signed-in browser only where the
  platform has no usable API.
- **PLT-03:** Keep the old app's coverage semantics: 60-day content window, 90-day history,
  measured zero vs unknown vs unsupported.
- **PLT-04:** The app must never invent a metric, a publication or a scheduled post when a
  collector returns an unexpected shape; it reports partial/unavailable coverage instead.
- **PLT-05:** Adding a sixth platform should be a bounded adapter change; no platform-specific
  code in the overview/planner/timeline UI.
- **PLT-06:** Document the per-platform limitations in the app (for example, 公众号's missing
  likes/watch time) so the user is not surprised by blanks.
- **PLT-07:** Support per-account capability differences: two accounts on the same platform
  may expose different metrics, publishing rights or scheduled-post coverage.
- **PLT-08:** Add 公众号 scheduled-post collection to the adapter's capability set (D6); if
  the console exposes no readable schedule, the capability is unsupported, not silently empty.

### 7.1 Publishing feasibility (future work)

D3 keeps publishing out of v1, but the owner asked whether it could be added later and whether
it varies by platform. This section records a documentation-level assessment; none of it has
been tested against the owner's live accounts, and API access/terms can change.

| Platform | Official write path | Access requirements | Scheduling | Feasibility |
|---|---|---|---|---|
| YouTube | `videos.insert` (YouTube Data API v3), media upload with metadata. | OAuth scope `youtube.upload`; the existing Google Desktop client can be extended with this scope; the uploads quota is 100 uploads/day. | `status.publishAt` on the uploaded video. | **High.** Same OAuth connection; first candidate. |
| Bilibili | Official 视频稿件提交 pipeline: upload pretreat, chunk upload, merge, cover upload, then submit. | Scope `ARC_BASE`; permission application and user authorization; every submission is reviewed; a non-formal member can submit up to 5 videos/day. | No scheduling parameter was found in the submission reference; schedule the call locally. | **Medium.** Requires developer approval and a multi-step upload; documented. |
| 抖音 | Official 创建视频 (`create_video`) API. | Scope `video.create.bind`; permission application ("代替用户发布内容到抖音"); user authorization; the video goes through review. | No scheduling parameter was found in the create-video reference; schedule locally or use the console. | **Medium.** Approval/authorization required; review delays expected. |
| 公众号 | Official publishing capability (draft management and `freepublish` APIs). | Official-account access (AppID/AppSecret, IP whitelist). The old app's notes record that the official **data** interfaces require a verified account, and the current 公众号 is unverified; publishing access must be checked for this account. | No scheduling parameter was found; schedule locally. The console also offers scheduled publishing. | **Medium/low.** Depends on account verification/config; console automation is fragile. |
| 小红书 | No public creator publishing endpoint was found. The official open platform appears oriented to merchants/third-party developers (note/comment access); browser automation is the practical route. | Browser session only; no documented publish API. | Console only. | **Low.** Automation is fragile and carries account risk; do not build without an explicit decision. |

**Recommendation**

1. Keep v1 read/plan/track (D3).
2. If publishing is added, start with **YouTube** (official API, same OAuth, scheduling via
   `status.publishAt`).
3. Then evaluate **Bilibili** and **抖音**, which have official write APIs but need developer
   approval, user authorization and review.
4. Treat **公众号** as blocked on account verification/config; re-check before planning it.
5. Treat **小红书** as browser-automation-only. It needs a separate risk decision, opt-in
   behaviour, rate limits and a clear warning; it must never be a hidden fallback.
6. Run a separate publishing spike with live test accounts before promising any of it.

**Sources**

- YouTube: [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert);
  [videos resource / status.publishAt](https://developers.google.com/youtube/v3/docs/videos#status.publishAt)
- Bilibili: [视频稿件提交](https://open.bilibili.com/doc/4/f7fc57dd-55a1-5cb1-cba4-61fb2994bf0f)
- 抖音: [创建视频](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/video-management/douyin/create-video/video-create)
- 公众号: [发布能力](https://developers.weixin.qq.com/doc/subscription/guide/product/publish.html)
- 小红书: [小红书开放平台 API 实战](https://cloud.tencent.com.cn/developer/article/2735161)
  (secondary write-up; no official creator publishing endpoint was found)

## 8. Parity matrix

Proposed disposition of every old-app capability. "Keep" means v1 should preserve it; "keep,
redesign" means preserve the workflow but rebuild the UI; "ask" means Q6/Q16/Q22/Q23 decides.

| Old capability | New requirement | Proposed disposition |
|---|---|---|
| Multiple accounts per platform | ACC-02, ACC-03, ACC-12, MON-10, UX-13, UX-14 | New (D1) |
| Overview channel cards and freshness | MON-01, MON-06, MON-10 | Keep, redesign |
| Channel notebook and metric metadata | MON-02..04 | Keep, redesign as the detailed per-account view (D5) |
| Follower dot-pool growth + community growth | MON-05 | Keep, redesign |
| Content planner and tags | PLN-01..11 | Keep, redesign |
| Timeline, plans, published and scheduled posts | TML-01..03, TML-06, TML-08, TML-10 | Keep, redesign |
| Publication links | TML-04, PLN-08 | Keep, redesign |
| Merged posts | TML-05, TML-07 | Keep, redesign (one post per account) |
| Media inbox, conversion, chapters, exclusions | MED-01..03 | Keep, redesign |
| Two-screen join and clap cuts | MED-04 | Keep, redesign |
| Media archive, links and discard | MED-06..08 | Keep, redesign |
| Video covers and retention | COV-01..07 | Keep, redesign |
| Community monitor and history | COM-01..05 | Keep (D2) |
| YouTube OAuth connection | ACC-04 | Keep, redesign; support multiple channels/accounts |
| Browser sessions | ACC-03, ACC-09 | Replace the remote desktop with an embedded browser and per-account sessions |
| 公众号 scheduled posts | TML-11 | Add (D6) |
| Direct publishing | §7.1 | Future; not v1 (D3) |
| About/todos/changelog | UX-11 | Ask Q22 |
| Dashboard login | DES-12, SEC-05 | Ask Q16 (may be unnecessary in a local app) |
| Old SQLite data and media folders | DAT-01..05, DAT-08 | Ask Q6; migrate if wanted |
| Docker/NFS/watchdog/TLS deployment | DES-02, DES-13, MED-09 | Replace the core deployment; Unraid/NFS media is optional (D4) |
| Responsive phone access | UX-06 | Ask Q7 |
| Markdown-to-image post generator | — | Out of scope v1 (not built in old app) |
| Model-assisted frame/title suggestions | — | Out of scope v1 (not built in old app) |

## 9. Non-functional requirements

| ID | Requirement | Target / note |
|---|---|---|
| NFR-01 | Platform parity | All "keep" rows in §8 work in v1, including multiple accounts (D1), Community (D2) and 公众号 scheduled posts (D6); dropped features are an explicit decision. |
| NFR-02 | Startup and UI responsiveness | Cold start under ~3 s on a typical machine; cached views under ~2 s. Proposed, validate. |
| NFR-03 | Sync reliability | Retries/backoff; one account/platform failure does not block or corrupt the others; last good data retained. |
| NFR-04 | Scale | Five platforms, several accounts per platform (Q21), 90 days of history per account, 60 days of posts, years of plans, long media projects. |
| NFR-05 | Media performance | Conversion/join/chapter times comparable to the old worker on the same hardware, or use the configured Unraid worker (D4); progress for long jobs; no UI freeze. |
| NFR-06 | Security | OS keychain/encrypted storage for sessions and tokens; redacted logs; local-only by default; no telemetry without opt-in. |
| NFR-07 | Data safety | Versioned schema migrations, atomic writes for media/links, backup/restore, no silent data loss. |
| NFR-08 | Maintainability | Platform adapters behind a typed interface; tests for parsers, normalization and scheduling. |
| NFR-09 | Observability | Local logs and a diagnostics export that strips secrets. |
| NFR-10 | Accessibility | Keyboard reachable, visible focus, reasonable contrast, screen-reader labels. |
| NFR-11 | Internationalisation | Strings externalised; English first; Chinese UI if Q8 asks. |
| NFR-12 | Privacy | Local-first; no third-party analytics; platform credentials never leave the machine except to the platform. |

## 10. Technical considerations

These are options, not decisions. They depend on D4 and Q12.

### 10.1 Application shape

- **Electron app with a bundled local backend.** The UI runs in Electron; the backend can be
  a bundled Python/FastAPI sidecar (reusing the old app's collectors and tests) or a
  TypeScript backend inside Electron.
- **Electron app with a TypeScript rewrite.** Reuses the React UI language but rewrites the
  API, collectors and media orchestration. Cleaner single-runtime packaging; more work.
- **Thin Electron client to the old dashboard/API server.** Not standalone; would fail
  C9/DES-02. Using only the existing media worker/NFS for media is a different, allowed option
  (D4).

The old app's UI is React 19 + TypeScript, so reusing the frontend components and design
language is practical. The backend choice is the main cost/risk trade-off.

### 10.2 Platform sessions and collection

- Multiple accounts on one platform need isolated sessions: separate Chromium profiles or
  Electron session partitions, one per account, so cookies cannot collide (D1).
- The app needs an embedded browser window for login and challenge handling, scoped to the
  account being connected, plus a way to switch/identify accounts.
- Playwright can drive the embedded browser over CDP on Windows/macOS; the old collectors are
  Playwright/Python and already read creator-console JSON.
- If the backend is TypeScript, the collectors must be ported; the old app's parsing rules are
  the specification and its tests are useful fixtures. Each collector must accept an account
  context rather than assuming one platform-wide session.
- YouTube uses the official APIs with a desktop OAuth client; the loopback callback can be
  handled inside the app. Multiple Google accounts/channels need separate grants or a
  channel-selection step.

### 10.3 Data and secrets

- SQLite remains a good fit; the old schema is small and can be migrated. The new schema keys
  accounts by account ID, not platform (D1).
- Sessions/cookies and YouTube tokens must use the OS keychain or Electron `safeStorage`, not
  plain files; keys are per account.
- Media paths and the watched inbox/output/archive directories must be configurable; local
  disk is the default, with an optional NFS path (D4).

### 10.4 Media and covers

- Bundle or require FFmpeg. Bundling gives a predictable install but increases the app size;
  requiring a separate install adds setup friction.
- The old media worker is a separate process talking to the API; in a desktop app it can be a
  local worker process, a child process of the app, or the existing Unraid worker over the
  network (D4). A remote worker needs a documented protocol, authentication and health check.
- Cover rendering can reuse the old HTML/CSS/Chromium approach in a hidden Electron window or a
  bundled Chromium, with fonts and presets shipped as assets.

### 10.5 Packaging

- Electron Builder (or equivalent) for Windows installers and macOS `.app`/`.dmg`.
- Code signing/notarization depends on distribution (personal use vs sharing); Q10.
- Auto-update is useful but needs a hosting/signing story; Q10.

## 11. Proposed delivery phases

No dates. Each phase should produce something usable and testable.

| Phase | Outcome |
|---|---|
| 0 — Decisions | Q6/Q21/Q22/Q23 and the remaining questions answered; architecture chosen. Q1–Q4 are answered (D1–D4). |
| 1 — Shell and core data | Electron app, local SQLite, settings, secure storage, per-account model (D1), account switcher, one working platform adapter. |
| 2 — Workspace | Cleaner overview (D5), detailed per-account view (D5), follower history, content planner, timeline, publication links and merges (one post per account). |
| 3 — Media | Inbox, conversion, chapters, two-screen join, archive, media links; support local processing and/or the configured Unraid worker/NFS (D4). |
| 4 — Covers and community | Cover presets/rendering; Community monitor (D2); 公众号 scheduled posts (D6); YouTube connection if not done earlier. |
| 5 — Migration and release | Import old data/media, backup/restore, packaging, update path, redesign polish, accessibility. |
| 6 — Optional publishing spike | Only after v1: evaluate YouTube, then Bilibili/抖音, then 公众号/小红书 per §7.1; separate decision (D3). |

**Proposed v1 acceptance criteria**

1. Install and launch on Windows and macOS without Docker, NFS or a separately started server;
   the core workspace works; media can optionally use the Unraid worker/NFS (D4).
2. Connect **at least two accounts on the same platform** plus accounts on other platforms,
   with isolated sessions, and see their status and freshness (D1).
3. Sign in to all four browser platforms and connect YouTube; switch accounts without one
   account's cookies or metrics leaking into another.
4. See account cards, metric details (value/pending/unsupported), and 30-day follower history,
   with a cleaner dashboard and a detailed per-account view (D5).
5. Create, edit and delete a plan with content type, format, platforms/accounts, tags and date;
   restart the app and find it intact.
6. See plans, published posts and scheduled posts (including 公众号, D6) on the timeline; link a
   plan to a post; merge two posts (one per account) and unmerge them.
7. Convert a recording to a full MP4, export a chapter clip, link it to a plan, and archive it;
   confirm the same flow works with the optional Unraid worker/NFS.
8. Create a cover set with each of the four ratios and reserve it.
9. Keep measured zero, unknown and stale values distinct throughout the UI.
10. Confirm no secret is stored in plain text and no log/diagnostic export contains one.
11. See the Community feed and its history (D2).

## 12. Open questions and working assumptions

The "working assumption" column is what this draft assumes. Confirm, correct or reject each
row. Q1–Q4 and Q17 are answered (D1–D6); the remaining questions still need the owner.

| # | Question | Working assumption |
|---|----------|--------------------|
| Q1 | Does "multiple accounts" mean one account on each of several platforms (as the old app), or several accounts per platform too? | **Resolved (D1):** multiple accounts per platform. |
| Q2 | Should the new app keep **all** old features — Community monitor, About/to-dos/changelog, community-forum growth — or focus on channels, planner, timeline, media and covers? | **Resolved for Community (D2)**; About/to-dos is Q22. |
| Q3 | Does the new app need to **publish**, schedule on platforms, like/comment, or manage subscriber lists? The old app only reads and plans. | **Resolved (D3):** no publishing in v1; §7.1 assesses later options. No engagement actions. |
| Q4 | How standalone must it be? Fully local (media processing on the desktop), or may it use the existing Unraid worker/NFS? | **Resolved (D4):** may use the Unraid worker/NFS; core must work without them. |
| Q5 | What specifically should the redesign fix, and what visual direction/references should it follow? Dark mode? | **Partly resolved (D5):** cleaner dashboard + detailed per-account view. Visual references/dark mode still open. |
| Q6 | Must old data be migrated: SQLite (plans, history, merges, todos), media folders, YouTube credentials, browser sessions? | Yes where feasible; media paths need mapping. |
| Q7 | Is phone/remote access still required, or is this desktop-only? | Desktop-only; the old phone browser layout is dropped unless requested. |
| Q8 | Which UI languages are needed? | English UI; Chinese platform names preserved. |
| Q9 | Are there new platforms to add beyond the five? | Five only for v1; adapter architecture allows more. |
| Q10 | How will the app be distributed — personal installers, team sharing, signed/notarized, auto-update? | Personal installers; signing/auto-update if cheap. |
| Q11 | Where should the database and media live? Local disk, external drive, NAS? How much space? | Local app data; media directory configurable. |
| Q12 | Is Electron confirmed? Should the backend be a bundled Python/FastAPI sidecar or a TypeScript rewrite? | Electron; backend choice open. |
| Q13 | Should YouTube keep the official read-only API and the Desktop OAuth client setup? | Yes; no uploads. |
| Q14 | Should the app run in the background/tray and notify on sync/media completion? | Yes, while the app is running; notifications optional. |
| Q15 | Should analytics be exportable or comparable across periods/accounts? | Not in v1 unless cheap; old app has no export. |
| Q16 | Does the local app need a login/app lock, or is the OS account enough? | No dashboard login; optional app lock later. |
| Q17 | Keep reading platform-scheduled posts? Should 公众号 scheduled posts be added? | **Resolved (D6):** add 公众号 scheduled posts. |
| Q18 | Are browser-automation and account-risk trade-offs acceptable, as in the old app? | Yes; same signed-in-session model, human handles challenges. |
| Q19 | Is the Discourse status endpoint staying at the same service, or should the community monitor be configurable/optional? | Keep, configurable endpoint. |
| Q20 | How much of the old app's test suite/parsers should be ported as-is? | Port parser/normalization tests as regression fixtures. |
| Q21 | How many accounts per platform in practice, and how should their sessions be isolated? | A few per platform; separate browser profiles/partitions per account. |
| Q22 | Should the About view, personal to-do list and changelog be kept? | Keep, but they are not core; low priority. |
| Q23 | When should publishing be pursued, and which platform first? | After v1; YouTube first, then Bilibili/抖音, then 公众号/小红书 per §7.1. |
| Q24 | What visual references, dark-mode preference or per-account detail priorities should the redesign use? | D5 gives the direction; concrete references/details still needed. |
| Q25 | Should a plan target all accounts on a platform or specific accounts? | Allow specific accounts; default to all current accounts on the selected platform. |

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A standalone rewrite becomes a full re-implementation of a mature app | Long delay, regressions | Phase parity; port parsers/tests; keep the old app running until v1 is proven. |
| Platform collectors break | Missing metrics/posts | Adapter isolation, health checks, clear stale states, fast manual update. |
| Browser automation conflicts with platform terms | Account risk | User opt-in, same model as old app, human handles challenges, no stealth promises. |
| Media processing on a laptop is slow or runs out of space | Poor UX, failed jobs | Local FFmpeg, progress, disk checks, optional Unraid worker/NFS (D4). |
| Multiple accounts share browser state or overwrite each other's cookies | Wrong account posts/metrics | Isolated profiles/partitions per account; explicit account identity everywhere (D1). |
| A metric or post is attributed to the wrong account | Misleading analytics | Account ID in every record; no unlabeled aggregates; migration never merges accounts (D1). |
| Configured NFS/worker is unavailable | Media jobs fail or stall | Health check, clear error, fall back to local processing or retain queued work (D4). |
| Publishing APIs require approval or are unavailable | Publishing delayed or impossible | §7.1 feasibility; separate spike; do not promise a platform before access is confirmed. |
| Old data/media migration is lossy | Lost history or broken links | Migration tool, dry run, backups, path mapping. |
| macOS notarization / Windows signing | Users cannot install | Decide distribution early (Q10); document workarounds. |
| Electron security/update burden | Vulnerabilities, stale builds | Keep Electron current, minimal privileges, signed updates where possible. |
| Loss of phone/remote access | Workflow change | Confirm Q7; if needed, add a local-network web view or remote mode. |
| YouTube OAuth setup is fiddly | Monitoring not enabled | Guided setup, clear errors, keep stale data. |
| UI redesign loses density or hides key metrics | Owner rejects it | Review with the owner early; preserve information architecture; D5 direction. |
| Scope creep from "and more" | v1 never ships | Explicit parity matrix; defer marked items. |

## 14. Glossary

- **Account** — one platform identity; a platform may have several accounts (D1). The old app
  has one per platform.
- **Plan** — a local content idea with a title, content type, format, platform/account targets,
  optional date, tags and links; not a platform post.
- **Published post** — a post collected from a platform's creator console/API.
- **Scheduled post** — a platform-side scheduled publication read from the platform, not a
  plan.
- **Publication link** — a saved association between a plan and one collected post per
  account; it never publishes.
- **Merge** — a local group of 2–5 published posts carrying the same content, at most one per
  account.
- **Capability** — what an adapter can do for a platform (read metrics, read content, read
  scheduled posts, write actions).
- **Stale / pending / unsupported** — failed refresh with retained data / not collected yet /
  the platform does not report the metric.
- **Metric scope** — lifetime, current, or a recent window; the old app shows this explicitly.
- **Cover set** — the four PNGs generated for one recording; unreserved sets expire after
  7 days.
- **Media project** — the original recording, full MP4, joined/edited videos, chapter clips,
  covers and links for one recording.
