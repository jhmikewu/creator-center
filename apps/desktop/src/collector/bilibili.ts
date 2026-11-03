import type { BrowserCapture, CollectorResponse } from '@creator-center/shared';
import { CollectorPage, accountPartition, hasSessionCookies, withTimeout } from './page.js';

const HOME = 'https://member.bilibili.com/platform/home';
const FANS = 'https://member.bilibili.com/platform/fans/manage';
const MANAGER = 'https://member.bilibili.com/platform/upload-manager/article';
const DATA_CENTER = 'https://member.bilibili.com/platform/data-up/video/';
const NAV = /\/x\/web-interface\/nav/;
const INDEX = /\/x\/web\/data\/index\/stat/;
const FANS_BODY = /\/x\/relation\/followers/;
const POSTS = /\/x\/web\/archives/;
const OVERVIEW = /\/x\/web\/data\/v2\/overview\/stat\/num/;
const HOSTS = /^https:\/\/(?:api|member)\.bilibili\.com\//;

/**
 * Read-only walk of the signed-in Bilibili creator console. The page's own
 * requests supply the JSON; no cookies leave the desktop process.
 */
export async function captureBilibili(
  accountId: string,
  studioUrl: string | null | undefined,
): Promise<CollectorResponse> {
  const partition = accountPartition(accountId);
  const page = new CollectorPage(partition, HOSTS);
  try {
    return await withTimeout(
      capture(page),
      60_000,
      'The Bilibili creator console did not finish loading within the collection limit. Try again; if it repeats, open the account and check the session.',
    );
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'The Bilibili creator console could not be read.',
    };
  } finally {
    page.close();
  }

  async function capture(page: CollectorPage): Promise<CollectorResponse> {
    if (!(await hasSessionCookies(partition))) {
      return { ok: false, loginRequired: true, detail: 'Sign in to Bilibili in the embedded window, then sync again.' };
    }
    await page.open(studioUrl || HOME, 2500);
    await page.waitForJson(NAV, 8000);
    const homeText = await page.text();
    const nav = page.json(NAV).at(-1)?.body;
    const navData = isRecord(nav) && Number(nav.code) === 0 && isRecord(nav.data) ? nav.data : null;
    if (!navData || navData.isLogin !== true) {
      return { ok: false, loginRequired: true, detail: 'Sign in to Bilibili in the embedded window, then sync again.' };
    }
    await page.waitForJson(INDEX, 6000);
    await page.open(FANS, 2500);
    await page.waitForJson(FANS_BODY, 6000);
    const fansText = await page.text();
    await page.open(MANAGER, 2500);
    await page.waitForJson(POSTS, 6000);
    const managerText = await page.text();
    await page.open(DATA_CENTER, 3000);
    await page.waitForJson(OVERVIEW, 6000);
    const frames = await page.frameTexts();
    const analyticsText = frames.find((frame) => frame.text.includes('核心数据概览'))?.text
      ?? frames.find((frame) => /播放量|核心数据/.test(frame.text))?.text
      ?? await page.text();

    const payload: BrowserCapture = {
      capturedAt: new Date().toISOString(),
      responses: page.json(HOSTS).map(({ url, body }) => ({ url, body })),
      texts: { home: homeText, fans: fansText, manager: managerText, analytics: analyticsText },
    };
    return { ok: true, payload };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
