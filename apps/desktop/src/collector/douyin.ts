import type { CollectorResponse, DouyinCapture } from '@creator-center/shared';
import { CollectorPage, accountPartition, hasSessionCookies, withTimeout } from './page.js';

const HOME = 'https://creator.douyin.com/creator-micro/home';
const MANAGE = 'https://creator.douyin.com/creator-micro/content/manage';
const DATA_CENTER = 'https://creator.douyin.com/creator-micro/data-center/operation';
const USER = /\/aweme\/v1\/creator\/user\/info\//;
const USER_URL = 'https://creator.douyin.com/aweme/v1/creator/user/info/';
const OVERVIEW = /\/janus\/douyin\/creator\/data\/overview\/dashboard/;

/**
 * Read-only capture of the signed-in 抖音 creator console. The page is hidden
 * and uses the account's persistent partition; navigation and the manager's own
 * filters trigger the same signed requests the user would make.
 */
export async function captureDouyin(
  accountId: string,
  studioUrl: string | null | undefined,
): Promise<CollectorResponse> {
  const partition = accountPartition(accountId);
  const page = new CollectorPage(partition);
  try {
    return await withTimeout(
      capture(page),
      60_000,
      'The 抖音 creator console did not finish loading within the collection limit. Try again; if it repeats, open the account and check the session.',
    );
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error
        ? error.message
        : 'The 抖音 creator console could not be read.',
    };
  } finally {
    page.close();
  }

  async function capture(page: CollectorPage): Promise<CollectorResponse> {
    if (!(await hasSessionCookies(partition))) {
      return { ok: false, loginRequired: true, detail: 'Sign in to the 抖音 creator console, then sync again.' };
    }
    await page.open(studioUrl || HOME, 2000);
    const homeText = await page.text();
    let profile = page.lastJson(USER);
    if (!isRecord(profile)) {
      // The current console no longer requests the profile endpoint on load;
      // call it in the page's own signed-in origin instead.
      profile = await page.fetchJson(USER_URL);
    }
    if (!isRecord(profile) || profile.status_code !== 0 || !isRecord(profile.user_profile)) {
      return {
        ok: false,
        loginRequired: true,
        detail: looksSignedOut(homeText, page.currentUrl())
          ? 'Sign in to the 抖音 creator console, then sync again.'
          : 'The 抖音 creator console did not return account data. Sign in and try again.',
      };
    }

    await page.open(MANAGE, 2500);
    const contentText = await page.text();
    // The manager UI is filter/scroll driven and does not always request its
    // list. The same signed-in endpoint is fetchable directly and pages with
    // max_cursor, so use it instead of depending on UI clicks.
    const published = await fetchWorkList(page, '1');
    const scheduled = await fetchWorkList(page, '0');
    const postsPages = published.pages;
    const schedulePages = scheduled.pages;

    let analyticsText = '';
    let overview: unknown = null;
    if (isRecord(profile) && profile.has_data_mgmt_perm === true) {
      await page.open(DATA_CENTER, 3500);
      await page.waitForJson(OVERVIEW, 2_000);
      analyticsText = await page.text();
      overview = page.lastJson(OVERVIEW);
    }

    const payload: DouyinCapture = {
      capturedAt: new Date().toISOString(),
      profile,
      postsPages,
      schedulePages,
      overview,
      homeText,
      analyticsText,
      contentText,
      scheduleRead: scheduled.read,
    };
    return { ok: true, payload };
  }
}

async function fetchWorkList(
  page: CollectorPage,
  status: '0' | '1',
): Promise<{ pages: unknown[]; read: boolean }> {
  const pages: unknown[] = [];
  let cursor = 0;
  let read = false;
  for (let index = 0; index < 10; index += 1) {
    const url = `https://creator.douyin.com/janus/douyin/creator/pc/work_list?status=${status}&count=12&max_cursor=${cursor}`;
    const body = await page.fetchJson(url);
    if (!isRecord(body) || body.status_code !== 0 || !Array.isArray(body.aweme_list)) break;
    read = true;
    pages.push(body);
    if (body.has_more !== true) break;
    const next = typeof body.max_cursor === 'number' ? body.max_cursor : Number(body.max_cursor);
    if (!Number.isFinite(next) || next === cursor) break;
    cursor = next;
  }
  return { pages, read };
}

function looksSignedOut(text: string, url: string): boolean {
  if (/passport\.douyin\.com|creator\.douyin\.com\/(?:login|passport)/i.test(url)) return true;
  return /扫码登录|二维码登录|手机号登录|请登录|登录后查看/.test(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
