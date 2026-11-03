/**
 * Tag normalisation, including the exam aliases the owner uses. The rules are
 * ported from the old app so the tag catalogue survives the redesign.
 */

const EXAM_ALIASES: Record<string, string> = {
  as: 'as',
  a2: 'a2',
  al: 'a-level',
  alevel: 'a-level',
  ap: 'ap',
  bpho: 'bpho',
  physicsbowl: 'physicsbowl',
};

export const EXAM_TAG_CHOICES: { tag: string; label: string; hint: string }[] = [
  { tag: 'as', label: 'AS', hint: 'AS Level' },
  { tag: 'a2', label: 'A2', hint: 'A2 Level' },
  { tag: 'a-level', label: 'A-Level', hint: 'A Level / AL' },
  { tag: 'ap', label: 'AP', hint: 'Advanced Placement' },
  { tag: 'bpho', label: 'BPhO', hint: 'British Physics Olympiad' },
  { tag: 'physicsbowl', label: 'PhysicsBowl', hint: 'PhysicsBowl' },
];

const TAG_CHAR = /[\p{L}\p{N}_-]/u;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;

function stripSeparators(value: string): string {
  return value.replace(/[-_\s]/g, '');
}

export class TagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TagError';
  }
}

export function canonicalTag(input: string): string {
  if (typeof input !== 'string') throw new TagError('Tags must be text.');
  const value = input
    .normalize('NFC')
    .trim()
    .replace(/^#+/, '')
    .toLocaleLowerCase('en-US');
  const exam = EXAM_ALIASES[stripSeparators(value)];
  if (exam) return exam;
  if (!value || [...value].length > 48) {
    throw new TagError('Use tags of 1–48 letters, numbers, underscores or hyphens.');
  }
  for (const character of value) {
    if (character !== '_' && character !== '-' && !TAG_CHAR.test(character)) {
      throw new TagError('Use tags of 1–48 letters, numbers, underscores or hyphens.');
    }
  }
  return value;
}

export function isCanonicalTag(value: string): boolean {
  try {
    return canonicalTag(value) === value;
  } catch {
    return false;
  }
}

export function canonicalTags(inputs: readonly string[]): string[] {
  const result: string[] = [];
  for (const input of inputs) {
    try {
      const tag = canonicalTag(input);
      if (!result.includes(tag)) result.push(tag);
    } catch {
      // Ignore invalid typed tags rather than losing the whole plan.
    }
  }
  return result;
}

export function tagsFromNotes(notes: string): string[] {
  const normalized = notes.normalize('NFC');
  const urls: [number, number][] = [];
  for (const match of normalized.matchAll(URL_PATTERN)) {
    urls.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
  }
  const tags: string[] = [];
  const pattern = /(?<![\w#])#([\p{L}\p{N}_-]+(?:[ ]+[\p{L}\p{N}_-]+)?)/gu;
  for (const match of normalized.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (urls.some(([from, to]) => start >= from && start < to)) continue;
    const matched = match[1] ?? '';
    const candidates = [matched, ...matched.split(/\s+/)].filter(Boolean);
    for (const candidate of candidates) {
      try {
        const tag = canonicalTag(candidate);
        if (!tags.includes(tag)) tags.push(tag);
        if (tag) break;
      } catch {
        // "A Level" first tries the joined phrase, then "A" and "Level" separately.
      }
    }
  }
  return tags;
}

export function mergeTags(tags: readonly string[], notes: string): string[] {
  return canonicalTags([...tags, ...tagsFromNotes(notes)]);
}

export function tagSuggestions(existing: readonly string[], notes: string): string[] {
  const candidate = new Set([...EXAM_TAG_CHOICES.map((entry) => entry.tag), ...existing]);
  const detected = new Set(tagsFromNotes(notes));
  return [...candidate].filter((tag) => !detected.has(tag)).sort((left, right) => {
    const leftExam = EXAM_TAG_CHOICES.findIndex((entry) => entry.tag === left);
    const rightExam = EXAM_TAG_CHOICES.findIndex((entry) => entry.tag === right);
    if (leftExam !== -1 || rightExam !== -1) {
      return (leftExam === -1 ? 99 : leftExam) - (rightExam === -1 ? 99 : rightExam);
    }
    return left.localeCompare(right);
  });
}

export function examTagLabel(tag: string): string | null {
  return EXAM_TAG_CHOICES.find((entry) => entry.tag === tag)?.label ?? null;
}
