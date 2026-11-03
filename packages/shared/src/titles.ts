import type { Post } from './types.js';

/**
 * Hashtags are collection metadata on several platforms (抖音 titles commonly
 * carry tags such as `#AS物理`). UI copy shows the human title only, so tags
 * are stripped at render time and the stored value stays untouched.
 *
 * The lookbehind keeps real text such as `C#` or `F#` intact when the hash is
 * glued to an ASCII letter.
 */
const HASHTAG = /(?<![A-Za-z])#[\p{L}\p{N}_]+/gu;

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
