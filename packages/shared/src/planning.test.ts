import { describe, expect, it } from 'vitest';
import type { Account, Metric } from './types.js';
import {
  PlanValidationError,
  applyContentDefaults,
  defaultPlanFormat,
  newPlanDraft,
  normalizePlanDraft,
  resolveTargetAccounts,
} from './planning.js';

function account(id: string, platform: Account['platform'], displayName: string): Account {
  const metrics: Metric[] = [];
  return {
    id,
    platform,
    displayName,
    handle: null,
    avatarUrl: null,
    profileUrl: null,
    studioUrl: null,
    status: 'connected',
    statusDetail: '',
    analyticsStatus: 'ready',
    analyticsDetail: '',
    contentStatus: 'ready',
    contentDetail: '',
    lastAttemptAt: null,
    lastSuccessAt: null,
    stale: false,
    capturedAt: null,
    isDemo: true,
    metrics,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

const accounts = [
  account('dy-main', 'douyin', 'Liam Physics'),
  account('dy-shorts', 'douyin', 'Liam Shorts'),
  account('xhs', 'xiaohongshu', 'Liam Notes'),
  account('bili', 'bilibili', 'Liam Bilibili'),
  account('yt', 'youtube', 'Liam YouTube'),
];

describe('content type defaults', () => {
  it('maps content types to formats and channels', () => {
    expect(defaultPlanFormat('text_guide')).toBe('print');
    expect(defaultPlanFormat('paper_walkthrough')).toBe('video');
    const paper = newPlanDraft(accounts);
    expect(paper.contentType).toBe('paper_walkthrough');
    expect(paper.format).toBe('video');
    expect(paper.targets).toEqual([
      { platform: 'bilibili', accountId: null },
      { platform: 'youtube', accountId: null },
    ]);
  });

  it('keeps the selected account when a plan starts from an account view', () => {
    const draft = newPlanDraft(accounts, { platform: 'douyin', accountId: 'dy-shorts' });
    expect(draft.targets).toEqual([{ platform: 'douyin', accountId: 'dy-shorts' }]);
  });

  it('applies new defaults while allowing a later override', () => {
    const draft = applyContentDefaults(newPlanDraft(accounts), 'text_guide');
    expect(draft.format).toBe('print');
    expect(draft.targets).toEqual([{ platform: 'xiaohongshu', accountId: null }]);
    const overridden = { ...draft, targets: [{ platform: 'wechat' as const, accountId: null }] };
    expect(overridden.targets[0]?.platform).toBe('wechat');
  });

  it('resolves platform-level targets to every current account', () => {
    const resolved = resolveTargetAccounts(
      [
        { platform: 'douyin', accountId: null },
        { platform: 'youtube', accountId: 'yt' },
      ],
      accounts,
    );
    expect(resolved.map((entry) => entry.account.id)).toEqual(['dy-main', 'dy-shorts', 'yt']);
  });

  it('does not resolve an account on the wrong platform', () => {
    const resolved = resolveTargetAccounts([{ platform: 'bilibili', accountId: 'dy-main' }], accounts);
    expect(resolved).toEqual([]);
  });
});

describe('plan validation', () => {
  it('normalises notes hashtags and targets', () => {
    const plan = normalizePlanDraft(
      {
        title: '  A worked paper  ',
        notes: 'Use #BPhO and #AL tags.',
        contentType: 'paper_walkthrough',
        format: 'video',
        targets: [
          { platform: 'douyin', accountId: null },
          { platform: 'youtube', accountId: 'yt' },
        ],
        tags: ['mechanics', 'AL'],
        scheduledFor: '2026-11-10',
      },
      accounts,
    );
    expect(plan.title).toBe('A worked paper');
    expect(plan.tags).toEqual(['mechanics', 'a-level', 'bpho']);
    expect(plan.targets).toHaveLength(2);
  });

  it('drops publication links that do not belong to a selected account', () => {
    const plan = normalizePlanDraft(
      {
        title: 'Plan',
        contentType: 'short_lecture',
        targets: [{ platform: 'douyin', accountId: 'dy-main' }],
        publications: [
          { accountId: 'dy-main', postId: 'post-1' },
          { accountId: 'yt', postId: 'post-2' },
        ],
      },
      accounts,
    );
    expect(plan.publications).toEqual([{ accountId: 'dy-main', postId: 'post-1' }]);
  });

  it('reports field errors for an invalid draft', () => {
    let failure: PlanValidationError | null = null;
    try {
      normalizePlanDraft(
        {
          title: '',
          contentType: 'not-real',
          targets: [],
          scheduledFor: '10/11/2026',
        },
        accounts,
      );
    } catch (error) {
      failure = error as PlanValidationError;
    }
    expect(failure).toBeInstanceOf(PlanValidationError);
    expect(Object.keys(failure?.fields ?? {})).toEqual(
      expect.arrayContaining(['title', 'contentType', 'targets', 'scheduledFor']),
    );
  });

  it('accepts a plan with no date as an idea', () => {
    const plan = normalizePlanDraft(
      {
        title: 'An idea',
        contentType: 'exam_info',
        targets: [{ platform: 'xiaohongshu', accountId: null }],
      },
      accounts,
    );
    expect(plan.scheduledFor).toBeNull();
  });
});
