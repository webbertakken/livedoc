import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Text formatting on a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Text formatting"): the
// shortcuts, the toolbar's toggles and size field, and Format > Text change the writing; what is set stays after a
// reload, since it is stored in the room like the words.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('bold, italic, size and capitalisation format a text document, kept after a reload', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const bold = toolbar.getByRole('button', { name: 'Bold' });
  const size = toolbar.getByRole('combobox', { name: 'Font size' });

  await body.click();
  await page.keyboard.type('quiet words here');
  await expect(size).toHaveValue('11');

  // Ctrl+B over the first word: drawn bold, and the toolbar shows it pressed.
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ControlOrMeta+ArrowRight');
  await page.keyboard.press('ControlOrMeta+b');
  const firstWord = body.locator('span', { hasText: 'quiet' }).first();
  await expect(firstWord).toHaveCSS('font-weight', '700');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');

  // The toolbar's Italic, then + twice and a typed size.
  await toolbar.getByRole('button', { name: 'Italic' }).click();
  await expect(body.locator('span', { hasText: 'quiet' }).last()).toHaveCSS('font-style', 'italic');
  await toolbar.getByRole('button', { name: 'Increase font size' }).click();
  await toolbar.getByRole('button', { name: 'Increase font size' }).click();
  await expect(size).toHaveValue('13');
  await size.fill('18');
  await size.press('Enter');
  await expect(body).toBeFocused();
  await expect(body.locator('span', { hasText: 'quiet' }).last()).toHaveCSS('font-size', '24px');

  // Moving the caret into plain text reads its formatting.
  await page.keyboard.press('End');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await expect(size).toHaveValue('11');

  // Format > Text > Capitalisation > Title Case over everything.
  await page.keyboard.press('ControlOrMeta+a');
  await expect(size).toHaveValue('');
  await (await officeMenuItem(page, ['Format', 'Text', 'Capitalisation', 'Title Case'])).click();
  await expect(body).toHaveText('Quiet Words Here');

  // Stored in the room: a reload shows the same.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body).toHaveText('Quiet Words Here');
  await expect(body.locator('span', { hasText: 'Quiet' }).first()).toHaveCSS('font-weight', '700');
  expectNoPageErrors(pageErrors);
});
