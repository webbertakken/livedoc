import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Spelling (docs/specs/034-text-documents/tools.md "Spelling and grammar"): where LiveDoc ships the language's
// dictionary it underlines misspelt words itself and the browser's own check is off; a right-click on one offers its
// suggestions, Add to personal dictionary and Ignore; elsewhere the browser's own check stays on and LiveDoc draws nothing.

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
    // Shot once the menu has finished fading in.
    await menu.evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((x) => x.finished)),
    );
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
    await menu.getByRole('menuitem', { name: /^Add to personal dictionary/ }).click();
    await expect(body.locator(MISSPELT).filter({ hasText: /^Livedocisch$/ })).toHaveCount(0);

    await body.locator(MISSPELT).first().click({ button: 'right' });
    await menu.getByRole('menuitem', { name: /^Ignore/ }).click();
    await expect(body.locator(MISSPELT).filter({ hasText: /^Hius$/ })).toHaveCount(0);
    await expect(body.locator(MISSPELT)).toHaveText(['hius']);
    expectNoPageErrors(pageErrors);
  });
});

test.describe('the card, the keys, the dictionary and a header, in Dutch', () => {
  test.use({ locale: 'nl-NL' });

  test('walks the misspellings, steps with the keys, and keeps the dictionary', async ({
    page,
    pageErrors,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/new?kind=text-document');
    await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
    const body = page.locator(BODY);
    await body.click();
    // A header with a misspelling first: checked as the body is.
    await (await officeMenuItem(page, ['Insert', 'Headers & footers', 'Header'])).click();
    const editor = page.getByRole('textbox', { name: 'Header' });
    await expect(editor).toBeFocused();
    await page.keyboard.type('Het hius. ');
    await expect(editor.locator(MISSPELT)).toHaveText(['hius']);
    await page.keyboard.press('Escape');
    await expect(body).toBeFocused();
    await page.keyboard.type('Een fietss en een hius in de zee. ');
    await expect(body.locator(MISSPELT)).toHaveText(['fietss', 'hius']);

    // Ctrl+' and Ctrl+; select the next and the previous, wrapping.
    await page.keyboard.press('Control+Home');
    await page.keyboard.press("Control+'");
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('fietss');
    await page.keyboard.press('Control+;');
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('hius');

    // Ctrl+Alt+X: the card, from the caret; Accept puts the suggestion in and moves on.
    await page.keyboard.press('Control+Home');
    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.keyboard.press('x');
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');
    const card = page.getByRole('dialog', { name: 'Spelling and grammar' });
    await expect(card).toContainText('Change fietss to');
    await expect(card.getByRole('radio', { name: 'fiets', exact: true })).toBeChecked();
    await expect(card.getByRole('radio', { name: 'fiets', exact: true })).toBeFocused();
    await page.screenshot({ path: test.info().outputPath('spelling-card.png') });
    await card.getByRole('button', { name: /^Accept$/ }).click();
    await expect(body).toContainText('Een fiets en');
    await expect(card).toContainText('Change hius to');
    await card.getByRole('button', { name: /^Add to personal dictionary$/ }).click();
    await expect(body.locator(MISSPELT)).toHaveCount(0);
    await expect(card.getByRole('status')).toHaveText('No spelling suggestions');
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await expect(body).toBeFocused();

    // The dialog lists the word; removing it brings its underlines back.
    await (
      await officeMenuItem(page, ['Tools', 'Spelling and grammar', 'Personal dictionary'])
    ).click();
    const dialog = page.getByRole('dialog', { name: 'Personal dictionary' });
    await expect(dialog.getByRole('listitem')).toHaveText(['hius']);
    await page.screenshot({ path: test.info().outputPath('personal-dictionary.png') });
    await dialog.getByRole('button', { name: 'Remove hius' }).click();
    await expect(dialog.getByText('No words yet')).toBeVisible();
    await dialog.getByRole('button', { name: /^Close/ }).click();
    await expect(body.locator(MISSPELT)).toHaveText(['hius']);

    // Show spelling suggestions off: no underline anywhere.
    await (
      await officeMenuItem(page, ['Tools', 'Spelling and grammar', 'Show spelling suggestions'])
    ).click();
    await expect(page.locator(MISSPELT)).toHaveCount(0);
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
