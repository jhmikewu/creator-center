import type { BrowserCapture, CollectorResponse } from '@creator-center/shared';
import { CollectorPage, accountPartition, hasSessionCookies, wait, withTimeout } from './page.js';

const HOME = 'https://creator.xiaohongshu.com/creator/home';
const MANAGER = 'https://creator.xiaohongshu.com/new/note-manager';
const PROFILE = /\/api\/galaxy\/creator\/home\/personal_info/;
const OVERVIEW = /\/api\/galaxy\/v2\/creator\/datacenter\/account\/base/;
const POSTS = /\/api\/galaxy\/v2\/creator\/note\/user\/posted/;
const HOSTS = /^https:\/\/creator\.xiaohongshu\.com\//;

/**
 * Read-only walk of the signed-in 小红书 creator console. The page's own signed
 * requests supply the JSON; cookies never leave the desktop process.
 */
export async function captureXiaohongshu(
  accountId: string,
  studioUrl: string | null | undefined,
): Promise<CollectorResponse> {
  const partition = accountPartition(accountId);
  const page = new CollectorPage(partition, HOSTS);
  try {
    return await withTimeout(
      capture(page),
      60_000,
      'The 小红书 creator console did not finish loading within the collection limit. Try again; if it repeats, open the account and check the session.',
    );
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'The 小红书 creator console could not be read.',
    };
  } finally {
    page.close();
  }

  async function capture(page: CollectorPage): Promise<CollectorResponse> {
    if (!(await hasSessionCookies(partition))) {
      return { ok: false, loginRequired: true, detail: 'Sign in to 小红书 in the embedded window, then sync again.' };
    }
    await page.open(studioUrl || HOME, 3000);
    await page.waitForJson(PROFILE, 8000);
    const homeText = await page.text();
    if (!unwrap(page.json(PROFILE).at(-1)?.body)) {
      return { ok: false, loginRequired: true, detail: 'Sign in to 小红书 in the embedded window, then sync again.' };
    }
    await page.waitForJson(OVERVIEW, 6000);

    await page.open(MANAGER, 3000);
    await page.waitForJson(POSTS, 8000);
    for (let index = 0; index < 3; index += 1) {
      const last = unwrap(page.json(POSTS).at(-1)?.body);
      if (last && Number(last.page) === -1) break;
      await page.scrollAll();
      await wait(1200);
    }
    const managerText = await page.text();

    const payload: BrowserCapture = {
      capturedAt: new Date().toISOString(),
      responses: page.json(HOSTS).map(({ url, body }) => ({ url, body })),
      texts: { home: homeText, manager: managerText, analytics: homeText },
    };
    return { ok: true, payload };
  }
}

function unwrap(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Number(record.code) !== 0 && record.success !== true) return null;
  return typeof record.data === 'object' && record.data !== null && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : null;
}
