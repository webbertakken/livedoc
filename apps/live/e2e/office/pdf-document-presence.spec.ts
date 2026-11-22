import { textPdf } from '@livedoc/pdf-documents/testing';
import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { dropPdf, pageOneDrawn, peerOn } from './pdf-document-pages';

// Who is on which page of a PDF document (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence"): the
// page in view is said by every role, a Viewer's too; a press on a person in the title row goes to their page; and
// whoever joins later hears where everyone already is, nobody having moved since.

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const PAGE_TWO = '[data-pdf-page="2"]';
const PEOPLE = '[data-office-person]';

/** Presses each person in the title row until one of them is on page two, and this browser is taken there. */
async function followToPageTwo(page: Page): Promise<void> {
  await expect(async () => {
    for (const person of await page.locator(PEOPLE).all()) {
      await person.click();
      if (await page.locator(PAGE_TWO).isVisible()) break;
    }
    await expect(page.locator(PAGE_TWO)).toBeInViewport({ ratio: 0.2, timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test('a Viewer’s page is seen by an Editor, who goes to it; a late joiner hears where everyone is', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Lease agreement.pdf', await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'view' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  // Shared behind the editor's back, by the api: the owner's editor learns it on a reload.
  await page.reload();
  await pageOneDrawn(page);

  // A Viewer reads on, to page two. The Editor is still on page one, with page two out of view.
  const viewer = await peerOn(browser, baseURL!, code);
  await pageOneDrawn(viewer);
  await expect(page.locator(PEOPLE)).toHaveCount(1);
  await expect(page.locator(PAGE_TWO)).not.toBeInViewport();
  await viewer
    .locator('[data-pdf-pages]')
    .evaluate((pages) => pages.scrollTo(0, pages.scrollHeight));
  await expect(viewer.locator(PAGE_TWO)).toBeInViewport({ ratio: 0.2 });

  // A press on the Viewer in the title row takes the Editor to the page they are on.
  await followToPageTwo(page);
  await page.screenshot({ path: test.info().outputPath('pdf-presence-followed.png') });

  // Someone joins after both have settled: nobody moves, and the newcomer still finds who is on page two.
  const late = await peerOn(browser, baseURL!, code);
  await pageOneDrawn(late);
  await expect(late.locator(PEOPLE)).toHaveCount(2);
  await expect(late.locator(PAGE_TWO)).not.toBeInViewport();
  await followToPageTwo(late);
  await late.screenshot({ path: test.info().outputPath('pdf-presence-late-joiner.png') });

  expectNoPageErrors(pageErrors);
  await viewer.context().close();
  await late.context().close();
});
