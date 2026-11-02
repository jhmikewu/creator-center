# Creator Center — Product Requirements

- **Status:** Draft v0.2 — revised after reviewing the old app
- **Source brief:** [Issue #1](https://github.com/jhmikewu/creator-center/issues/1)
- **Old app:** [jhmikewu/creator-center-old](https://github.com/jhmikewu/creator-center-old) (reviewed 2026-11-03)
- **Last updated:** 2026-11-03

This is the requirements document for the new standalone Creator Center. Version 0.1 was
written before the old app could be opened; this version is based on the old app's README,
developer notes, backend and frontend code, and tests. It is a draft for the owner to confirm.
Section 12 lists the product decisions that are still open; the working assumption in each row
is only a starting point.

**How to review this draft**

1. Check the old-app summary in §2 and the parity matrix in §8 — correct anything that is
   wrong or missing.
2. Confirm or correct the interpretation of the brief in §3.
3. Answer the decisions in §12, especially Q1 (accounts per platform), Q3 (publishing) and
   Q4 (how standalone the app must be).

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
- Five channels: 抖音, 小红书, 公众号, Bilibili, YouTube.
- Content types tuned to physics teaching: paper walkthroughs, short lectures, question
  videos, text/image guides, and exam/competition information.
- It does **not** publish to platforms, like or comment on the creator's behalf, or manage
  multiple accounts per platform. Publishing is done manually on each platform; the app
  records what happened.
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

| Platform | Access method | Account data collected | Content collected | Known limits |
|---|---|---|---|---|
| 抖音 (Douyin) | Signed-in creator console, read through Playwright | Identity, followers, following, received likes, published count, overview analytics | Published works; scheduled works | `watch_hours` unsupported; analytics permission must be enabled; period and lifetime totals have different meanings |
| 小红书 (Xiaohongshu) | Signed-in creator console, read through Playwright | Identity, followers, following, note count, 7-day views/likes/comments/shares/saves | Published notes; scheduled notes | `watch_hours` and `avg_view_seconds` unsupported; profile likes and saves are combined, never split; completion rate unavailable without video views |
| 公众号 (WeChat Official Accounts) | Signed-in console pages | Identity, total followers, yesterday's reads and shares, published count | Published list | Following, likes, comments, saves, watch time, average duration and completion rate are not reported; content rows had not been observed with real content, so parsing is shape-based; scheduled posts are not read |
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
  list, but not likes, comments, saves, watch time or completion; scheduled posts are not read.
- **Cover errors are not actionable.** The cover dialog shows a generic `(503)` instead of the
  server's detail; the developer notes flag this as a bug.
- **UI has known limits.** Timeline slivers at some widths, a mobile range that can show one
  fewer post than optimal, columns hidden at 1024 px, and some focus/scrollbar issues were
  documented during the old app's QA. These are redesign inputs, not requirements to copy.
- **No direct publishing or engagement.** The app plans, links and observes; publishing,
  liking and commenting are manual on the platforms.
- **One account per platform.** The data model is keyed by platform, so a second Douyin
  account would need a schema change.
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
| C1 | Manage **multiple accounts across multiple platforms** | Five platform accounts, exactly one per platform | Reproduce the five accounts; Q1 asks whether more than one per platform is needed |
| C2 | Support **Chinese and foreign platforms** | 抖音, 小红书, 公众号, Bilibili (China) + YouTube (foreign) | Keep these five; Q9 asks about additions |
| C3 | Manage **posts** | Plans content, tracks published posts, links posts to plans, merges cross-posted posts; never publishes | Keep the plan/track/link workflow; Q3 asks whether direct publishing is wanted |
| C4 | Manage **likes** | Reads likes received as a metric; does not like or comment | Keep the read metric; Q3 asks whether acting on engagement is wanted |
| C5 | Manage **subscribers** | Reads followers/subscribers and daily history; no subscriber list management | Keep follower counts and history; Q3 asks whether list/export is wanted |
| C6 | Manage **analytics** | Per-account and per-post metrics, 30-day charts, 90-day history, explicit unknown/zero states | Keep and improve the analytics view |
| C7 | Cover "**and more**" | Media processing, video covers, merges, scheduled-post display, community status, browser sessions, to-dos | Preserve what is still useful; Q2 asks which to keep |
| C8 | Work around platforms with **no usable API** | Four signed-in browser collectors + official YouTube APIs | Keep the same access strategy in the desktop app |
| C9 | Run as a **standalone app** | LAN web dashboard with Docker and a remote worker | Standalone desktop app; Q4 defines how self-contained it must be |
| C10 | Run on **Windows and macOS**; Electron suggested | Linux host + browser clients | Electron (or equivalent) for both; Q12 asks about the stack |
| C11 | **Redesign** the old app, keeping what worked | A mature but deployment-heavy web app with known UI limits | Preserve workflows, modernise UI and operations |

## 4. Goals and non-goals

### 4.1 Goals

- **G1 — Parity where it matters.** Every daily workflow the owner uses in the old app is
  available in the new app, or is explicitly dropped with agreement.
- **G2 — True standalone desktop app.** Install and launch on Windows and macOS; no Docker,
  no separate web server, no self-signed certificate, no browser tab required.
- **G3 — Local-first data.** Accounts, plans, history, media records and settings live on the
  user's machine; the app works without a cloud account.
- **G4 — Same trusted data model.** Keep the distinctions between measured zero, unknown,
  unsupported, stale and pending, and keep metric scope/source/period visible.
- **G5 — Reliable collection.** Browser sessions and official APIs work with clear login,
  CAPTCHA and failure handling; one failing platform never hides or corrupts the others.
- **G6 — Efficient content workflow.** Plan, schedule locally, track publications, link media
  and merge cross-posts without leaving the app.
- **G7 — Media without the old infrastructure.** Convert, chapter, join and cover recordings
  in a way that works on a desktop, or with a clearly configured external worker.
- **G8 — Redesigned UX.** A modern, coherent, accessible interface that fixes the old app's
  known rough edges rather than reproducing them.
- **G9 — Safe secrets.** Platform cookies/sessions and YouTube tokens are protected; no
  secrets in logs, exports or plain-text files.

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
- No direct publishing or engagement actions unless Q3 says otherwise.
- No new platforms beyond the five unless Q9 says otherwise.
- No cloud sync or hosted backend.

## 5. Users and scale

- **Primary user:** one physics creator managing their own channels; the owner of the old app.
- **Accounts:** five platform accounts, one per platform, in the old app. Q1 covers whether
  multiple accounts per platform are needed.
- **Content types:** paper walkthroughs, short lectures, question videos, text/image guides,
  exam/competition information.
- **Content volume:** the old app shows the last 60 days plus today of published posts, keeps
  90 days of metric history, and plans can be undated or future-dated.
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
| ACC-01 | Manage the five platform accounts (抖音, 小红书, 公众号, Bilibili, YouTube) in one place. | MUST (parity) |
| ACC-02 | Support one account per platform, matching the old app's model; Q1 decides whether multiple accounts per platform are required. | MUST (parity) |
| ACC-03 | Sign in to the four browser-collected platforms in an embedded browser and keep the session across app restarts. | MUST (parity) |
| ACC-04 | Connect YouTube with a Google Desktop OAuth client, complete consent, choose a channel, refresh tokens, and disconnect locally. | MUST (parity) |
| ACC-05 | Show per-account connection/analytics/content state, last attempt, last success, and a clear re-authentication action. | MUST (parity) |
| ACC-06 | Sync automatically (about every six hours in the old app) and on demand; prevent overlapping syncs and show progress/errors. | MUST (parity) |
| ACC-07 | Keep the last successful reading when a refresh fails and mark it stale; never replace good data with an empty result. | MUST (parity) |
| ACC-08 | Open the platform's creator studio and public profile where available. | SHOULD (parity) |
| ACC-09 | Complete login, CAPTCHA, 2FA and other challenges in the embedded browser; never capture or replay the user's password. | MUST |
| ACC-10 | Store session cookies/tokens encrypted at rest and isolate them per platform. | MUST |
| ACC-11 | Add a new platform adapter without changing the rest of the app. | SHOULD |

### 6.2 Overview and channel monitoring (MON)

| ID | Requirement | Priority |
|---|---|---|
| MON-01 | Show a channel card per platform with followers, views, likes and posts, plus connection/freshness state. | MUST (parity) |
| MON-02 | Open a channel notebook with identity, access state, analytics state, metrics, history and published content. | MUST (parity) |
| MON-03 | Represent each metric's scope (`lifetime`, `current`, `window`), availability (`value`, `pending`, `unsupported`), reporting period, source and reason. | MUST (parity) |
| MON-04 | Distinguish a measured zero from unknown, unsupported, uninitialized and stale values. | MUST (parity) |
| MON-05 | Show a follower-growth view per channel (dot pool, 7-day gain, total) and, if the community monitor is kept, its separate growth sparklines over the same 30-day window. | MUST (parity) |
| MON-06 | Show the latest measurement time, not the page-fetch time, and a next-sync indicator. | MUST (parity) |
| MON-07 | Keep 90 days of daily metric history; charts show 30 days by default. | MUST (parity) |
| MON-08 | Show per-post metrics for the collected content window (60 days plus today). | MUST (parity) |
| MON-09 | Manual "sync now" refreshes all sources; results appear without a page reload. | MUST (parity) |

### 6.3 Content planner (PLN)

| ID | Requirement | Priority |
|---|---|---|
| PLN-01 | Create/edit/delete a plan with title, notes, content type, format, platforms, optional date, tags and publication links. | MUST (parity) |
| PLN-02 | Apply content-type defaults for platforms and format, while letting the user override them. | MUST (parity) |
| PLN-03 | Support the five content types and the two formats (video, print). | MUST (parity) |
| PLN-04 | Normalise and persist tags, support hashtags in notes and the exam-tag aliases. | MUST (parity) |
| PLN-05 | Filter plans by platform and tag; expose the tag catalogue. | MUST (parity) |
| PLN-06 | Keep plans private; saving or editing a plan must never publish to a platform. | MUST (parity) |
| PLN-07 | Protect unsaved edits and confirm destructive actions. | MUST (parity) |
| PLN-08 | Link a plan to one existing published post per selected platform, and keep links when a post temporarily drops out of the collection. | MUST (parity) |
| PLN-09 | Allow an undated idea, and a date without a time. | MUST (parity) |
| PLN-10 | Reschedule a plan by dragging it on the timeline or with the keyboard. | SHOULD (parity) |

### 6.4 Timeline, publications and merges (TML)

| ID | Requirement | Priority |
|---|---|---|
| TML-01 | Show an adaptive calendar in Asia/Shanghai with a date column and Video/Print lanes. | MUST (parity) |
| TML-02 | Show plans, published posts and platform-scheduled posts with distinct markers; every item on a visible date is reachable. | MUST (parity) |
| TML-03 | Open details for a plan or post from the calendar; show per-platform metrics and freshness. | MUST (parity) |
| TML-04 | Link a plan to collected posts per platform and show the plan as published for those targets. | MUST (parity) |
| TML-05 | Merge 2–5 published posts that carry the same content, at most one per platform; show one card with per-platform statistics; support edit and unmerge. | MUST (parity) |
| TML-06 | Show platform-scheduled posts as pending until they go live, and keep an ID/merge when a scheduled post becomes published. | MUST (parity) |
| TML-07 | Keep merged cards, plans and links consistent when a post leaves the 60-day content window. | MUST (parity) |
| TML-08 | Support an undated-ideas area and a full plan list beyond the visible calendar range. | MUST (parity) |
| TML-09 | Fix the old app's known timeline limits (clipped slivers, hidden lanes at 1024 px, mobile range off-by-one) in the redesign. | SHOULD (redesign) |

### 6.5 Analytics (ANL)

| ID | Requirement | Priority |
|---|---|---|
| ANL-01 | Normalise the metric set across platforms: followers, following, posts, views, likes, comments, shares, saves, watch hours, average view seconds and completion rate where reported. | MUST (parity) |
| ANL-02 | Keep per-platform semantics and reporting periods; do not total metrics whose definitions differ. | MUST (parity) |
| ANL-03 | Treat "not reported by this platform" as unsupported and "not collected yet" as pending. | MUST (parity) |
| ANL-04 | Store daily history and draw trends only from measured dates; do not interpolate missing days. | MUST (parity) |
| ANL-05 | Show the audience total as an account sum with the "not unique people" caveat, matching the old app. | SHOULD (parity) |
| ANL-06 | Keep the community metrics separate from platform metrics if the community monitor is kept. | SHOULD (parity) |
| ANL-07 | Provide a per-post and per-account breakdown that supports the content workflow. | MUST (parity) |
| ANL-08 | Export analytics data (CSV) for external analysis. | COULD (proposed) |
| ANL-09 | Compare two periods or two accounts side by side. | COULD (proposed) |

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
| MED-09 | Run without the old Unraid/NFS worker; use local FFmpeg, or support an explicitly configured external worker if Q4 keeps one. | MUST (standalone) |
| MED-10 | Work within the storage and processing limits of a laptop/desktop, with clear progress and actionable errors. | MUST (new) |
| MED-11 | Keep media project folders portable and back up/restore them with the app data. | SHOULD (new) |

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
| COM-01 | Show the community feed's connection, authentication and latency. | SHOULD (parity; Q2) |
| COM-02 | Show catalogue counts for all time, 24 hours and 7 days. | SHOULD (parity; Q2) |
| COM-03 | Show worker/service and timer health, mention jobs, graph/animation jobs and PDF status. | SHOULD (parity; Q2) |
| COM-04 | Keep daily community history for growth charts and retain the last good snapshot when the feed is down. | SHOULD (parity; Q2) |
| COM-05 | Make the status endpoint configurable and degrade gracefully when it is absent. | SHOULD (new) |

### 6.9 Desktop app and operations (DES)

| ID | Requirement | Priority |
|---|---|---|
| DES-01 | Ship as an installable desktop app for Windows and macOS. | MUST (brief) |
| DES-02 | Launch without Docker, a local web server the user must start, a self-signed certificate, NFS, or a second host. | MUST (standalone) |
| DES-03 | Store the database, settings and (optionally) media in a documented local app-data directory. | MUST (new) |
| DES-04 | Run sync in the background without blocking the UI; show progress and allow manual sync. | MUST (parity/new) |
| DES-05 | Support a tray icon and native notifications for sync failures and completed media jobs. | SHOULD (new) |
| DES-06 | Restore the last view/window state; prevent conflicting instances. | SHOULD (new) |
| DES-07 | Work offline with cached data; queue or clearly block actions that need a connection. | SHOULD (new) |
| DES-08 | Provide backup/restore and a documented data directory. | SHOULD (parity/new) |
| DES-09 | Auto-update or provide a clear manual update path. | SHOULD (new) |
| DES-10 | Sign/notarize builds where distribution requires it; document the requirement. | COULD (new) |
| DES-11 | Support English UI and keep the platform names/branding; Q8 asks whether Chinese UI is needed. | SHOULD (parity) |
| DES-12 | Optionally lock the app when the machine is unattended; Q16 asks whether a local login is needed. | COULD (new) |

### 6.10 Redesign and UX (UX)

| ID | Requirement | Priority |
|---|---|---|
| UX-01 | A modern, coherent visual design and component system; not a copy of the old CSS. | MUST (brief) |
| UX-02 | Preserve the old app's navigation model where it works: Overview, Content planner, Community (if kept), Media, About, plus browser sessions/account actions. | MUST (parity) |
| UX-03 | Fix the old app's known UI defects listed in §2.6 instead of reproducing them. | SHOULD (redesign) |
| UX-04 | Complete empty, loading, partial, stale and error states; errors must be actionable, not generic codes. | MUST |
| UX-05 | Keyboard navigation, visible focus, readable contrast and screen-reader labels. | SHOULD |
| UX-06 | Usable at common laptop sizes and when resized; decide whether phone-sized layouts are still needed (Q7). | SHOULD |
| UX-07 | Light and dark appearance. | COULD (confirm Q5) |
| UX-08 | A first-run setup that explains platform sessions, YouTube OAuth and data location. | SHOULD |
| UX-09 | Keep the density and information the owner needs; do not hide metrics behind extra clicks without reason. | SHOULD |
| UX-10 | Do not lose data or drafts on navigation, refresh or update. | MUST |
| UX-11 | If Q2 keeps it, show the About view with the personal to-do list (add/complete/delete) and changelog. | SHOULD (parity; Q2) |

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

## 7. Platform scope and collection coverage

The five platforms below are the confirmed scope from the old app. "One account" is the old
app's model; Q1 asks whether that changes.

| Platform | Region | Access | Metrics currently available | Content / scheduled posts | Keep in v1? |
|---|---|---|---|---|---|
| 抖音 | China | Signed-in creator console via browser | Followers, following, likes received, posts, views, comments, shares, saves, completion rate (where reported) | Published works; scheduled works (confirmed) | Yes |
| 小红书 | China | Signed-in creator console via browser | Followers, following, posts, 7-day views/likes/comments/shares/saves | Published notes; scheduled notes (confirmed) | Yes |
| 公众号 | China | Signed-in console pages via browser | Followers, yesterday's reads/shares, published count | Published list; scheduled posts not read | Yes |
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

## 8. Parity matrix

Proposed disposition of every old-app capability. "Keep" means v1 should preserve it; "keep,
redesign" means preserve the workflow but rebuild the UI; "ask" means Q2/Q3/Q4 decides.

| Old capability | New requirement | Proposed disposition |
|---|---|---|
| Overview channel cards and freshness | MON-01, MON-06 | Keep, redesign |
| Channel notebook and metric metadata | MON-02..04 | Keep, redesign |
| Follower dot-pool growth + community growth | MON-05 | Keep, redesign |
| Content planner and tags | PLN-01..09 | Keep, redesign |
| Timeline, plans, published and scheduled posts | TML-01..03, TML-06, TML-08 | Keep, redesign |
| Publication links | TML-04, PLN-08 | Keep, redesign |
| Merged posts | TML-05, TML-07 | Keep, redesign |
| Media inbox, conversion, chapters, exclusions | MED-01..03 | Keep, redesign |
| Two-screen join and clap cuts | MED-04 | Keep, redesign |
| Media archive, links and discard | MED-06..08 | Keep, redesign |
| Video covers and retention | COV-01..07 | Keep, redesign |
| Community monitor and history | COM-01..05 | Ask Q2 |
| YouTube OAuth connection | ACC-04 | Keep, redesign |
| Browser sessions | ACC-03, ACC-09 | Replace the remote desktop with an embedded browser |
| About/todos/changelog | UX-11 | Ask Q2 |
| Dashboard login | DES-12, SEC-05 | Ask Q16 (may be unnecessary in a local app) |
| Old SQLite data and media folders | DAT-01..04 | Ask Q6; migrate if wanted |
| Docker/NFS/watchdog/TLS deployment | DES-02 | Drop; the standalone app replaces it |
| Responsive phone access | UX-06 | Ask Q7 |
| Markdown-to-image post generator | — | Out of scope v1 (not built in old app) |
| Model-assisted frame/title suggestions | — | Out of scope v1 (not built in old app) |

## 9. Non-functional requirements

| ID | Requirement | Target / note |
|---|---|---|
| NFR-01 | Platform parity | All "keep" rows in §8 work in v1; dropped features are an explicit decision. |
| NFR-02 | Startup and UI responsiveness | Cold start under ~3 s on a typical machine; cached views under ~2 s. Proposed, validate. |
| NFR-03 | Sync reliability | Retries/backoff; one platform failure does not block or corrupt the others; last good data retained. |
| NFR-04 | Scale | Five platforms, 90 days of history, 60 days of posts, years of plans, long media projects. |
| NFR-05 | Media performance | Conversion/join/chapter times comparable to the old worker on the same hardware; progress for long jobs; no UI freeze. |
| NFR-06 | Security | OS keychain/encrypted storage for sessions and tokens; redacted logs; local-only by default; no telemetry without opt-in. |
| NFR-07 | Data safety | Versioned schema migrations, atomic writes for media/links, backup/restore, no silent data loss. |
| NFR-08 | Maintainability | Platform adapters behind a typed interface; tests for parsers, normalization and scheduling. |
| NFR-09 | Observability | Local logs and a diagnostics export that strips secrets. |
| NFR-10 | Accessibility | Keyboard reachable, visible focus, reasonable contrast, screen-reader labels. |
| NFR-11 | Internationalisation | Strings externalised; English first; Chinese UI if Q8 asks. |
| NFR-12 | Privacy | Local-first; no third-party analytics; platform credentials never leave the machine except to the platform. |

## 10. Technical considerations

These are options, not decisions. They depend on Q4 and Q12.

### 10.1 Application shape

- **Electron app with a bundled local backend.** The UI runs in Electron; the backend can be
  a bundled Python/FastAPI sidecar (reusing the old app's collectors and tests) or a
  TypeScript backend inside Electron.
- **Electron app with a TypeScript rewrite.** Reuses the React UI language but rewrites the
  API, collectors and media orchestration. Cleaner single-runtime packaging; more work.
- **Thin Electron client to the old server.** Not standalone; would fail C9/DES-02.

The old app's UI is React 19 + TypeScript, so reusing the frontend components and design
language is practical. The backend choice is the main cost/risk trade-off.

### 10.2 Platform sessions and collection

- A persistent Chromium profile in the app, with an embedded browser window for login and
  challenge handling.
- Playwright can drive the embedded browser over CDP on Windows/macOS; the old collectors are
  Playwright/Python and already read creator-console JSON.
- If the backend is TypeScript, the collectors must be ported; the old app's parsing rules are
  the specification and its tests are useful fixtures.
- YouTube uses the official APIs with a desktop OAuth client; the loopback callback can be
  handled inside the app.

### 10.3 Data and secrets

- SQLite remains a good fit; the old schema is small and can be migrated.
- Sessions/cookies and YouTube tokens must use the OS keychain or Electron `safeStorage`, not
  plain files.
- Media paths and the watched inbox/output/archive directories must be configurable; local
  disk is the default, with an optional external/NAS path.

### 10.4 Media and covers

- Bundle or require FFmpeg. Bundling gives a predictable install but increases the app size;
  requiring a separate install adds setup friction.
- The old media worker is a separate process talking to the API; in a desktop app it can be a
  local worker process or a child process of the app.
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
| 0 — Decisions | Q1–Q6 answered; feature keep/drop list confirmed; architecture chosen. |
| 1 — Shell and core data | Electron app, local SQLite, settings, secure storage, account list, one working platform adapter. |
| 2 — Workspace | Overview cards, channel notebook, follower history, content planner, timeline, publication links and merges. |
| 3 — Media | Inbox, conversion, chapters, two-screen join, archive, media links. |
| 4 — Covers and community | Cover presets/rendering; community monitor if kept; YouTube connection if not done earlier. |
| 5 — Migration and release | Import old data/media, backup/restore, packaging, update path, redesign polish, accessibility. |

**Proposed v1 acceptance criteria**

1. Install and launch on Windows and macOS without Docker, NFS or a separately started server.
2. Sign in to all four browser platforms and connect YouTube; see their status and freshness.
3. See the five channel cards, metric details (value/pending/unsupported), and 30-day follower
   history.
4. Create, edit and delete a plan with content type, format, platforms, tags and date; restart
   the app and find it intact.
5. See plans, published posts and scheduled posts on the timeline; link a plan to a post;
   merge two posts and unmerge them.
6. Convert a recording to a full MP4, export a chapter clip, link it to a plan, and archive it.
7. Create a cover set with each of the four ratios and reserve it.
8. Keep measured zero, unknown and stale values distinct throughout the UI.
9. Confirm no secret is stored in plain text and no log/diagnostic export contains one.
10. (If kept) see the community feed and its history; if dropped, no navigation entry remains.

## 12. Open questions and working assumptions

The "working assumption" column is what this draft assumes. Confirm, correct or reject each
row; Q1–Q6 change the scope or architecture.

| # | Question | Working assumption |
|---|----------|--------------------|
| Q1 | Does "multiple accounts" mean one account on each of several platforms (as the old app), or several accounts per platform too? | One per platform, matching the old app; multi-account is a later extension. |
| Q2 | Should the new app keep **all** old features — Community monitor, About/to-dos/changelog, community-forum growth — or focus on channels, planner, timeline, media and covers? | Keep all; Community is included. |
| Q3 | Does the new app need to **publish**, schedule on platforms, like/comment, or manage subscriber lists? The old app only reads and plans. | No; keep manual publishing + local plans + publication links. |
| Q4 | How standalone must it be? Fully local (media processing on the desktop), or may it use the existing Unraid worker/NFS? | Fully local; no Docker/NFS; optional external worker later. |
| Q5 | What specifically should the redesign fix, and what visual direction/references should it follow? Dark mode? | Modern, simpler, preserve workflows; details needed. |
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
| Q17 | Keep reading platform-scheduled posts? Should 公众号 scheduled posts be added? | Keep current coverage; 公众号 scheduled posts not read. |
| Q18 | Are browser-automation and account-risk trade-offs acceptable, as in the old app? | Yes; same signed-in-session model, human handles challenges. |
| Q19 | Is the Discourse status endpoint staying at the same service, or should the community monitor be configurable/optional? | Keep, configurable endpoint. |
| Q20 | How much of the old app's test suite/parsers should be ported as-is? | Port parser/normalization tests as regression fixtures. |

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A standalone rewrite becomes a full re-implementation of a mature app | Long delay, regressions | Phase parity; port parsers/tests; keep the old app running until v1 is proven. |
| Platform collectors break | Missing metrics/posts | Adapter isolation, health checks, clear stale states, fast manual update. |
| Browser automation conflicts with platform terms | Account risk | User opt-in, same model as old app, human handles challenges, no stealth promises. |
| Media processing on a laptop is slow or runs out of space | Poor UX, failed jobs | Local FFmpeg, progress, disk checks, optional external worker (Q4). |
| Old data/media migration is lossy | Lost history or broken links | Migration tool, dry run, backups, path mapping. |
| macOS notarization / Windows signing | Users cannot install | Decide distribution early (Q10); document workarounds. |
| Electron security/update burden | Vulnerabilities, stale builds | Keep Electron current, minimal privileges, signed updates where possible. |
| Loss of phone/remote access | Workflow change | Confirm Q7; if needed, add a local-network web view or remote mode. |
| YouTube OAuth setup is fiddly | Monitoring not enabled | Guided setup, clear errors, keep stale data. |
| UI redesign loses density or hides key metrics | Owner rejects it | Review with the owner early; preserve information architecture. |
| Scope creep from "and more" | v1 never ships | Explicit parity matrix; defer marked items. |

## 14. Glossary

- **Account** — one platform identity (the old app has one per platform).
- **Plan** — a local content idea with a title, content type, format, platforms, optional date,
  tags and links; not a platform post.
- **Published post** — a post collected from a platform's creator console/API.
- **Scheduled post** — a platform-side scheduled publication read from the platform, not a
  plan.
- **Publication link** — a saved association between a plan and one collected post per
  platform; it never publishes.
- **Merge** — a local group of 2–5 published posts carrying the same content, at most one per
  platform.
- **Capability** — what an adapter can do for a platform (read metrics, read content, read
  scheduled posts, write actions).
- **Stale / pending / unsupported** — failed refresh with retained data / not collected yet /
  the platform does not report the metric.
- **Metric scope** — lifetime, current, or a recent window; the old app shows this explicitly.
- **Cover set** — the four PNGs generated for one recording; unreserved sets expire after
  7 days.
- **Media project** — the original recording, full MP4, joined/edited videos, chapter clips,
  covers and links for one recording.
