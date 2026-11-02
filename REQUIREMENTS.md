# Creator Center — Product Requirements

- **Status:** Draft v0.1 — for review and confirmation
- **Source brief:** [Issue #1](https://github.com/jhmikewu/creator-center/issues/1)
- **Last updated:** 2026-11-03

This document describes what the new standalone Creator Center must do. It is based on the
brief in Issue #1. The old app (`creator-center-old`) could not be reviewed yet — the link
returns "not found" and is not accessible to the project account — so anything that depends
on the old app's feature set is marked **pending** (see §9). §10 lists the open questions and
the working assumptions used to keep this draft moving; those assumptions are not decisions.

**How to review this draft**

1. Correct or delete anything in §4 that is wrong.
2. Answer the questions in §9 and §10 — even a short reply per row is enough.
3. Confirm or reject the proposed v1 scope in §11 and the milestones in §12.

---

## Contents

1. [Overview](#1-overview)
2. [Goals](#2-goals)
3. [Non-goals](#3-non-goals-working-assumptions)
4. [Requirements from the brief](#4-requirements-from-the-brief)
5. [Users and scale](#5-users-and-scale)
6. [Functional requirements](#6-functional-requirements)
7. [Platform scope](#7-platform-scope)
8. [Non-functional requirements](#8-non-functional-requirements)
9. [Old app review (pending)](#9-old-app-review-pending)
10. [Open questions and working assumptions](#10-open-questions-and-working-assumptions)
11. [Proposed v1 scope and acceptance criteria](#11-proposed-v1-scope-and-acceptance-criteria)
12. [Milestones](#12-milestones)
13. [Risks](#13-risks)
14. [Glossary](#14-glossary)

---

## 1. Overview

Creator Center is a standalone desktop application for a creator who manages several accounts
on Chinese and foreign content platforms. It brings account management, publishing, engagement,
audience data and analytics into one place. It must also support platforms that do not offer a
usable public API, using a user-authorized browser session as a fallback where necessary.

The app replaces and redesigns the existing Creator Center app. The workflows that already
worked should be preserved; the redesign should make the product easier and more pleasant to
use, and package it as an installable desktop app for Windows and macOS.

## 2. Goals

- **G1 — One control center.** Manage every account and platform from a single app instead of
  signing in to each platform separately.
- **G2 — Multi-account by default.** Several accounts per platform, with a clear way to see,
  switch and act on each one.
- **G3 — Unified publishing.** Compose once, adapt per platform, and publish or schedule to
  one or many accounts without repeating the work.
- **G4 — Unified analytics.** See posts, engagement, audience and performance across accounts
  and platforms in one dashboard, with drill-down per platform and per post.
- **G5 — Handle API-less platforms.** Provide a workable, user-authorized way to read and act
  on platforms that lack a usable API, without pretending the limitation does not exist.
- **G6 — True desktop app.** Standalone installable app for Windows and macOS, with local
  data, background sync and safe storage of credentials/sessions.
- **G7 — Redesign.** A modern, coherent interface that keeps the old app's useful workflows
  and fixes its usability problems.

## 3. Non-goals (working assumptions)

These keep v1 bounded. They are assumptions to confirm, not decisions:

- Not a multi-tenant SaaS product; one person uses one local installation.
- Not a mobile app in v1.
- Not a replacement for the platforms' own apps for casual browsing or social networking.
- No team collaboration, roles or shared workspaces in v1.
- No automatic solving of CAPTCHAs or bypassing platform security controls; the user handles
  challenges themselves.
- Not a general-purpose scraper or data broker; data stays local.

## 4. Requirements from the brief

These are the requirements stated in Issue #1, kept close to their original wording.

| ID | Requirement |
|----|-------------|
| C1 | Manage **multiple accounts** across multiple platforms. |
| C2 | Support both **Chinese and foreign platforms**. |
| C3 | Manage **posts** — create, publish and keep track of content. |
| C4 | Manage **likes** — see and/or act on engagement. |
| C5 | Manage **subscribers** — audience size and growth. |
| C6 | Manage **analytics** — performance data across accounts and platforms. |
| C7 | Cover "**and more**" day-to-day creator tasks as the old app did. |
| C8 | Work around platforms that have **no usable API**. |
| C9 | Run as a **standalone app** (not a website that must be hosted). |
| C10 | Run on **Windows and macOS**; Electron is the suggested approach. |
| C11 | Be a **redesign** of the old app, keeping the workflows that already worked. |

## 5. Users and scale

- **Primary user:** the repo owner — a single creator managing their own accounts.
- **Accounts:** assumed up to roughly 10 platforms and up to a few accounts per platform
  (working assumption Q10). The exact count matters for sync scheduling and UI.
- **Usage pattern:** daily check of analytics/engagement; periodic publishing; background sync
  while the app is open.
- **Environment:** desktop/laptop, possibly with network conditions that differ between China
  and abroad. Cross-border access and proxy support is an open question (Q17).

## 6. Functional requirements

Priority words: **MUST** = required for v1, **SHOULD** = expected, **COULD** = optional/later.
Every requirement below is proposed detail derived from the brief unless marked otherwise.

### 6.1 Account management (ACC)

| ID | Requirement | Priority |
|----|-------------|----------|
| ACC-01 | Add an account for a supported platform, giving it a display name and optional notes. | MUST |
| ACC-02 | Hold multiple accounts per platform and show them separately. | MUST |
| ACC-03 | Authenticate through the platform's supported method: OAuth/authorization flow where available, otherwise an in-app browser login. | MUST |
| ACC-04 | Store session tokens/cookies securely (OS keychain or equivalently protected storage), never in plain text. | MUST |
| ACC-05 | Show connection state per account (connected, expiring, expired, error) and let the user re-authenticate. | MUST |
| ACC-06 | Switch the active account/platform quickly, and filter views by account. | MUST |
| ACC-07 | Show useful account identity (platform, avatar, display name, account type) in lists and headers. | SHOULD |
| ACC-08 | Allow removing an account and wiping its local credentials and cached data after confirmation. | MUST |
| ACC-09 | Group or tag accounts (e.g. by brand, language or region). | COULD |
| ACC-10 | Optional per-account network/proxy configuration, if cross-border access needs it. | COULD (confirm Q17) |

### 6.2 Publishing and content (PUB)

| ID | Requirement | Priority |
|----|-------------|----------|
| PUB-01 | Compose a post with text and media (images and video where the platform supports them). | MUST |
| PUB-02 | Adapt one draft per platform: caption, media, mentions/hashtags, visibility, and platform-specific fields. | MUST |
| PUB-03 | Publish to one account or several accounts/platforms in one action, with per-target confirmation. | SHOULD |
| PUB-04 | Save, edit and delete drafts locally. | MUST |
| PUB-05 | Schedule a post for a future time and show a queue/calendar. | SHOULD |
| PUB-06 | Show publish status (queued, publishing, published, failed), with error detail and retry. | MUST |
| PUB-07 | Edit or delete already-published posts where the platform permits it; otherwise explain why not. | SHOULD |
| PUB-08 | Keep a reusable local media library with basic metadata. | SHOULD |
| PUB-09 | Preview how a post will look before publishing. | SHOULD |
| PUB-10 | Keep a searchable history of posts across accounts. | MUST |
| PUB-11 | Respect per-platform limits (length, media count/size, formats, rate limits) and validate before sending. | MUST |
| PUB-12 | Reusable templates or saved caption snippets. | COULD |

### 6.3 Engagement (ENG)

"Likes" in the brief could mean reading engagement received, performing engagement, or both.
This draft covers both; Q3 asks which is required.

| ID | Requirement | Priority |
|----|-------------|----------|
| ENG-01 | Show likes, comments, shares/reposts, saves and mentions received per post and per account where the platform exposes them. | MUST |
| ENG-02 | Notify the user about new engagement, with per-account/per-platform controls. | SHOULD |
| ENG-03 | Perform basic engagement actions (like/unlike, reply to a comment, follow/unfollow) where the platform and access method allow it. | SHOULD (confirm Q3) |
| ENG-04 | Offer bulk actions (e.g. select and like several posts) with clear confirmation. | COULD |
| ENG-05 | Provide a simple unified inbox for comments/mentions that need a reply. | COULD |

### 6.4 Audience and subscribers (AUD)

| ID | Requirement | Priority |
|----|-------------|----------|
| AUD-01 | Show subscriber/follower counts per account and per platform. | MUST |
| AUD-02 | Track audience growth over time and show the trend. | MUST |
| AUD-03 | Show gained/lost followers where the platform provides the data. | SHOULD |
| AUD-04 | List or export subscribers/followers where the platform and its terms permit it. | SHOULD |
| AUD-05 | Show audience demographics or geography where available. | COULD |

### 6.5 Analytics (AN)

| ID | Requirement | Priority |
|----|-------------|----------|
| AN-01 | Provide a unified home dashboard across all connected accounts and platforms. | MUST |
| AN-02 | Break metrics down by platform, account and date range. | MUST |
| AN-03 | Show per-post performance (views/impressions, likes, comments, shares, saves, watch time, click-through where available). | MUST |
| AN-04 | Compare periods (e.g. this week vs last week) and platforms/accounts. | MUST |
| AN-05 | Store historical metrics locally so trends survive even if a platform only exposes recent data. | MUST |
| AN-06 | Show when each account was last synced, and allow manual refresh. | MUST |
| AN-07 | Export data (CSV at minimum) for further analysis. | SHOULD |
| AN-08 | Present metrics with clear charts and tables, not raw dumps. | MUST |
| AN-09 | Track creator-defined goals or targets. | COULD |
| AN-10 | Include revenue/earnings metrics where a platform exposes them. | COULD (confirm Q11) |

The exact metric set is platform-dependent; the app should show what is available and clearly
label missing metrics rather than displaying misleading zeros.

### 6.6 Platform integration (PLT)

| ID | Requirement | Priority |
|----|-------------|----------|
| PLT-01 | Isolate each platform behind an adapter with a shared capability model (what can be read, published or acted on). | MUST |
| PLT-02 | Prefer official APIs wherever they are usable and permitted. | MUST |
| PLT-03 | For platforms without a usable API, support a user-authorized fallback: an in-app browser session with automation, manual-assisted actions, or import/export, chosen per platform. | MUST |
| PLT-04 | Let the user complete login, CAPTCHA, 2FA and other challenges themselves; never silently bypass them. | MUST |
| PLT-05 | Handle rate limits, transient failures and session expiry with retries, backoff and clear status. | MUST |
| PLT-06 | Degrade gracefully: if one platform fails, the rest of the app and other accounts keep working. | MUST |
| PLT-07 | Explain the access method and any platform/terms risk for each account before it is connected. | MUST |
| PLT-08 | Detect and report platform-side changes that break an adapter, without crashing the app. | SHOULD |
| PLT-09 | Never collect credentials the user did not deliberately provide to the app. | MUST |
| PLT-10 | Make adding a new platform adapter a bounded change (typed interface, tests, no UI rewrite). | SHOULD |

**Access strategy options for API-less platforms** (to be selected per platform with the user):

- In-app browser login and reuse of the user's own session.
- Browser automation of the platform's web UI for read and/or write actions.
- Manual-assisted workflows (user performs the action in a browser, app records the result).
- Import of platform-exported data files.

Each option has different reliability, terms-of-service and account-safety trade-offs; the
final choice is a product decision (Q5), not something this document assumes silently.

### 6.7 Desktop application (APP)

| ID | Requirement | Priority |
|----|-------------|----------|
| APP-01 | Ship as an installable desktop app for Windows and macOS. | MUST |
| APP-02 | Package signed installers and support in-app updates (or a clear manual update path). | SHOULD |
| APP-03 | Store data locally (accounts, posts, metrics, settings) and work without a mandatory cloud backend. | MUST |
| APP-04 | Sync in the background without blocking the UI, optionally with a tray icon. | SHOULD |
| APP-05 | Offer launch-at-login and configurable sync frequency. | SHOULD |
| APP-06 | Use native notifications for publishing results, sync failures and new engagement. | SHOULD |
| APP-07 | Allow reading cached data offline; queue or block actions that need a connection with a clear message. | MUST |
| APP-08 | Restore the previous window/session state and prevent multiple conflicting instances. | SHOULD |
| APP-09 | Back up and restore the local database, and export/import user data. | SHOULD |
| APP-10 | Support Linux if it is cheap to do so; not required for v1. | COULD |
| APP-11 | Offer an app lock or auto-lock for unattended machines. | COULD |

### 6.8 Redesign and UX (UX)

| ID | Requirement | Priority |
|----|-------------|----------|
| UX-01 | A modern, coherent visual design and layout, not a reskin of the old UI. | MUST |
| UX-02 | Task-oriented navigation: accounts, compose/publish, content, engagement, audience, analytics, settings. | MUST |
| UX-03 | Preserve the old app's core workflows; map each one to a new flow after the old app review. | MUST (pending §9) |
| UX-04 | First-run onboarding: add the first account and explain API vs browser-session access. | SHOULD |
| UX-05 | Complete empty, loading, partial and error states; no dead ends. | MUST |
| UX-06 | Light and dark appearance. | SHOULD |
| UX-07 | Reasonable keyboard navigation and shortcuts. | COULD |
| UX-08 | Accessibility: readable contrast, focus states, scalable text. | SHOULD |
| UX-09 | Chinese and English UI, if the user needs both. | SHOULD (confirm Q19) |
| UX-10 | Usable at common laptop resolutions and when resized. | SHOULD |

### 6.9 Security and privacy (SEC)

| ID | Requirement | Priority |
|----|-------------|----------|
| SEC-01 | Store tokens, cookies and session material encrypted at rest, using the OS keychain where possible. | MUST |
| SEC-02 | Never log or display secrets; redact them from diagnostics and crash reports. | MUST |
| SEC-03 | Keep data local by default; any telemetry or cloud feature is opt-in and disclosed. | MUST |
| SEC-04 | Limit network access to the platforms and services the app actually needs. | SHOULD |
| SEC-05 | Record sensitive account actions (connect, disconnect, publish) in a local audit log. | COULD |

### 6.10 Data and migration (DAT)

| ID | Requirement | Priority |
|----|-------------|----------|
| DAT-01 | Use a durable local database with schema migrations between app versions. | MUST |
| DAT-02 | Provide backup/restore and a documented data location. | SHOULD |
| DAT-03 | Migrate data from the old app if its data can be read and the mapping is safe. | SHOULD (pending §9) |
| DAT-04 | Define retention for cached platform data and let the user clear it. | MUST |

## 7. Platform scope

The brief names "multiple Chinese and foreign platforms" but not the specific list. The old
app is the best source for that list and is currently unavailable, so the table below is a
**candidate inventory for confirmation**, not a committed v1 scope. API availability changes
and must be verified platform by platform at implementation time.

| Platform | Region | Typical account | Expected access path (to verify) | Confirm? |
|----------|--------|-----------------|----------------------------------|----------|
| WeChat Official Accounts (微信公众号) | CN | Official account | Official API (limited) or browser session | ☐ |
| WeChat Channels (视频号) | CN | Channel | Browser session / automation likely | ☐ |
| Weibo (微博) | CN | Personal/brand account | Open API (restricted) or browser session | ☐ |
| Xiaohongshu / RED (小红书) | CN | Creator account | Browser session / automation likely | ☐ |
| Douyin (抖音) | CN | Creator account | Open platform (limited) or browser session | ☐ |
| Bilibili (哔哩哔哩) | CN | Creator account | Open platform (limited) or browser session | ☐ |
| Zhihu (知乎) | CN | Personal account | Browser session / automation likely | ☐ |
| Toutiao (今日头条) | CN | Creator account | Open platform (limited) | ☐ |
| Kuaishou (快手) | CN | Creator account | Open platform (limited) | ☐ |
| YouTube | INTL | Channel | Official data/analytics APIs | ☐ |
| Instagram | INTL | Business/Creator | Official Graph API (professional accounts) | ☐ |
| Facebook | INTL | Page | Official Graph API | ☐ |
| X (Twitter) | INTL | Account | Official API (paid tiers) | ☐ |
| TikTok | INTL | Creator account | Official posting/display APIs | ☐ |
| LinkedIn | INTL | Profile/Page | Official API (approval required) | ☐ |
| Threads | INTL | Account | Official Threads API | ☐ |
| Pinterest | INTL | Business account | Official API | ☐ |

Once the actual platforms are confirmed, each gets:

- a **capability row**: read analytics, read engagement, publish, schedule, act on engagement,
  audience list/export;
- an **access decision**: official API, browser session, manual-assisted, or unsupported;
- a **priority**: v1 must-have, later, or explicitly out of scope.

## 8. Non-functional requirements

| ID | Requirement | Target / note |
|----|-------------|---------------|
| NFR-01 | Responsive UI | Cold start under ~3 s on a typical machine; cached dashboard under ~2 s. Proposed targets, to validate. |
| NFR-02 | Reliable sync | Retries with backoff; one failing platform must not block others; no silent data loss. |
| NFR-03 | Scale | Comfortably handle ~10 platforms, up to a few accounts each, and years of post/metric history. |
| NFR-04 | Security | Encrypted secrets at rest, redacted logs, least-privilege network access. |
| NFR-05 | Maintainability | Platform adapters behind a typed interface; automated tests for normalization and scheduling. |
| NFR-06 | Observability | Local logs with a "export diagnostics" action that strips secrets. |
| NFR-07 | Update safety | Versioned data migrations; an update must not corrupt or silently drop data. |
| NFR-08 | Accessibility | Keyboard reachable, visible focus, reasonable contrast. |
| NFR-09 | Internationalisation | UI strings externalised even if v1 ships one language. |
| NFR-10 | Privacy | Local-first; no third-party analytics or tracking by default. |

## 9. Old app review (pending)

The brief says the old app worked and should be redesigned rather than reinvented. I could not
review it yet:

- `https://github.com/jhmikewu/creator-center-old` returns **404 / "Page not found"** from the
  project's GitHub account and from an unauthenticated browser.
- It is not among the public repositories on the account, and the project account has no
  collaborator access if it is private.

**What is needed** (any one of these):

1. Grant the project GitHub account (`liamsdevs-dev`) read access to `creator-center-old`; or
2. Make the repository public; or
3. Share the correct URL/owner if the repo was renamed or moved; or
4. Export the repo (zip) or provide screenshots/a feature list and the old app's data format.

**What the review will produce:**

- A feature inventory: what the old app did, platform by platform.
- The old workflows worth preserving, and the pain points the redesign must fix.
- The old tech stack and data model, to judge reuse versus rewrite and to plan migration.
- A mapping from each old feature to a requirement in this document (or a decision to drop it).

Until then, this document describes the product from the brief and general creator-workflow
knowledge; it does not claim to be a complete parity list.

## 10. Open questions and working assumptions

The "working assumption" column is what this draft currently assumes. Confirm, correct or
reject each row.

| # | Question | Working assumption |
|---|----------|--------------------|
| Q1 | Can you provide access to the old app repo, or a correct link/export? | Not available; see §9. This is the main blocker for a complete parity list. |
| Q2 | Which platforms exactly, and which are v1 versus later? | Candidate list in §7; old app will define the real list. |
| Q3 | Does "likes" mean reading engagement received, performing engagement (like/comment/follow), or both? | Both, with read-only guaranteed first. |
| Q4 | Is this strictly a single-user personal tool, or will other people use it? | Single user, one local installation. |
| Q5 | How much automation is acceptable for API-less platforms? Are account-safety and terms-of-service risks acceptable, and which fallback methods do you prefer? | User-authorized browser sessions, with human handling of CAPTCHA/2FA; no silent bypass. |
| Q6 | What specifically is wrong with the old app's design, and what should the redesign achieve? Any reference apps/screenshots? | Modern, cleaner UI and packaging; keep workflows. Needs your input. |
| Q7 | Should the app publish (post/schedule), or only read/manage existing content, in v1? | Publish and schedule, where platforms allow. |
| Q8 | Do you want scheduling, a content calendar and reminders? | Yes (SHOULD). |
| Q9 | Should data stay local only, or do you want backup/sync across machines? | Local only, with backup/restore. |
| Q10 | How many accounts/platforms in practice? | ~10 platforms, a few accounts each. |
| Q11 | Which analytics metrics and audience data matter most? Any revenue metrics? | Standard engagement/audience metrics; revenue only where a platform exposes it. |
| Q12 | Is Electron confirmed, or should alternatives be considered? Any stack preference? | Electron + TypeScript, unless you prefer otherwise. |
| Q13 | Which OS versions must be supported? Is Linux wanted? | Windows 10/11 and recent macOS; Linux optional. |
| Q14 | Do you need to migrate data from the old app? | Yes if the data is readable; otherwise fresh start. |
| Q15 | Are paid APIs (e.g. X/Twitter) acceptable? Any budget constraint? | Avoid paid APIs in v1 unless required for a must-have platform. |
| Q16 | Should the app run in the background and notify you? | Yes, optional tray/notifications. |
| Q17 | Do you need per-account proxies/VPN support for cross-border platforms? | Open; design for it but do not require it in v1. |
| Q18 | Is a multi-account "brand"/workspace grouping useful? | Not in v1. |
| Q19 | Which UI languages are needed? | English first; Chinese if you need it. |

## 11. Proposed v1 scope and acceptance criteria

**Proposed v1 scope** (adjust after Q1–Q7):

- Desktop shell with local database, secure session storage and settings.
- Account management for a first set of platforms, including mixed API and browser-session
  access.
- Unified analytics dashboard across connected accounts and at least basic per-post metrics.
- Compose/publish to at least one platform, with draft, status and retry.
- A redesigned UI that covers the old app's core daily workflows.
- Windows and macOS builds.

**Acceptance criteria for v1:**

1. Add at least two accounts on two different platforms and see them in one account list.
2. Re-authenticate an expired session without losing locally stored data.
3. View a unified analytics view and drill into one account and one post.
4. Create, schedule and publish a post to at least one platform; see status and retry a failure.
5. Restart the app and find accounts, posts and historical metrics intact; export a backup.
6. Install and launch the packaged app on Windows and macOS.
7. Confirm no secret appears in plain text in the database, logs or diagnostics.
8. After the old app review, confirm every old core workflow is preserved or intentionally
   dropped.

## 12. Milestones

No dates until scope is confirmed. Each milestone should end in something usable.

| Milestone | Outcome |
|-----------|---------|
| M0 — Discovery | Old app reviewed; Q1–Q7 answered; platform list and v1 scope confirmed. |
| M1 — Foundation | Desktop shell, local database, account model, secure storage, one adapter (read-only). |
| M2 — Analytics | Multi-account dashboard, historical data, per-post drill-down. |
| M3 — Publishing | Composer, drafts, scheduling, publishing to 1–3 platforms, status/retry. |
| M4 — Engagement and breadth | Engagement view; remaining priority platforms; audience data. |
| M5 — Redesign and release | UX polish, packaging, auto-update, migration, Windows/macOS builds. |

## 13. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| No usable API on some platforms | Core features may be slow or fragile | Capability model; browser-session fallback; set expectations per platform. |
| Platform terms forbid automation | Account suspension or legal exposure | Disclose risk; user opt-in; prefer official APIs; human-in-the-loop; no stealth promises. |
| Platform UI/API changes | Adapters break | Adapter isolation, health checks, fast manual update path. |
| CAPTCHA/2FA | Automated flows stop | Hand off to the user; never store challenge answers. |
| Credential/session theft | Account compromise | OS keychain, encryption, redacted logs, least privilege. |
| Paid API quotas or costs | Some platforms become expensive | Flag costs; choose platforms deliberately. |
| Old app unknown | Missing features / wrong redesign | Do not finalize scope before §9 review. |
| Electron security and update burden | Vulnerabilities or stale builds | Keep Electron current; signed updates; minimal privileges. |
| Cross-border network access | Sync failures or slow access | Clear errors; optional proxy support (Q17). |
| Scope creep from "and more" | v1 never ships | Explicit v1 scope and milestones; defer to COULD/later. |

## 14. Glossary

- **Account** — one login/identity on one platform (e.g. one YouTube channel).
- **Platform** — an external service (e.g. YouTube, 小红书).
- **Adapter** — the code that talks to one platform and normalizes its data.
- **Capability** — an action or data type a platform/adapter supports (read analytics,
  publish, like, export audience).
- **Session** — the authenticated browser/API state for an account.
- **API-less platform** — a platform with no usable public API for the required actions.
- **Fallback access** — user-authorized browser session, automation, manual-assisted action or
  data import used when no API exists.
