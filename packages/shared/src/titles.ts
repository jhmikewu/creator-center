import type { Post } from './types.js';

/**
 * Hashtags are collection metadata on several platforms (抖音 titles commonly
 * carry tags such as `#AS物理`). UI copy shows the human title only, so tags
 * are stripped at render time and the stored value stays untouched.
 *
 * A tag is stripped wherever it starts, including glued to the previous word
 * ("manipulation#alevel物理"). A lone hash with no tag body, as in "C# and F#",
 * is not a tag and stays.
 */
const HASHTAG = /#[\p{L}\p{N}_]+/gu;

export function stripHashtags(value: string): string {
  return value
    .replace(HASHTAG, ' ')
    .replace(/\s+([,.;:!?，。；：！？、])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function postTitle(post: Pick<Post, 'title'>): string {
  return stripHashtags(post.title) || 'Untitled post';
}
