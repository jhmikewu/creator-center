import type { Platform } from '@creator-center/shared';

export interface PlatformLinks {
  studioUrl: string;
  loginUrl: string;
  profileTemplate: string | null;
}

export const PLATFORM_LINKS: Record<Platform, PlatformLinks> = {
  douyin: {
    studioUrl: 'https://creator.douyin.com/creator-micro/home',
    loginUrl: 'https://creator.douyin.com/',
    profileTemplate: null,
  },
  xiaohongshu: {
    studioUrl: 'https://creator.xiaohongshu.com/creator/home',
    loginUrl: 'https://creator.xiaohongshu.com/login',
    profileTemplate: null,
  },
  wechat: {
    studioUrl: 'https://mp.weixin.qq.com/',
    loginUrl: 'https://mp.weixin.qq.com/',
    profileTemplate: null,
  },
  bilibili: {
    studioUrl: 'https://member.bilibili.com/platform/home',
    loginUrl: 'https://passport.bilibili.com/login',
    profileTemplate: null,
  },
  youtube: {
    studioUrl: 'https://studio.youtube.com/',
    loginUrl: 'https://accounts.google.com/',
    profileTemplate: 'https://www.youtube.com/@',
  },
};

export function profileUrlFor(platform: Platform, handle: string | null): string | null {
  if (!handle) return null;
  const clean = handle.replace(/^@/, '').trim();
  if (!clean) return null;
  const template = PLATFORM_LINKS[platform].profileTemplate;
  return template ? `${template}${encodeURIComponent(clean)}` : null;
}
