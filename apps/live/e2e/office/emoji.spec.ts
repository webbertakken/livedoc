import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Insert > Emoji (docs/specs/034-text-documents/objects.md "Emoji"): the dialog browses the groups and searches names,
// tags and shortcodes; an emoji goes in at the caret in the skin tone chosen and the dialog stays open; the next
// opening starts on Recently used.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('emoji go in at the caret in the skin tone chosen, and come back as recently used', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Hi ');

  await (await officeMenuItem(page, ['Insert', 'Emoji'])).click();
  const dialog = page.getByRole('dialog', { name: 'Insert emoji' });
  const grid = dialog.getByRole('group', { name: 'Emoji' });
  await expect(dialog.getByRole('tab', { name: 'Smileys & emotion' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(grid.getByRole('button', { name: 'Grinning face', exact: true })).toBeVisible();
  await dialog.getByRole('tab', { name: 'People & body' }).click();
  await dialog.getByRole('combobox', { name: 'Skin tone' }).selectOption('Medium');
  const wave = grid.getByRole('button', { name: 'Waving hand', exact: true });
  await expect(wave).toHaveText('👋🏽');
  await wave.hover();
  await expect(dialog.locator('[data-emoji-preview]')).toContainText(':waving_hand:');
  await page.screenshot({ path: test.info().outputPath('emoji.png') });
  await wave.click();
  await expect(dialog).toBeVisible();

  await dialog.getByRole('searchbox', { name: 'Search emoji' }).fill('pizza');
  await grid.getByRole('button', { name: 'Pizza', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(body.locator(':scope > p').first()).toHaveText('Hi 👋🏽🍕');

  // One undo step each.
  await page.keyboard.press('Control+z');
  await expect(body.locator(':scope > p').first()).toHaveText('Hi 👋🏽');

  // The next opening starts on Recently used, newest first, each as inserted.
  await (await officeMenuItem(page, ['Insert', 'Emoji'])).click();
  await expect(dialog.getByRole('tab', { name: 'Recently used' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(grid.getByRole('button')).toHaveText(['🍕', '👋🏽']);
  await page.screenshot({ path: test.info().outputPath('emoji-recent.png') });
  expectNoPageErrors(pageErrors);
});

// Insert emoji using the colon character (objects.md "Emoji"): `:` and a name offers emoji under the caret; Enter puts
// the chosen one in place of what was typed; switched off in Preferences, nothing is offered.
test('the colon list offers emoji as a name is typed, until switched off', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Nice :thumbs');
  const list = page.getByRole('listbox', { name: 'Emoji' });
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(list.getByRole('option').first()).toHaveAccessibleName('Thumbs up');
  await expect(body).toHaveAttribute('aria-activedescendant', /.+/);
  await page.screenshot({ path: test.info().outputPath('emoji-colon.png') });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  await expect(body.locator(':scope > p').first()).toHaveText('Nice 👎');

  // Escape keeps the text as typed.
  await page.keyboard.type(' :smil');
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(body.locator(':scope > p').first()).toHaveText('Nice 👎 :smil');

  await (await officeMenuItem(page, ['Tools', 'Preferences'])).click();
  const preferences = page.getByRole('dialog', { name: 'Preferences' });
  await preferences
    .getByRole('checkbox', { name: 'Insert emoji using the colon character' })
    .uncheck();
  await preferences.getByRole('button', { name: 'OK' }).click();
  await body.focus();
  await page.keyboard.press('End');
  await page.keyboard.type(' :thumbs');
  await expect(body.locator(':scope > p').first()).toHaveText('Nice 👎 :smil :thumbs');
  await expect(list).toBeHidden();
  expectNoPageErrors(pageErrors);
});
