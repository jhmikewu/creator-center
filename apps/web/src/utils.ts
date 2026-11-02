import { PLATFORMS, type Account, type Platform } from '@creator-center/shared';

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('');
}

export function platformLabel(platform: Platform): string {
  return PLATFORMS[platform].label;
}

export function accountLabel(account: Account | undefined): string {
  if (!account) return 'Unknown account';
  return `${account.displayName} · ${platformLabel(account.platform)}`;
}

export function accountInitials(account: Account): string {
  if (account.avatarUrl) return initials(account.displayName);
  return initials(account.displayName) || platformLabel(account.platform).slice(0, 1);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

export function downloadText(filename: string, content: string, type = 'application/json'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function isMac(): boolean {
  return navigator.platform.toLowerCase().includes('mac');
}

export function openExternal(url: string): void {
  const desktop = (window as unknown as { creatorCenter?: { openExternal?: (value: string) => void } })
    .creatorCenter;
  if (desktop?.openExternal) desktop.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export function storageGet<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function storageSet(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage can be unavailable in hardened contexts; the app still works.
  }
}


/** Brand colours stay on the marks; charts use tokens that stay visible in both themes. */
export const PLATFORM_CHART_COLORS: Record<Platform, string> = {
  douyin: 'var(--chart-douyin)',
  xiaohongshu: 'var(--chart-xiaohongshu)',
  wechat: 'var(--chart-wechat)',
  bilibili: 'var(--chart-bilibili)',
  youtube: 'var(--chart-youtube)',
};
