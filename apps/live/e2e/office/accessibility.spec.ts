import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// Screen reader support (docs/specs/034-text-documents/tools.md "Accessibility settings"): Ctrl+Alt+Z turns it on,
// said aloud, and the Accessibility menu shows after Help; its keys say what is selected; Tools > Accessibility's
// dialog holds the switch and, in the tab order, the sentence that braille and magnifiers need nothing turned on.

const BODY = '[role="textbox"][aria-label="Document body"]';
const REGION = '[data-screen-reader-region]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test.use({ colorScheme: 'dark' });

/** Holds Control and Alt for a key then a second key, as a verbalise sequence is pressed. */
async function chord(page: import('@playwright/test').Page, first: string, second: string) {
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press(first);
  await page.keyboard.press(second);
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
}

test('screen reader support shows the Accessibility menu and says what is selected', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('The cat sat.');

  const region = page.locator(REGION);
  const menubar = page.getByRole('menubar');
  await expect(menubar.getByRole('menuitem', { name: 'Accessibility', exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press('Control+Alt+KeyZ');
  await expect(region).toHaveText('Screen reader support enabled');
  await expect(menubar.getByRole('menuitem', { name: 'Accessibility', exact: true })).toBeVisible();

  await page.keyboard.press('Shift+Home');
  await chord(page, 'KeyA', 'KeyX');
  await expect(region).toHaveText('The cat sat.');
  await chord(page, 'KeyA', 'KeyF');
  await expect(region).toHaveText(/, 11 point, Left aligned\s?$/);

  await menubar.getByRole('menuitem', { name: 'Accessibility', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Verbalize', exact: true }).hover();
  const count = page.getByRole('menuitem', { name: /^Verbalize word count/ });
  await expect(count).toBeVisible();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  await page.screenshot({ path: test.info().outputPath('accessibility-menu.png') });
  await count.click();
  await expect(region).toHaveText('3 of 3 words selected');

  await menubar.getByRole('menuitem', { name: 'Tools', exact: true }).click();
  await page
    .getByRole('menu', { name: 'Tools' })
    .getByRole('menuitem', { name: /^Accessibility/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Accessibility settings' });
  await expect(dialog).toBeVisible();
  const box = dialog.getByRole('checkbox', { name: 'Turn on screen reader support' });
  await expect(box).toBeChecked();
  await box.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText(
    'Braille displays and screen magnifiers follow LiveDoc’s text directly; nothing to turn on.',
  );
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  await page.screenshot({ path: test.info().outputPath('accessibility-dialog.png') });
  await box.uncheck();
  await expect(region).toHaveText('Screen reader support disabled');
  await dialog.getByRole('button', { name: /^OK$/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(menubar.getByRole('menuitem', { name: 'Accessibility', exact: true })).toHaveCount(
    0,
  );
  expectNoPageErrors(pageErrors);
});

test('Show live edits lists what an Editor on a share link writes, under their name', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('Start.');
  await page.keyboard.press('Control+Alt+Shift+KeyR');
  const panel = page.getByRole('complementary', { name: 'Live edits' });
  await expect(panel.getByText('What others write shows here as they write it.')).toBeVisible();

  const id = new URL(page.url()).pathname.split('/')[2]!;
  const origin = new URL(baseURL!).origin;
  const headers = await pageOwnerHeaders(page, { Origin: origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'edit' },
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
  const ready = peer.locator('[data-text-document-surface="ready"]');
  await expect(join.or(ready)).toBeVisible({ timeout: 30_000 });
  if (await join.isVisible()) await join.click();
  await expect(ready).toBeVisible();
  await peer.locator(BODY).click();
  await peer.keyboard.press('Control+End');
  await peer.keyboard.type(' More words.');

  const entry = panel.getByRole('listitem').first();
  await expect(entry).toContainText('added “More words.”');
  // Under the name the room gave the Editor, never the stand-in for one it did not name.
  await expect(entry).not.toContainText('Someone');
  await expect(page.locator('[role="status"]', { hasText: 'added “More words.”' })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('live-edits.png') });
  await ctx.close();
  expectNoPageErrors(pageErrors);
});
