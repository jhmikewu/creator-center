# Visual evidence

All browser captures use a **1440 × 940** CSS viewport unless noted. The before/after pairs use the
**light** theme and the same overview/account scenario. The after captures use the opt-in demo
workspace, so no private Feishu or platform account material is exposed.

## UI review follow-up (v0.1.1)

| Before (v0.1.0, merged) | After (v0.1.1) |
| --- | --- |
| ![Before typography](before-ui-pass-overview.png) | ![After typography](after-overview.png) |
| ![Before metric detail](before-ui-pass-account.png) | ![After collapsed essentials](after-account-detail.png) |

- [after-settings.png](after-settings.png) — Appearance with the new Text size control and its live
  preview at the selected scale.
- [after-overview-large.png](after-overview-large.png) — the same overview at the Large (130%) text
  setting; the 1200 px layout has no horizontal overflow.
- [after-settings-large.png](after-settings-large.png) — the settings preview at 130% (1200 px viewport).
- [after-account-metrics-expanded.png](after-account-metrics-expanded.png) — the `Show all metrics`
  state with all 11 metrics.
- [after-macos-desktop.png](after-macos-desktop.png) — actual Electron renderer on macOS. The native
  traffic lights are not included by `webContents.capturePage`, so the reserved 46 px strip above
  the brand is visible but empty. Measured in that window: sidebar padding-top 58 px, brand y=58,
  drag strip y=0–46, top bar x=248. This is the room the native controls now sit in.

The Text size control scales every label, table and card (0.9–1.4 multiplier; the UI offers
Compact 100%, Comfortable 112% and Large 130%). The preview uses the same scale. The metric detail
opens collapsed to followers, posts, likes, comments and shares, and expands to all 11 metrics.

## Old workspace import (v0.1.2)

| Before — v0.1.1 settings | After — import preview |
| --- | --- |
| ![Before import](before-import-settings.png) | ![Import preview](after-import-preview.png) |

- [after-import-preview.png](after-import-preview.png) — preview from the scrubbed old database:
  5 accounts, 20 content items, 107 history points, 6 merges, 5 to-dos, 23 Community days and
  10 media jobs, with destination readiness and warnings.
- [after-import-confirm.png](after-import-confirm.png) — the explicit confirmation before writing.
- [after-import-success.png](after-import-success.png) — imported state, backup path and the
  "Import complete" badge.
- [after-import-overview.png](after-import-overview.png) — the imported accounts in the workspace.

The source path shown in the captures is the scrubbed database supplied for validation; the
importer opens it read-only and never writes to it.

## UI follow-up: metric card name, row alignment and import actions (v0.1.2)

All pairs use the 1440 × 940 viewport and the light theme. The account-metric and alignment pairs
use the same imported 抖音 account; the import-action pair uses the same non-empty workspace. The
naming and import-action pairs start from the v0.1.2 head at `9aeb7bb`; the alignment pair starts
from the follow-up head at `c2a7bb7`. After is the follow-up commit.

| Before — "Metric detail" | After — "Account metrics" |
| --- | --- |
| ![Before metric card](before-followup-account-metrics.png) | ![After account metrics](after-followup-account-metrics.png) |
| ![Before import actions](before-followup-import-actions.png) | ![After import actions](after-followup-import-actions.png) |
| ![Before metric alignment](before-followup-metric-alignment.png) | ![After metric alignment](after-followup-account-metrics.png) |

The table is now labelled `Account metrics`, making it clear that the card belongs to the
per-account drawer. `Choose file` and `Preview` now sit on the same row as the database field
instead of aligning to the bottom of its hint. Metric rows now share a first-line baseline and
one column grid, so headers, text and numbers line up; a wrapped Period or Source no longer
leaves the name, value and scope floating between its two lines, and long source URLs wrap
after path separators. [after-followup-metric-alignment-expanded.png](after-followup-metric-alignment-expanded.png)
shows the expanded 11-metric state, including availability badges.

## UI copy pass (v0.1.2)

Implements the `AGENTS.md` UI guideline:

> The project is built entirely for personal use. So most secondary labels and descriptions will be redundant since builder and user are the same person. Let the layout do most of the explaining and only add descriptive text where necessary.

Before = main at `663e2a6`; after = this PR. Both use the 1440 × 940 viewport, the light theme and the imported workspace. The onboarding before capture is the existing v0.1.0 onboarding screenshot; its copy was unchanged through main.

| Screen | Before (`663e2a6`) | After (copy pass) |
| --- | --- | --- |
| Overview | ![Before overview](before-copy-overview.png) | ![After overview](after-copy-overview.png) |
| Account drawer | ![Before account](before-copy-account.png) | ![After account](after-copy-account.png) |
| Content planner | ![Before planner](before-copy-planner.png) | ![After planner](after-copy-planner.png) |
| Community monitor | ![Before community](before-copy-community.png) | ![After community](after-copy-community.png) |
| Media | ![Before media](before-copy-media.png) | ![After media](after-copy-media.png) |
| Settings (top) | ![Before settings top](before-copy-settings-top.png) | ![After settings top](after-copy-settings-top.png) |
| Settings (import) | ![Before settings import](before-copy-settings-import.png) | ![After settings import](after-copy-settings-import.png) |
| About & to-dos | ![Before about](before-copy-about.png) | ![After about](after-copy-about.png) |
| Onboarding | ![Before onboarding](before-copy-onboarding.png) | ![After onboarding](after-copy-onboarding.png) |

The pass removes page taglines and subtitles, section descriptions, footnotes, KPI hints, field hints and the long media/community roadmap prose, while keeping labels, statuses, warnings, confirmations, empty states and metric provenance.

## Live 抖音 collection (v0.1.3)

| Before — account drawer (existing capture) | After — Sign in action |
| --- | --- |
| ![Before live account](before-live-account.png) | ![After live account](after-live-account.png) |

The account view now offers **Sign in**, which opens the account's persistent isolated session.
The live creator-console capture itself needs the owner's signed-in session, so only the entry
point is shown; the bridge and the signed-out path were smoke-tested end to end.

## Bilibili and YouTube disable (v0.1.4)

| Before — Add account (main) | After — Add account (this PR) |
| --- | --- |
| ![Before YouTube disable](before-youtube-add-account.png) | ![After YouTube disable](after-youtube-add-account.png) |

Bilibili joins 抖音 in the live collector. YouTube is no longer offered in **Add account** while
its OAuth collector is deferred; existing YouTube data is untouched. The Bilibili capture needs
the owner's signed-in session, so only the Add account entry point is shown.

## Xiaohongshu live collection (v0.1.5)

小红书 joins 抖音 and Bilibili. Its account view uses the existing **Sign in** action; this
collector adds no new UI, so there is no new before/after capture.

## Original first increment

| File | What it shows |
| --- | --- |
| [before-old-overview.png](before-old-overview.png) | Baseline: the real `creator-center-old` frontend, served by a local fixture API, with the old 5-channel card layout, dot pool and side timeline. |
| [after-overview.png](after-overview.png) | After: redesigned overview with KPI band, per-account cards, follower dot pool and platform distribution. |
| [after-timeline.png](after-timeline.png) | The same overview scrolled to the 15-day Video/Print publishing timeline. |
| [after-overview-full.png](after-overview-full.png) | Full-height overview including Community growth, timeline and footer. |
| [after-overview-dark.png](after-overview-dark.png) | Overview in dark mode, including chart-specific colour tokens. |
| [after-account-detail.png](after-account-detail.png) | Detailed per-account drawer with collapsed metric essentials. |
| [after-planner.png](after-planner.png) | Content planner list, filters, tag catalogue and status legend. |
| [after-plan-dialog.png](after-plan-dialog.png) | Plan editor with content defaults, account targets, tags and publication links. |
| [after-merge-dialog.png](after-merge-dialog.png) | Account-keyed merge editor with one post per account. |
| [after-community.png](after-community.png) | Community monitor: status, catalogue counts, growth and worker health. |
| [after-settings.png](after-settings.png) | Local data, Text size, Community endpoint, sync, media paths, accounts and demo controls. |
| [after-about.png](after-about.png) | About, to-dos, changelog, roadmap and data directory. |
| [after-onboarding.png](after-onboarding.png) | Empty-workspace onboarding. |
| [after-add-account.png](after-add-account.png) | Add-account dialog. |
| [after-first-account.png](after-first-account.png) | A real account in `setup_required` state. |

## Capture method

- New app: Vite renderer against the demo API; screenshots taken with a Chromium browser at
  1440×940. The macOS capture is the actual Electron renderer at 1440×940 via the DevTools protocol.
- Old app: the actual `creator-center-old/frontend` production build served by a local mock API
  that returns the old dashboard/planner shape. This is a real application capture, not a mockup;
  the fixture data is labelled in the PR and implementation notes.
- The old screenshot includes the old app's five platform cards; the new app shows six accounts
  because it demonstrates multiple accounts on 抖音 (D1).
