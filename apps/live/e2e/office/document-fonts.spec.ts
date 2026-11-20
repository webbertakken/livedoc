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

// More fonts (fonts.md "More fonts"): a family from Google Fonts added to My fonts, chosen from the menu, and loaded
// again as the document opens; one that cannot load is marked. Google Fonts is answered here, so the test needs no
// outside world: Rubik's stylesheet answers, Bungee's never does.
test('More fonts adds a family from Google Fonts to the font menu', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  const asked: string[] = [];
  await page.route('https://fonts.googleapis.com/css2**', async (route) => {
    const url = route.request().url();
    asked.push(url);
    if (url.includes('family=Bungee') && !url.includes('text=')) return route.abort();
    const families = [...url.matchAll(/family=([^:&]+)/g)].map((m) =>
      decodeURIComponent(m[1]!.replace(/\+/g, ' ')),
    );
    const css = families
      .map((f) => `@font-face { font-family: '${f}'; src: local('Arial'); }`)
      .join('\n');
    return route.fulfill({ contentType: 'text/css', body: css });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  await body.click();
  await page.keyboard.type('Field notes');

  // The Fonts dialog: search, add Rubik and Bungee, OK.
  await toolbar.getByRole('button', { name: 'Font: Arial' }).click();
  await page
    .getByRole('menu', { name: 'Font' })
    .getByRole('menuitem', { name: 'More fonts' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Fonts' });
  await expect(dialog.getByRole('listbox', { name: 'Fonts' })).toBeVisible();
  await expect(dialog.getByRole('option', { name: 'Arial' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // A row's preview is asked for once the list rests with it in view (PREVIEW_REST_MS): wait for Rubik's before the
  // search moves on, or the next search takes it out of view first.
  const previewed = (family: string) =>
    asked.some((url) => url.includes(`family=${family}`) && url.includes('text='));
  for (const family of ['Rubik', 'Bungee']) {
    await dialog.getByRole('searchbox', { name: 'Search fonts' }).fill(family);
    await dialog.getByRole('option', { name: family, exact: true }).click();
    if (family === 'Rubik') await expect.poll(() => previewed('Rubik')).toBe(true);
  }
  await expect(
    dialog
      .getByRole('region', { name: 'My fonts' })
      .getByRole('listitem')
      .filter({ hasText: 'Rubik' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toBeHidden();

  // Rubik from the menu, over the selection; Bungee marked as it could not load.
  await page.keyboard.press('ControlOrMeta+a');
  await toolbar.getByRole('button', { name: 'Font: Arial' }).click();
  const menu = page.getByRole('menu', { name: 'Font' });
  await expect(menu.getByRole('menuitemradio', { name: 'Bungee' })).toContainText(
    'Not available offline',
  );
  await menu.getByRole('menuitemradio', { name: 'Rubik' }).click();
  await expect(body).toBeFocused();
  await expect(body.locator('span', { hasText: 'Field notes' })).toHaveCSS('font-family', /Rubik/);
  const control = toolbar.getByRole('button', { name: 'Font: Rubik' });
  await expect(control.locator('span').first()).not.toHaveClass(/italic/);

  // As the document opens again, the family its text names loads from Google Fonts.
  await page.waitForTimeout(800);
  asked.length = 0;
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect.poll(() => asked.some((url) => url.includes('family=Rubik:ital,wght@'))).toBe(true);
  await expect(page.locator('link[data-google-font="Rubik"]')).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});
