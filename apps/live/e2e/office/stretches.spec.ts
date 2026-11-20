import { expect, expectNoPageErrors, test } from '../fixtures';

// Several stretches of a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Selection"): a second
// stretch kept with Ctrl+Alt+Shift+→, both made bold at once, Escape keeping the last alone, and Select all matching
// text finding every stretch formatted alike.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('selects several stretches, formats them at once, and selects all matching text', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const stretches = body.locator('.text-document-stretch');
  await body.click();
  await page.keyboard.type('Alpha beta gamma');
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowRight');

  // Kept, a caret beside it, moved to gamma, and gamma selected from it.
  await page.keyboard.press('ControlOrMeta+Alt+Shift+ArrowRight');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowRight');
  await expect(stretches).toHaveText(['Alpha', 'gamma']);
  await expect(page.getByRole('status').filter({ hasText: 'stretches selected' })).toHaveText(
    '2 stretches selected',
  );
  await page.screenshot({ path: test.info().outputPath('stretches.png') });

  // Bold on both, none between.
  await page.keyboard.press('ControlOrMeta+B');
  const weight = (word: string) =>
    body.getByText(word, { exact: true }).evaluate((el) => getComputedStyle(el).fontWeight);
  expect(await weight('Alpha')).toBe('700');
  expect(await weight('gamma')).toBe('700');
  // The text between stays in the paragraph's own weight.
  expect(
    await body
      .locator('p')
      .first()
      .evaluate((p) => getComputedStyle(p).fontWeight),
  ).toBe('400');

  // Escape keeps the last stretch alone.
  await page.keyboard.press('Escape');
  await expect(stretches).toHaveCount(0);

  // Select all matching text, from the context menu on Alpha: every bold stretch.
  await body.getByText('Alpha', { exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Select all matching text' }).click();
  await expect(stretches).toHaveText(['Alpha', 'gamma']);
  expectNoPageErrors(pageErrors);
});
