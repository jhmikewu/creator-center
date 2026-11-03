import { describe, expect, it } from 'vitest';
import { postTitle, stripHashtags } from './titles.js';
import type { Post } from './types.js';

describe('title display', () => {
  it('removes hashtags from collected titles', () => {
    expect(stripHashtags('BPhO 2024 #bpho #BPhO')).toBe('BPhO 2024');
    expect(stripHashtags('#AS物理 题目讲解')).toBe('题目讲解');
    expect(stripHashtags('题目#AS物理')).toBe('题目');
    expect(stripHashtags('Moment of inertia #AS物理.')).toBe('Moment of inertia.');
    expect(stripHashtags('Physics #AS物理，mechanics')).toBe('Physics，mechanics');
  });

  it('keeps hash characters that are part of real text', () => {
    expect(stripHashtags('C# and F# in the physics toolchain')).toBe(
      'C# and F# in the physics toolchain',
    );
  });

  it('falls back when a title is only tags', () => {
    expect(stripHashtags('讲解 #只 #标签')).toBe('讲解');
    expect(stripHashtags('#AS物理')).toBe('');
    expect(postTitle({ title: ' #AS物理 ' } as Pick<Post, 'title'>)).toBe('Untitled post');
  });
});
