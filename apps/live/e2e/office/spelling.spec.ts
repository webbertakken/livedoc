import { expect, expectNoPageErrors, test } from '../fixtures';

// Spelling (docs/specs/034-text-documents/tools.md "Spelling and grammar"): where LiveDoc ships the language's
// dictionary it underlines misspelt words itself and the browser's own check is off; a right-click on one offers its
// suggestions, Add to dictionary and Ignore; elsewhere the browser's own check stays on and LiveDoc draws nothing.

const BODY = '[role="textbox"][aria-label="Document body"]';
const MISSPELT = '.text-document-misspelt';

test.use({ colorScheme: 'dark' });

test.describe('in Dutch', () => {
  test.use({ locale: 'nl-NL' });

  test('underlines a misspelt word and fixes it from the context menu', async ({
    page,
    pageErrors,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/new?kind=text-document');
    await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
    const body = page.locator(BODY);
    await expect(body).toHaveAttribute('spellcheck', 'false');
    await body.click();
    await page.keyboard.type('Hius en tuin: het hius is mooi, een Livedocisch woord.');

    // The caret left each word as the sentence went on: each misspelt word underlined.
    await expect(body.locator(MISSPELT)).toHaveText(['Hius', 'hius', 'Livedocisch']);
    await page.screenshot({ path: test.info().outputPath('spelling-underlines.png') });

    await body.locator(MISSPELT).nth(1).click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Context menu' });
    await expect(menu.getByRole('menuitem').first()).toHaveText(/^huis/);
    await page.screenshot({ path: test.info().outputPath('spelling-context-menu.png') });
    await menu.getByRole('menuitem').first().click();
    await expect(body).toContainText('het huis is mooi');
    await expect(body.locator(MISSPELT)).toHaveText(['Hius', 'Livedocisch']);

    // Undo takes the suggestion back as one step.
    await page.keyboard.press('Control+z');
    await expect(body).toContainText('het hius is mooi');

    await body
      .locator(MISSPELT)
      .filter({ hasText: /^Livedocisch$/ })
      .click({ button: 'right' });
    await menu.getByRole('menuitem', { name: /^Add to dictionary/ }).click();
    await expect(body.locator(MISSPELT).filter({ hasText: /^Livedocisch$/ })).toHaveCount(0);

    await body.locator(MISSPELT).first().click({ button: 'right' });
    await menu.getByRole('menuitem', { name: /^Ignore/ }).click();
    await expect(body.locator(MISSPELT).filter({ hasText: /^Hius$/ })).toHaveCount(0);
    await expect(body.locator(MISSPELT)).toHaveText(['hius']);
    expectNoPageErrors(pageErrors);
  });
});

test.describe('in German, which LiveDoc ships no dictionary for', () => {
  test.use({ locale: 'de-DE' });

  test('keeps the browser’s own check on and draws nothing itself', async ({
    page,
    pageErrors,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/new?kind=text-document');
    await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
    const body = page.locator(BODY);
    await body.click();
    await page.keyboard.type('Der Hnud bellt laut. ');
    await expect(body).toHaveAttribute('spellcheck', 'true');
    // Long enough for a read to have run, were there one.
    await page.waitForTimeout(1_000);
    await expect(body.locator(MISSPELT)).toHaveCount(0);
    expectNoPageErrors(pageErrors);
  });
});
