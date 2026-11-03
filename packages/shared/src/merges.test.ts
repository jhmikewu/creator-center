import { describe, expect, it } from 'vitest';
import { MergeValidationError, validateMergeInput } from './merges.js';
import type { Account, Metric, Post } from './types.js';

const today = '2026-11-03';

function makeAccount(id: string, platform: Account['platform'], displayName: string): Account {
  const metrics: Metric[] = [];
  return {
    id,
    platform,
    displayName,
    handle: displayName.toLowerCase().replace(/\s+/g, ''),
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

const douyin = makeAccount('dy-main', 'douyin', 'Liam Physics');
const xhs = makeAccount('xhs', 'xiaohongshu', 'Liam Notes');
const bili = makeAccount('bili', 'bilibili', 'Liam Bilibili');

function makePost(id: string, account: Account): Post {
  return {
    id,
    accountId: account.id,
    platform: account.platform,
    remoteId: id,
    title: `Post ${id}`,
    url: '',
    format: 'video',
    status: 'published',
    publishedAt: `${today}T02:00:00.000Z`,
    scheduledAt: null,
    metrics: { views: 100, likes: 10 },
    collectedAt: `${today}T00:00:00.000Z`,
  };
}

describe('merge validation', () => {
  const posts = [makePost('one', douyin), makePost('two', xhs), makePost('three', bili)];

  it('accepts one post per account and rejects duplicate accounts', () => {
    const input = validateMergeInput(
      {
        members: [
          { accountId: douyin.id, postId: 'one' },
          { accountId: xhs.id, postId: 'two' },
        ],
        customTitle: 'Same content',
      },
      posts,
      [douyin, xhs, bili],
    );
    expect(input.members).toHaveLength(2);
    expect(() =>
      validateMergeInput(
        {
          members: [
            { accountId: douyin.id, postId: 'one' },
            { accountId: douyin.id, postId: 'one' },
          ],
        },
        posts,
        [douyin, xhs],
      ),
    ).toThrow(MergeValidationError);
  });

  it('rejects fewer than two and more than five members', () => {
    expect(() =>
      validateMergeInput({ members: [{ accountId: douyin.id, postId: 'one' }] }, posts, [douyin]),
    ).toThrow(MergeValidationError);
  });
});
