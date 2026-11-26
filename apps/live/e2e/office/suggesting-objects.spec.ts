import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { solidPng } from './office-pictures';

// Objects and breaks while suggesting (docs/specs/034-text-documents/review.md "While suggesting": Objects in a line,
// Breaks and lines, Not yet): an Editor in Suggesting puts in a page break, an equation and a horizontal line, each a
// card of its own kind; rejecting the line takes it away; a new drawing is dimmed, "Editing only". A Participant's horizontal
// line reaches the Editor as a card, and so does their picture, drawn from its media for the Editor, who accepts it.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const CARD = '[data-suggestion-card]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test('objects and breaks are suggested, each with its card', async ({
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
  await page.keyboard.type('Above below');

  // ⌘⌥⇧X (Ctrl+Alt+Shift+X here) switches to Suggesting.
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();

  // A page break before "below": a card saying so.
  for (let i = 0; i < 'below'.length; i += 1) await page.keyboard.press('ArrowLeft');
  await (await officeMenuItem(page, ['Insert', 'Break', 'Page break'])).click();
  await expect(page.locator(CARD).filter({ hasText: 'Add: Page break' })).toHaveCount(1);
  await expect(body.locator(':scope > p')).toHaveCount(2);

  // An equation at the end of the first line, its box entered: a card for it.
  await body.locator(':scope > p').first().click();
  await page.keyboard.press('End');
  await (await officeMenuItem(page, ['Insert', 'Symbols', 'Equation'])).click();
  await expect(page.locator(CARD).filter({ hasText: 'Add: Equation' })).toHaveCount(1);
  await page.keyboard.press('Escape');

  // A horizontal line at the end, then rejected: it goes.
  await body.locator(':scope > p').last().click();
  await page.keyboard.press('End');
  const paragraphs = await body.locator(':scope > p').count();
  await (await officeMenuItem(page, ['Insert', 'Horizontal line'])).click();
  const lineCard = page.locator(CARD).filter({ hasText: 'Add: Horizontal line' });
  await expect(lineCard).toHaveCount(1);
  // Its own suggestion: the page break keeps its card.
  await expect(page.locator(CARD).filter({ hasText: 'Add: Page break' })).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggesting-objects-editor.png') });
  await lineCard.click();
  await lineCard.getByRole('button', { name: 'Reject suggestion' }).click();
  await expect(lineCard).toHaveCount(0);
  await expect(body.locator(':scope > p')).toHaveCount(paragraphs);
  await expect(page.locator(CARD).filter({ hasText: 'Add: Page break' })).toHaveCount(1);

  // A new drawing cannot be suggested yet: dimmed, saying where it runs.
  const drawing = await officeMenuItem(page, ['Insert', 'Drawing', 'New']);
  await expect(drawing).toHaveAttribute('aria-disabled', 'true');
  await expect(drawing).toContainText('Editing only');
  await expect(drawing).toHaveAccessibleDescription(/An Editor changes it in Editing/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // A Participant on a share link puts in a horizontal line; the Editor sees its card.
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
  await expect(peerBody).toContainText('Above');
  await peerBody.locator(':scope > p').first().click();
  await peer.keyboard.press('Home');
  await (await officeMenuItem(peer, ['Insert', 'Horizontal line'])).click();
  await expect(peer.locator(CARD).filter({ hasText: 'Add: Horizontal line' })).toHaveCount(1);
  await expect(page.locator(CARD).filter({ hasText: 'Add: Horizontal line' })).toHaveCount(1, {
    timeout: 15_000,
  });
  // The room kept it: it survives the Participant's reload.
  await peer.reload();
  await expect(peer.locator(READY)).toBeVisible();
  await expect(peer.locator(CARD).filter({ hasText: 'Add: Horizontal line' })).toHaveCount(1);

  // The Participant uploads a picture: suggested, its media with it, drawn for the Editor, who accepts it.
  await peerBody.locator(':scope > p').last().click();
  await peer.keyboard.press('End');
  const [chooser] = await Promise.all([
    peer.waitForEvent('filechooser'),
    (await officeMenuItem(peer, ['Insert', 'Image', 'Upload from computer'])).click(),
  ]);
  await chooser.setFiles({
    name: 'suggested.png',
    mimeType: 'image/png',
    buffer: solidPng(240, 120, [14, 165, 233]),
  });
  await expect(peer.locator(CARD).filter({ hasText: 'Add: Picture' })).toHaveCount(1);
  const pictureCard = page.locator(CARD).filter({ hasText: 'Add: Picture' });
  await expect(pictureCard).toHaveCount(1, { timeout: 15_000 });
  const picture = body.locator('[data-media]');
  await expect(picture).toHaveCount(1);
  await expect(picture.locator('img')).toHaveCount(1);
  await expect(body.locator('.text-document-picture-missing')).toHaveCount(0);
  await peer.waitForTimeout(300);
  await peer.screenshot({ path: test.info().outputPath('suggesting-objects-participant.png') });
  await page.screenshot({ path: test.info().outputPath('suggesting-objects-picture.png') });
  await pictureCard.click();
  await pictureCard.getByRole('button', { name: 'Accept suggestion' }).click();
  await expect(pictureCard).toHaveCount(0);
  await expect(picture).toHaveCount(1);

  await ctx.close();
  expectNoPageErrors(pageErrors);
});
