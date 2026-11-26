import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect } from '../fixtures';
import { signIn, type Account } from './sign-in';

// A text document in a team's library, signed in as Ann with Bob as her teammate (docs/specs/034-text-documents/
// review.md "Mentions"): the ground the signed-in comment specs stand on.

export const READY = '[data-text-document-surface="ready"]';
export const BODY = '[role="textbox"][aria-label="Document body"]';

export async function api(who: Account, method: 'POST' | 'PUT', path: string, data?: unknown) {
  const res = await who.request.fetch(`/api${path}`, {
    method,
    headers: await who.apiHeaders(),
    ...(data === undefined ? {} : { data }),
  });
  expect(res.ok(), `${method} ${path} failed: ${res.status()}`).toBe(true);
  return res;
}

export type TeamTextDocument = {
  ann: Account;
  bob: Account;
  bobContext: BrowserContext;
  id: string;
};

/** Ann's text document holding `text`, in a team Bob has joined; Bob's context left open for his own pages. */
export async function teamTextDocument(
  page: Page,
  browser: Browser,
  baseURL: string,
  text: string,
): Promise<TeamTextDocument> {
  await page.addInitScript(() => localStorage.setItem('livedoc:v2:name-confirmed', '1'));
  const ann = await signIn(page.context(), { baseURL, name: 'Ann Tester' });
  const bobContext = await browser.newContext({ baseURL, colorScheme: 'dark' });
  const bob = await signIn(bobContext, { baseURL, name: 'Bob Tester' });
  const team = crypto.randomUUID();
  await api(ann, 'POST', '/teams', { id: team, name: 'Writers' });
  const link = (await (await api(ann, 'POST', `/teams/${team}/invite-link`)).json()) as {
    inviteLink: { token: string };
  };
  await api(bob, 'POST', `/teams/invite-link/${link.inviteLink.token}/join`);

  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible({ timeout: 30_000 });
  const id = new URL(page.url()).pathname.split('/')[2]!;
  await page.locator(BODY).click();
  await page.keyboard.type(text);
  await api(ann, 'PUT', `/documents/${id}/folder`, { folderId: null, teamId: team });
  await page.reload();
  await expect(page.locator(READY)).toBeVisible({ timeout: 30_000 });
  return { ann, bob, bobContext, id };
}
