import { canonicalTags, mergeTags, TagError } from './tags.js';
import { isValidDay } from './time.js';
import type {
  Account,
  ContentType,
  Format,
  Plan,
  PlanDraft,
  PlanTarget,
  Platform,
} from './types.js';
import { PLATFORM_KEYS, isPlatform } from './platforms.js';

export interface ContentTypeInfo {
  key: ContentType;
  label: string;
  description: string;
  shortLabel: string;
  defaultPlatforms: readonly Platform[];
  defaultFormat: Format;
}

export const CONTENT_TYPES: readonly ContentTypeInfo[] = [
  {
    key: 'paper_walkthrough',
    label: 'Paper walkthrough',
    shortLabel: 'Paper walkthrough',
    description: 'A worked exam paper, usually a long video.',
    defaultPlatforms: ['bilibili', 'youtube'],
    defaultFormat: 'video',
  },
  {
    key: 'short_lecture',
    label: 'Short lecture',
    shortLabel: 'Short lecture',
    description: 'A focused explanation of one topic.',
    defaultPlatforms: ['bilibili', 'youtube'],
    defaultFormat: 'video',
  },
  {
    key: 'question_video',
    label: 'Question video',
    shortLabel: 'Question video',
    description: 'One question solved for a short-form feed.',
    defaultPlatforms: ['douyin', 'xiaohongshu'],
    defaultFormat: 'video',
  },
  {
    key: 'text_guide',
    label: 'Text / image guide',
    shortLabel: 'Text guide',
    description: 'A written guide or set of teaching cards.',
    defaultPlatforms: ['xiaohongshu'],
    defaultFormat: 'print',
  },
  {
    key: 'exam_info',
    label: 'Exam / competition info',
    shortLabel: 'Exam info',
    description: 'Deadlines, syllabus news and competition notes.',
    defaultPlatforms: ['xiaohongshu'],
    defaultFormat: 'print',
  },
];

export const CONTENT_TYPE_MAP: Record<ContentType, ContentTypeInfo> = Object.fromEntries(
  CONTENT_TYPES.map((entry) => [entry.key, entry]),
) as Record<ContentType, ContentTypeInfo>;

export const CONTENT_PLATFORMS: Record<ContentType, readonly Platform[]> = Object.fromEntries(
  CONTENT_TYPES.map((entry) => [entry.key, entry.defaultPlatforms]),
) as Record<ContentType, readonly Platform[]>;

export function isContentType(value: unknown): value is ContentType {
  return typeof value === 'string' && value in CONTENT_TYPE_MAP;
}

export function isFormat(value: unknown): value is Format {
  return value === 'video' || value === 'print';
}

export function defaultPlanFormat(content: ContentType): Format {
  return content === 'text_guide' ? 'print' : 'video';
}

export function targetKey(target: Pick<PlanTarget, 'platform' | 'accountId'>): string {
  return `${target.platform}:${target.accountId ?? '*'}`;
}

export function defaultTargets(content: ContentType): PlanTarget[] {
  return CONTENT_PLATFORMS[content].map((platform) => ({ platform, accountId: null }));
}

export function newPlanDraft(
  accounts: readonly Account[],
  options: { date?: string | null; format?: Format; platform?: Platform; accountId?: string | null } = {},
): PlanDraft {
  const content: ContentType = options.format === 'print' ? 'text_guide' : 'paper_walkthrough';
  const platforms = options.platform ? [options.platform] : [...CONTENT_PLATFORMS[content]];
  const accountId =
    options.accountId &&
    accounts.some((account) => account.id === options.accountId && account.platform === platforms[0])
      ? options.accountId
      : null;
  return {
    title: '',
    notes: '',
    contentType: content,
    format: options.format ?? defaultPlanFormat(content),
    targets: platforms.map((platform) => ({
      platform,
      accountId: platform === platforms[0] ? accountId : null,
    })),
    tags: [],
    scheduledFor: options.date ?? null,
    publications: [],
  };
}

/**
 * Content type drives defaults, but only when the reader has not overridden
 * them. The UI calls this when the content select changes.
 */
export function applyContentDefaults(
  draft: PlanDraft,
  content: ContentType,
  keepTargets = false,
): PlanDraft {
  return {
    ...draft,
    contentType: content,
    format: defaultPlanFormat(content),
    targets: keepTargets && draft.targets.length ? draft.targets : defaultTargets(content),
    publications: keepTargets ? draft.publications : [],
  };
}

export function resolveTargetAccounts(
  targets: readonly PlanTarget[],
  accounts: readonly Account[],
): { target: PlanTarget; account: Account }[] {
  const resolved: { target: PlanTarget; account: Account }[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    const candidates = target.accountId
      ? accounts.filter((account) => account.id === target.accountId && account.platform === target.platform)
      : accounts.filter((account) => account.platform === target.platform);
    for (const account of candidates) {
      if (seen.has(account.id)) continue;
      seen.add(account.id);
      resolved.push({ target, account });
    }
  }
  return resolved;
}

export class PlanValidationError extends Error {
  fields: Record<string, string>;
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'PlanValidationError';
    this.fields = fields;
  }
}

export interface NormalizedPlanDraft extends PlanDraft {
  tags: string[];
}

export function normalizePlanDraft(input: unknown, accounts: readonly Account[]): NormalizedPlanDraft {
  const fields: Record<string, string> = {};
  if (!input || typeof input !== 'object') throw new PlanValidationError('A plan payload is required.');
  const raw = input as Record<string, unknown>;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) fields.title = 'Give the plan a title.';
  if (title.length > 200) fields.title = 'Keep the title under 200 characters.';
  const notes = typeof raw.notes === 'string' ? raw.notes : '';
  if (notes.length > 20_000) fields.notes = 'Notes are limited to 20,000 characters.';
  const contentType = raw.contentType ?? raw.content;
  if (!isContentType(contentType)) fields.contentType = 'Choose a content type.';
  const format = raw.format ?? (isContentType(contentType) ? defaultPlanFormat(contentType) : 'video');
  if (!isFormat(format)) fields.format = 'Choose video or print.';

  let targets: PlanTarget[] = [];
  if (Array.isArray(raw.targets)) {
    const seen = new Set<string>();
    for (const item of raw.targets) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      if (!isPlatform(entry.platform)) {
        fields.targets = 'Every target needs a known platform.';
        continue;
      }
      const platform = entry.platform;
      let accountId: string | null = typeof entry.accountId === 'string' && entry.accountId ? entry.accountId : null;
      if (accountId) {
        const account = accounts.find((candidate) => candidate.id === accountId);
        if (!account || account.platform !== platform) {
          fields.targets = 'A target account must belong to its platform.';
          accountId = null;
        }
      }
      const key = `${platform}:${accountId ?? '*'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ platform, accountId });
    }
  } else if (Array.isArray(raw.platforms)) {
    targets = (raw.platforms as unknown[])
      .filter(isPlatform)
      .filter((platform, index, list) => list.indexOf(platform) === index)
      .map((platform) => ({ platform, accountId: null }));
  }
  if (!targets.length) fields.targets = 'Choose at least one account or platform.';

  let scheduledFor: string | null = null;
  if (raw.scheduledFor !== null && raw.scheduledFor !== undefined && raw.scheduledFor !== '') {
    if (typeof raw.scheduledFor !== 'string' || !isValidDay(raw.scheduledFor)) {
      fields.scheduledFor = 'Choose a calendar date in YYYY-MM-DD format.';
    } else {
      scheduledFor = raw.scheduledFor;
    }
  }

  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    try {
      tags = canonicalTags(raw.tags.filter((tag): tag is string => typeof tag === 'string'));
    } catch (error) {
      if (error instanceof TagError) fields.tags = error.message;
    }
  }
  tags = mergeTags(tags, notes);
  if (tags.length > 30) fields.tags = 'Choose at most 30 tags, including hashtags in notes.';

  const resolved = resolveTargetAccounts(targets, accounts);
  const targetAccountIds = new Set(resolved.map(({ account }) => account.id));
  const publications: { accountId: string; postId: string }[] = [];
  if (Array.isArray(raw.publications)) {
    for (const item of raw.publications) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      if (typeof entry.accountId !== 'string' || typeof entry.postId !== 'string') continue;
      if (!targetAccountIds.has(entry.accountId) || !entry.postId) continue;
      if (publications.some((link) => link.accountId === entry.accountId)) continue;
      publications.push({ accountId: entry.accountId, postId: entry.postId });
    }
  } else if (raw.publications && typeof raw.publications === 'object') {
    for (const [accountId, postId] of Object.entries(raw.publications)) {
      if (typeof postId === 'string' && targetAccountIds.has(accountId)) {
        publications.push({ accountId, postId });
      }
    }
  }

  if (Object.keys(fields).length) {
    const first = Object.values(fields)[0] ?? 'Check the plan.';
    throw new PlanValidationError(first, fields);
  }

  return {
    title,
    notes,
    contentType: contentType as ContentType,
    format: format as Format,
    targets,
    tags,
    scheduledFor,
    publications,
  };
}

export function planTargetAccountIds(plan: Plan, accounts: readonly Account[]): string[] {
  return resolveTargetAccounts(plan.targets, accounts).map(({ account }) => account.id);
}

export function targetSummary(targets: readonly PlanTarget[], accounts: readonly Account[]): string[] {
  const resolved = resolveTargetAccounts(targets, accounts);
  return resolved.map(({ account }) => account.displayName);
}

export function planPlatforms(plan: Pick<Plan, 'targets'>): Platform[] {
  const seen: Platform[] = [];
  for (const target of plan.targets) if (!seen.includes(target.platform)) seen.push(target.platform);
  return PLATFORM_KEYS.filter((platform) => seen.includes(platform));
}
