import { describe, expect, it } from 'vitest';
import { canonicalTag, canonicalTags, isCanonicalTag, tagsFromNotes } from './tags.js';

describe('tag normalisation', () => {
  it('lowercases and normalises Unicode tags', () => {
    expect(canonicalTag('#Quantum')).toBe('quantum');
    expect(canonicalTag('  #量子力学  ')).toBe('量子力学');
    expect(canonicalTag('as-level')).toBe('as-level');
  });

  it('collapses every exam alias to one canonical tag', () => {
    expect(canonicalTag('AL')).toBe('a-level');
    expect(canonicalTag('alevel')).toBe('a-level');
    expect(canonicalTag('A Level')).toBe('a-level');
    expect(canonicalTag('a-level')).toBe('a-level');
    expect(canonicalTag('AS')).toBe('as');
    expect(canonicalTag('A2')).toBe('a2');
    expect(canonicalTag('AP')).toBe('ap');
    expect(canonicalTag('BPhO')).toBe('bpho');
    expect(canonicalTag('Physics Bowl')).toBe('physicsbowl');
  });

  it('rejects spaces, punctuation and over-long tags', () => {
    expect(() => canonicalTag('two words')).toThrow();
    expect(() => canonicalTag('punct!')).toThrow();
    expect(() => canonicalTag('x'.repeat(49))).toThrow();
    expect(() => canonicalTag('')).toThrow();
  });

  it('removes duplicate canonical values while preserving order', () => {
    expect(canonicalTags(['AL', 'a-level', 'quantum', 'Quantum'])).toEqual(['a-level', 'quantum']);
  });

  it('extracts hashtags and ignores URL fragments', () => {
    const tags = tagsFromNotes(
      'A paper walkthrough #bpho #AL #A Level https://example.com/page#notatag #量子力学',
    );
    expect(tags).toContain('bpho');
    expect(tags).toContain('a-level');
    expect(tags).toContain('量子力学');
    expect(tags).not.toContain('notatag');
  });

  it('only detects known exam aliases when the phrase is joined', () => {
    expect(tagsFromNotes('use #as and #ap here')).toEqual(['as', 'ap']);
    expect(tagsFromNotes('a normal sentence without a note tag')).toEqual([]);
  });

  it('identifies canonical tags', () => {
    expect(isCanonicalTag('a-level')).toBe(true);
    expect(isCanonicalTag('AL')).toBe(false);
  });
});
