import type { Merge, Post } from './types.js';

export class MergeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergeValidationError';
  }
}

export interface MergeInput {
  members: { accountId: string; postId: string }[];
  titleFrom: { accountId: string; postId: string } | null;
  customTitle: string;
}

export function validateMergeInput(
  input: unknown,
  posts: readonly Post[],
  accounts: readonly { id: string; platform: string }[],
): MergeInput {
  if (!input || typeof input !== 'object') throw new MergeValidationError('A merge needs members.');
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.members)) throw new MergeValidationError('A merge needs 2–5 posts.');
  if (raw.members.length < 2 || raw.members.length > 5) {
    throw new MergeValidationError('Merge 2–5 published posts.');
  }
  const members: { accountId: string; postId: string }[] = [];
  const seenAccounts = new Set<string>();
  for (const item of raw.members) {
    if (!item || typeof item !== 'object') throw new MergeValidationError('A merge member is invalid.');
    const entry = item as Record<string, unknown>;
    if (typeof entry.accountId !== 'string' || typeof entry.postId !== 'string') {
      throw new MergeValidationError('A merge member needs an account and a post.');
    }
    const account = accounts.find((candidate) => candidate.id === entry.accountId);
    const post = posts.find(
      (candidate) => candidate.id === entry.postId && candidate.accountId === entry.accountId,
    );
    if (!account || !post) throw new MergeValidationError('A merge member is not a collected post.');
    if (seenAccounts.has(entry.accountId)) {
      throw new MergeValidationError('Merge at most one post per account.');
    }
    seenAccounts.add(entry.accountId);
    members.push({ accountId: entry.accountId, postId: entry.postId });
  }
  let titleFrom: { accountId: string; postId: string } | null = null;
  if (raw.titleFrom && typeof raw.titleFrom === 'object') {
    const entry = raw.titleFrom as Record<string, unknown>;
    if (typeof entry.accountId === 'string' && typeof entry.postId === 'string') {
      if (!members.some((member) => member.accountId === entry.accountId && member.postId === entry.postId)) {
        throw new MergeValidationError('The title must come from one of the merged posts.');
      }
      titleFrom = { accountId: entry.accountId, postId: entry.postId };
    }
  }
  const customTitle = typeof raw.customTitle === 'string' ? raw.customTitle.trim() : '';
  if (customTitle.length > 200) throw new MergeValidationError('Keep the merged title under 200 characters.');
  if (customTitle) titleFrom = null;
  return { members, titleFrom, customTitle };
}

export function mergeTitle(merge: Merge, posts: readonly Post[]): string {
  if (merge.customTitle) return merge.customTitle;
  const picked = merge.titleFrom
    ? posts.find(
        (post) => post.id === merge.titleFrom?.postId && post.accountId === merge.titleFrom?.accountId,
      )
    : undefined;
  return picked?.title || merge.members.find((member) => member.title)?.title || 'Untitled post';
}
