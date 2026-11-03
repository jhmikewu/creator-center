import type { BrowserCapture, CollectorResponse } from '@creator-center/shared';
import { CollectorPage, accountPartition, hasSessionCookies, withTimeout } from './page.js';

const HOME = 'https://mp.weixin.qq.com/';
const PUBLISH = /\/cgi-bin\/appmsgpublish/;
const USER = /\/misc\/useranalysis/;
const HOSTS = /^https:\/\/mp\.weixin\.qq\.com\//;

/**
 * Read-only walk of the signed-in 公众号 console. The home page supplies the
 * account totals and the publish list; the useranalysis report adds the handle
 * and verification state. Cookies never leave the desktop process.
 */
export async function captureWechat(
  accountId: string,
  studioUrl: string | null | undefined,
): Promise<CollectorResponse> {
  const partition = accountPartition(accountId);
  const page = new CollectorPage(partition, HOSTS);
  try {
    return await withTimeout(
      capture(page),
      60_000,
      'The 公众号 console did not finish loading within the collection limit. Try again; if it repeats, open the account and check the session.',
    );
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'The 公众号 console could not be read.',
    };
  } finally {
    page.close();
  }

  async function capture(page: CollectorPage): Promise<CollectorResponse> {
    if (!(await hasSessionCookies(partition))) {
      return { ok: false, loginRequired: true, detail: 'Sign in to the 公众号 console in the embedded window, then sync again.' };
    }
    await page.open(studioUrl || HOME, 3000);
    await page.waitForJson(PUBLISH, 8000);
    const homeText = await page.text();
    if (/请重新登录|重新登录/.test(homeText)) {
      return { ok: false, loginRequired: true, detail: 'Sign in to the 公众号 console in the embedded window, then sync again.' };
    }
    const token = tokenOf(page.currentUrl());
    if (token) {
      const analysis = `${new URL(USER_SOURCE).origin}/misc/useranalysis?begin_date=${shanghaiDate(30)}` +
        `&end_date=${shanghaiDate(1)}&source=99999999&lang=zh_CN&token=${encodeURIComponent(token)}`;
      await page.open(analysis, 2500);
      await page.waitForJson(USER, 15000);
    }

    const payload: BrowserCapture = {
      capturedAt: new Date().toISOString(),
      responses: page.json(HOSTS).map(({ url, body }) => ({ url, body })),
      texts: { home: homeText, manager: homeText, analytics: homeText },
    };
    return { ok: true, payload };
  }
}

const USER_SOURCE = 'https://mp.weixin.qq.com/misc/useranalysis';

function tokenOf(url: string): string | null {
  try {
    return new URL(url).searchParams.get('token');
  } catch {
    return null;
  }
}

function shanghaiDate(offsetDays: number): string {
  const date = new Date(Date.now() - offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}
