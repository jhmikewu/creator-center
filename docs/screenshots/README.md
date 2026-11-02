# Visual evidence

All captures use a **1440 × 940** CSS viewport. The before/after pair uses the **light** theme and
the same overview scenario. The after captures use the opt-in demo workspace, so no private
Feishu or platform account material is exposed.

| File | What it shows |
| --- | --- |
| [before-old-overview.png](before-old-overview.png) | Baseline: the real `creator-center-old` frontend, served by a local fixture API, with the old 5-channel card layout, dot pool and side timeline. |
| [after-onboarding.png](after-onboarding.png) | Empty-workspace onboarding: local-first explanation, first-account action and demo option. |
| [after-add-account.png](after-add-account.png) | Add-account dialog with platform choice, identity fields and the truthful collector-increment note. |
| [after-first-account.png](after-first-account.png) | A real account in `setup_required` state, with unknown metrics kept distinct from zero. |
| [after-overview.png](after-overview.png) | After: redesigned overview with KPI band, per-account cards, follower dot pool and platform distribution. |
| [after-timeline.png](after-timeline.png) | The same overview scrolled to the 15-day Video/Print publishing timeline. |
| [after-overview-full.png](after-overview-full.png) | Full-height overview including Community growth, timeline and footer. |
| [after-overview-dark.png](after-overview-dark.png) | Overview in dark mode, including chart-specific colour tokens. |
| [after-account-detail.png](after-account-detail.png) | Detailed per-account drawer: identity, freshness, metric metadata, history and content. |
| [after-planner.png](after-planner.png) | Content planner list, filters, tag catalogue and status legend. |
| [after-plan-dialog.png](after-plan-dialog.png) | Plan editor with content defaults, account targets, tags and publication links. |
| [after-merge-dialog.png](after-merge-dialog.png) | Account-keyed merge editor with one post per account. |
| [after-community.png](after-community.png) | Community monitor: status, catalogue counts, growth and worker health. |
| [after-settings.png](after-settings.png) | Local data, Community endpoint, sync, media paths, accounts and demo controls. |
| [after-about.png](after-about.png) | About, to-dos, changelog, roadmap and data directory. |

## Capture method

- New app: Vite renderer against the demo API; screenshots taken with a Chromium browser at
  1440×940.
- Old app: the actual `creator-center-old/frontend` production build served by a local mock API
  that returns the old dashboard/planner shape. This is a real application capture, not a
  mockup; the fixture data is labelled in the PR and implementation notes.
- The old screenshot includes the old app's five platform cards; the new app shows six accounts
  because it demonstrates multiple accounts on 抖音 (D1).
