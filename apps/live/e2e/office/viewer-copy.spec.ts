import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// What a Viewer receives (docs/specs/034-text-documents/review.md "What a Viewer receives"; live-editing-and-storage.md
// "A Viewer's copy"): a Viewer on a share link reads the writing, while nothing the room sends their browser, live or
// read by the door, holds a comment's text or the name of who commented or suggested.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const SECRET = 'Confidential remark';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

/** Every text a frame or update carries: the frame itself, and each base64 update in it decoded. */
function decoded(payload: string): string {
  const parts = [payload];
  for (const match of payload.matchAll(/"update":"([A-Za-z0-9+/=]+)"/g))
    parts.push(Buffer.from(match[1]!, 'base64').toString('latin1'));
  return parts.join('\n');
}

test('a Viewer reads the writing and receives no comment or author', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('The quarterly results are in.');
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('Shift+ArrowRight');
  await (await officeMenuItem(page, ['Insert', 'Comment'])).click();
  const draft = page.getByRole('group', { name: 'New comment' });
  await expect(draft.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
  await page.keyboard.type(SECRET);
  await draft.getByRole('button', { name: 'Comment' }).click();
  await expect(page.locator('[data-thread-card]:not([data-thread-card="draft"])')).toHaveCount(1);
  // Whose comment it is, as the comments panel names them.
  await page.getByRole('button', { name: 'Open comment history' }).click();
  const row = page
    .getByRole('complementary', { name: 'Comments' })
    .getByRole('button', { name: /^Go to comment by / });
  const author = (await row.getAttribute('aria-label'))!.match(/^Go to comment by (.+?) on /)![1]!;
  expect(author.length).toBeGreaterThan(2);

  const id = new URL(page.url()).pathname.split('/')[2]!;
  const origin = new URL(baseURL!).origin;
  const headers = await pageOwnerHeaders(page, { Origin: origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'view' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1440, height: 900 },
  });
  const viewer = await ctx.newPage();
  const leaks: string[] = [];
  const seen = { frames: 0, states: 0 };
  viewer.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      const text = decoded(String(payload));
      seen.frames += 1;
      for (const leak of [SECRET, author]) if (text.includes(leak)) leaks.push(`ws ${leak}`);
    }),
  );
  viewer.on('response', async (res) => {
    if (!/\/text-documents\/[^/]+\/state/.test(res.url())) return;
    seen.states += 1;
    const bytes = Buffer.from(await res.body()).toString('latin1');
    for (const leak of [SECRET, author]) if (bytes.includes(leak)) leaks.push(`state ${leak}`);
  });
  await viewer.goto(`/document/shared?s=${code}`);
  const join = viewer.getByRole('button', { name: /^join$/i });
  await expect(join.or(viewer.locator(READY))).toBeVisible({ timeout: 30_000 });
  if (await join.isVisible()) await join.click();
  await expect(viewer.locator(READY)).toBeVisible();
  const viewerBody = viewer.locator(BODY);
  await expect(viewerBody).toContainText('The quarterly results are in.');

  // The Editor writes on, and comments again, while the Viewer watches: the writing arrives, the comment does not.
  await body.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Margins grew.');
  await expect(viewerBody).toContainText('Margins grew.', { timeout: 15_000 });
  await page.keyboard.press('Shift+Home');
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyM');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(
    page
      .getByRole('group', { name: 'New comment' })
      .getByRole('textbox', { name: 'Add a comment' }),
  ).toBeFocused();
  await page.keyboard.type(`${SECRET} again`);
  await page
    .getByRole('group', { name: 'New comment' })
    .getByRole('button', { name: 'Comment' })
    .click();
  await body.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Done.');
  await expect(viewerBody).toContainText('Done.', { timeout: 15_000 });
  await expect(viewer.locator('[data-thread-card]')).toHaveCount(0);
  await viewer.waitForTimeout(300);
  await viewer.screenshot({ path: test.info().outputPath('viewer-copy-viewer.png') });

  expect(seen.states).toBeGreaterThan(0);
  expect(seen.frames).toBeGreaterThan(0);
  expect(leaks).toEqual([]);
  expectNoPageErrors(pageErrors);
  await ctx.close();
});
