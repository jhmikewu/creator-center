import type { CollectorResponse, DouyinCapture } from '@creator-center/shared';
import { CollectorPage, accountPartition, hasSessionCookies, wait, withTimeout } from './page.js';

const HOME = 'https://creator.douyin.com/creator-micro/home';
const MANAGE = 'https://creator.douyin.com/creator-micro/content/manage';
const DATA_CENTER = 'https://creator.douyin.com/creator-micro/data-center/operation';
const USER = /\/aweme\/v1\/creator\/user\/info\//;
const WORK = /\/janus\/douyin\/creator\/pc\/work_list/;
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
    await page.open(studioUrl || HOME, 2500);
    await page.waitForJson(USER, 10_000);
    const homeText = await page.text();
    if (looksSignedOut(homeText, page.currentUrl())) {
      return { ok: false, loginRequired: true, detail: 'Sign in to the 抖音 creator console, then sync again.' };
    }
    const profile = page.lastJson(USER);
    if (!isRecord(profile)) {
      return {
        ok: false,
        loginRequired: true,
        detail: 'The 抖音 creator console did not finish loading. Sign in and try again.',
      };
    }

    await page.open(MANAGE, 2500);
    await page.waitForJson(WORK, 8_000);
    await page.clickText('审核状态');
    await wait(300);
    await page.clickText('已发布');
    await page.waitForJson(WORK, 5_000);
    for (let index = 0; index < 3; index += 1) {
      await page.scrollAll();
      await wait(1200);
    }
    const contentText = await page.text();
    const work = page.json(WORK);
    const postsPages = work.filter((entry) => statusOf(entry.url) !== '0').map((entry) => entry.body);
    const schedulePages = work.filter((entry) => statusOf(entry.url) === '0').map((entry) => entry.body);

    let analyticsText = '';
    let overview: unknown = null;
    if (isRecord(profile) && profile.has_data_mgmt_perm === true) {
      await page.open(DATA_CENTER, 3000);
      await page.waitForJson(OVERVIEW, 10_000);
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
      scheduleRead: schedulePages.length > 0,
    };
    return { ok: true, payload };
  }
}

function statusOf(url: string): string | null {
  try {
    return new URL(url).searchParams.get('status');
  } catch {
    return null;
  }
}

function looksSignedOut(text: string, url: string): boolean {
  if (/passport\.douyin\.com|creator\.douyin\.com\/(?:login|passport)/i.test(url)) return true;
  return /扫码登录|二维码登录|手机号登录|请登录|登录后查看/.test(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
