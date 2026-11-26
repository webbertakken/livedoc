import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// Suggesting in a text document (docs/specs/034-text-documents/review.md "Editing modes", "While suggesting"; fork D7):
// an Editor switches to Suggesting with ⌘⌥⇧X; typed text is a suggested insertion, Backspace marks text deleted, Enter
// suggests a paragraph break with its pilcrow; a Participant on a share link starts in Suggesting and their suggestion,
// judged by the room as theirs, reaches the Editor.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test('an Editor and a Participant suggest, and each sees the other’s suggestions', async ({
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
  await page.keyboard.type('The fox jumps.');

  // ⌘⌥⇧X (Ctrl+Alt+Shift+X here) switches to Suggesting.
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();

  // Typed text is a suggested insertion; Backspace marks the text before the caret deleted, the caret moving before it.
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.type('quick ');
  await expect(body.locator('.text-document-insertion')).toHaveText('quick ');
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await expect(body.locator('.text-document-deletion')).toHaveText('.');
  await expect(body).toContainText('The quick fox jumps.');
  // Enter suggests a paragraph break, drawn as a pilcrow.
  await page.keyboard.press('Home');
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(body.locator('p')).toHaveCount(2);
  await expect(body.locator('.text-document-suggested-break-insertion')).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggesting-editor.png') });

  // A Participant on a share link starts in Suggesting; what they type reaches the Editor as their suggestion.
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const origin = new URL(baseURL!).origin;
  const headers = await pageOwnerHeaders(page, { Origin: origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'participate' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1440, height: 900 },
  });
  const peer = await ctx.newPage();
  await peer.goto(`/document/shared?s=${code}`);
  const join = peer.getByRole('button', { name: /^join$/i });
  await expect(join.or(peer.locator(READY))).toBeVisible({ timeout: 30_000 });
  if (await join.isVisible()) await join.click();
  await expect(peer.locator(READY)).toBeVisible();
  await expect(peer.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();
  const peerBody = peer.locator(BODY);
  // The Editor's insertion, split by their suggested break, in both paragraphs.
  await expect(peerBody.locator('.text-document-insertion').first()).toContainText('quick');
  await peerBody.locator('p').last().click();
  await peer.keyboard.press('End');
  await peer.keyboard.type(' Then it rests');
  await expect(
    body.locator('.text-document-insertion').filter({ hasText: 'Then it rests' }),
  ).toHaveCount(1, {
    timeout: 15_000,
  });
  // The room kept it: it is there after the Editor reloads.
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(
    body.locator('.text-document-insertion').filter({ hasText: 'Then it rests' }),
  ).toHaveCount(1);
  await page.waitForTimeout(300);
  await peer.screenshot({ path: test.info().outputPath('suggesting-participant.png') });

  await ctx.close();
  expectNoPageErrors(pageErrors);
});
