import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// A text document's copies and thumbnail (docs/specs/034-text-documents/live-editing-and-storage.md "Copies",
// "Thumbnails"): Make a copy holds the writing, and the Explorer's thumbnail draws the first page.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test('a copy of a text document holds its writing, and its thumbnail draws it', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('Minutes of the meeting.');
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });

  // The thumbnail follows the writing once the room has digested it.
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${apiBase}/documents/${id}/thumbnail`, { headers });
        return res.ok() ? await res.text() : '';
      },
      { timeout: 30_000 },
    )
    .toContain('>Minutes of the meeting.</text>');

  const copied = await page.request.post(`${apiBase}/documents/${id}/copy`, {
    headers,
    data: { name: 'Minutes copy' },
  });
  expect(copied.ok()).toBe(true);
  const copy = (await copied.json()) as { document: { id: string } };
  await page.goto(`/document/${copy.document.id}`);
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.locator(BODY)).toHaveText('Minutes of the meeting.');
  expectNoPageErrors(pageErrors);
});
