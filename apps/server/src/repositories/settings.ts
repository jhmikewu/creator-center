import path from 'node:path';
import type { AppSettings } from '@creator-center/shared';
import type { DB } from '../db.js';

const VALID_KEYS: (keyof AppSettings)[] = [
  'dataDir',
  'communityEndpoint',
  'communityEnabled',
  'theme',
  'fontScale',
  'demoMode',
  'accountOrder',
  'mediaInbox',
  'mediaOutput',
  'mediaArchive',
  'mediaRoot',
  'externalWorkerUrl',
  'firstRunCompleted',
];

export function getSettings(db: DB, dataDir: string): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const values = new Map<string, unknown>();
  for (const row of rows) {
    try {
      values.set(row.key, JSON.parse(row.value));
    } catch {
      values.set(row.key, row.value);
    }
  }
  return {
    dataDir,
    communityEndpoint: stringValue(values.get('communityEndpoint'), ''),
    communityEnabled: booleanValue(values.get('communityEnabled'), true),
    theme: values.get('theme') === 'light' || values.get('theme') === 'dark' ? values.get('theme') as 'light' | 'dark' : 'system',
    fontScale: numberValue(values.get('fontScale'), 1.12, 0.9, 1.4),
    demoMode: booleanValue(values.get('demoMode'), false),
    accountOrder: Array.isArray(values.get('accountOrder'))
      ? (values.get('accountOrder') as unknown[]).filter((item): item is string => typeof item === 'string')
      : [],
    mediaInbox: nullableString(values.get('mediaInbox')),
    mediaOutput: nullableString(values.get('mediaOutput')),
    mediaArchive: nullableString(values.get('mediaArchive')),
    mediaRoot: nullableString(values.get('mediaRoot')) ?? path.join(dataDir, 'media'),
    externalWorkerUrl: nullableString(values.get('externalWorkerUrl')),
    firstRunCompleted: booleanValue(values.get('firstRunCompleted'), false),
  };
}

export function updateSettings(db: DB, patch: Partial<AppSettings>): void {
  const allowed = new Set<string>((VALID_KEYS as readonly string[]).filter((key) => key !== 'dataDir'));
  const statement = db.prepare(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  );
  const run = db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key) || value === undefined) continue;
      statement.run(key, JSON.stringify(value));
    }
  });
  run();
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
