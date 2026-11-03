import type { Capabilities, MetricKey, Platform, PlatformInfo } from './types.js';

const BROWSER_READ: Capabilities = {
  readMetrics: true,
  readContent: true,
  readScheduled: true,
  write: false,
};

export const PLATFORMS: Record<Platform, PlatformInfo> = {
  douyin: {
    key: 'douyin',
    label: '抖音',
    shortLabel: 'Douyin',
    region: 'china',
    color: '#161823',
    tint: '#f2f2f4',
    access: 'Signed-in creator console',
    capabilities: BROWSER_READ,
    unsupportedMetrics: ['watch_hours'],
    defaultPostFormat: 'video',
  },
  xiaohongshu: {
    key: 'xiaohongshu',
    label: '小红书',
    shortLabel: 'Xiaohongshu',
    region: 'china',
    color: '#e4293a',
    tint: '#fdeff0',
    access: 'Signed-in creator console',
    capabilities: BROWSER_READ,
    unsupportedMetrics: ['watch_hours', 'avg_view_seconds', 'completion_rate'],
    defaultPostFormat: 'print',
  },
  wechat: {
    key: 'wechat',
    label: '公众号',
    shortLabel: 'WeChat',
    region: 'china',
    color: '#0f9d58',
    tint: '#eaf7f0',
    access: 'Signed-in console pages',
    capabilities: BROWSER_READ,
    unsupportedMetrics: [
      'following',
      'likes',
      'comments',
      'saves',
      'watch_hours',
      'avg_view_seconds',
      'completion_rate',
    ],
    defaultPostFormat: 'print',
  },
  bilibili: {
    key: 'bilibili',
    label: 'Bilibili',
    shortLabel: 'Bilibili',
    region: 'china',
    color: '#00a1d6',
    tint: '#e9f7fc',
    access: 'Signed-in creator console',
    capabilities: BROWSER_READ,
    unsupportedMetrics: ['following', 'watch_hours'],
    defaultPostFormat: 'video',
  },
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    shortLabel: 'YouTube',
    region: 'international',
    color: '#e5484d',
    tint: '#fdeeee',
    access: 'Official Data and Analytics APIs',
    capabilities: BROWSER_READ,
    unsupportedMetrics: ['following', 'saves'],
    defaultPostFormat: 'video',
  },
};

export const PLATFORM_ORDER: readonly Platform[] = [
  'douyin',
  'xiaohongshu',
  'wechat',
  'bilibili',
  'youtube',
];

export const PLATFORM_KEYS = PLATFORM_ORDER;

/** Platforms the app offers while a collector is disabled. */
export const ENABLED_PLATFORMS: readonly Platform[] = PLATFORM_ORDER.filter(
  (platform) => platform !== 'youtube',
);
export const PLATFORM_LABELS: Record<Platform, string> = Object.fromEntries(
  PLATFORM_ORDER.map((key) => [key, PLATFORMS[key].label]),
) as Record<Platform, string>;

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORM_ORDER as readonly string[]).includes(value);
}

export function platformInfo(platform: Platform): PlatformInfo {
  return PLATFORMS[platform];
}

export function isMetricUnsupported(platform: Platform, key: MetricKey): boolean {
  return PLATFORMS[platform].unsupportedMetrics.includes(key);
}

export function capabilityLabel(platform: Platform): string {
  const info = PLATFORMS[platform];
  if (info.capabilities.write) return 'Read & write';
  return 'Read only';
}
