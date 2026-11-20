import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The typing aids of a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Typing aids", tools.md
// "Preferences"): capitals, smart quotes, substitutions, links and lists as a person types; ⌘Z takes an aid back and
// keeps the typing; Tools > Preferences turns an aid off, kept after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('typing aids act as a person types, undo alone, and switch off in Preferences', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();

  await page.keyboard.type(`she said "it's (c) www.example.com" `);
  await expect(body.locator('p').first()).toHaveText('She said “it’s © www.example.com” ');
  await expect(body.locator('a')).toHaveAttribute('href', 'https://www.example.com');

  // ⌘Z takes the last aid back (the capital is long gone; the link goes), leaving what was typed.
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. ');
  await expect(body.locator('.text-document-list-marker')).toHaveText(['1.']);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body.locator('.text-document-list-marker')).toHaveCount(0);
  await expect(body.locator('p').nth(1)).toHaveText('1. ');
  await page.screenshot({ path: test.info().outputPath('typing-aids.png') });

  // Tools > Preferences: smart quotes off, kept after a reload.
  await (await officeMenuItem(page, ['Tools', 'Preferences'])).click();
  const dialog = page.getByRole('dialog', { name: 'Preferences' });
  await dialog.getByRole('checkbox', { name: 'Use smart quotes' }).uncheck();
  await dialog.getByRole('tab', { name: 'Substitutions' }).click();
  await page.screenshot({ path: test.info().outputPath('preferences.png') });
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await body.locator('p').last().click();
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  await page.keyboard.type('"x"');
  await expect(body.locator('p').last()).toHaveText('1. "x"');
  expectNoPageErrors(pageErrors);
});
