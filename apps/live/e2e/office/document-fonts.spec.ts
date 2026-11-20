import { expect, expectNoPageErrors, test } from '../fixtures';

// Document fonts on a text document (docs/specs/004-interface-design/fonts.md "Document fonts"): the writing draws in
// the document's default family through its stand-in, served by LiveDoc itself, and the toolbar's font menu sets a
// family that loads from LiveDoc and stays after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('a text document draws its fonts from LiveDoc, and the font menu sets one', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  const fontFiles: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.woff2')) fontFiles.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });

  // Arial 11 pt: the computer's Arial where it has one, else LiveDoc's Arimo.
  await body.click();
  await page.keyboard.type('Field notes');
  await expect(body).toHaveCSS('font-family', /^"?Arial"?, "LiveDoc Arimo", sans-serif$/);
  await expect(toolbar.getByRole('button', { name: 'Font: Arial' })).toBeVisible();

  // Lora from the font menu, over the selection.
  await page.keyboard.press('ControlOrMeta+a');
  await toolbar.getByRole('button', { name: 'Font: Arial' }).click();
  const menu = page.getByRole('menu', { name: 'Font' });
  await expect(menu.getByRole('menuitem', { name: /More fonts/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await menu.getByRole('menuitemradio', { name: 'Lora' }).click();
  await expect(body).toBeFocused();
  await expect(toolbar.getByRole('button', { name: 'Font: Lora' })).toBeVisible();
  await expect(body.locator('span', { hasText: 'Field notes' })).toHaveCSS('font-family', /Lora/);
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('11pt "LiveDoc Lora"')))
    .toBe(true);
  expect(
    fontFiles.some((path) => /\/_next\/static\/media\/lora-latin-400-normal\./.test(path)),
  ).toBe(true);
  // Never from elsewhere, though the canvas's Google stylesheet names a Lora too.
  const lora = fontFiles.filter((url) => /lora/i.test(url));
  const origin = new URL(page.url()).origin;
  expect(lora.length).toBeGreaterThan(0);
  expect(lora.every((url) => new URL(url).origin === origin)).toBe(true);

  // Recent: Lora now leads the menu; and the family stays after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('span', { hasText: 'Field notes' })).toHaveCSS('font-family', /Lora/);
  expectNoPageErrors(pageErrors);
});
