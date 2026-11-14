import type { Page } from '@playwright/test';
import { apiBase, box, seedHomeDocument } from './home-seed';
import {
  test,
  expect,
  expectNoPageErrors,
  guestSigFor,
  mintSignedGuest,
  ownerHeaders,
} from './fixtures';

// Naming the document names its first tab while that tab still has its default name
// (docs/specs/006-document/document-structure.md "Naming the document names its first tab"), end to end: the tab
// pill follows at once, the tab's name is saved, a later rename leaves it alone, and a named tab keeps its name.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

async function asOwner(page: Page, owner: string) {
  await page.addInitScript(
    ({ id, sig }) => {
      localStorage.setItem('livedoc:v2:self-id', id);
      if (sig) localStorage.setItem('livedoc:v2:self-sig', sig);
      localStorage.setItem('livedoc:v2:name-confirmed', '1');
    },
    { id: owner, sig: guestSigFor(owner) },
  );
}

async function renameDocument(page: Page, name: string) {
  await page.locator('[data-doc-name] button').click();
  const field = page.locator('[data-doc-name] input');
  await field.fill(name);
  await field.press('Enter');
  await expect(page.locator('[data-doc-name] button')).toHaveText(name);
}

// The active tab's name: the first words of its tab stack.
const activeTab = (page: Page) =>
  page.locator('[data-active-tab-segment] [data-tab-stack] > span').first();

async function storedTabName(page: Page, owner: string, doc: { id: string; tabId: string }) {
  const res = await page.request.get(`${apiBase}/documents/${doc.id}/tabs/${doc.tabId}`, {
    headers: ownerHeaders(owner),
  });
  return ((await res.json()) as { tab: { name: string } }).tab.name;
}

test('naming the document names its default-named first tab, once', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  const owner = await mintSignedGuest(page.request);
  const doc = await seedHomeDocument(page.request, owner, new URL(baseURL!).origin, 'Untitled', [
    box('a', 'Kickoff', 40, 40),
  ]);
  await asOwner(page, owner);
  await page.goto(`/document/${doc.id}`);
  await expect(activeTab(page)).toHaveText('Tab 1');

  await renameDocument(page, 'Roadmap');
  await expect(activeTab(page)).toHaveText('Roadmap');
  await page.screenshot({
    path: test.info().outputPath('document-named-tab.png'),
    animations: 'disabled',
  });
  await expect.poll(() => storedTabName(page, owner, doc)).toBe('Roadmap');

  // The tab has a name of its own now: a later rename of the document leaves it.
  await renameDocument(page, 'Roadmap 2027');
  await expect(activeTab(page)).toHaveText('Roadmap');
  expectNoPageErrors(pageErrors);
});

test('a first tab with a name of its own keeps it', async ({ page, baseURL, pageErrors }) => {
  const owner = await mintSignedGuest(page.request);
  const id = crypto.randomUUID();
  const res = await page.request.post(`${apiBase}/documents`, {
    headers: ownerHeaders(owner, { Origin: new URL(baseURL!).origin }),
    data: {
      id,
      name: 'Untitled',
      tabs: [{ id: crypto.randomUUID(), name: 'Overview', elements: [] }],
    },
  });
  expect(res.ok()).toBe(true);
  await asOwner(page, owner);
  await page.goto(`/document/${id}`);
  await expect(activeTab(page)).toHaveText('Overview');

  await renameDocument(page, 'Roadmap');
  await expect(activeTab(page)).toHaveText('Overview');
  expectNoPageErrors(pageErrors);
});
