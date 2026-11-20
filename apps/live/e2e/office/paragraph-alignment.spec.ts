import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Alignment and indents on a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Alignment and
// indents"): the shortcuts, the toolbar's Align control, Format > Align & indent, the indent steps and Indentation
// options set a paragraph's own formatting, drawn on the page and kept after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

// A British browser shows indents in centimetres (default).
test.use({ locale: 'en-GB' });

test('paragraphs are aligned and indented four ways, kept after a reload', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const first = body.locator('p').first();
  const second = body.locator('p').nth(1);

  await body.click();
  await page.keyboard.type('A centred line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('An indented paragraph');

  // Ctrl+Shift+E centres the first; the Align control reads it.
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+Shift+e');
  await expect(first).toHaveCSS('text-align', 'center');
  await expect(toolbar.getByRole('button', { name: 'Align & indent: Centre' })).toBeVisible();

  // The Align control's menu right-aligns it, then Format > Align & indent justifies it.
  await toolbar.getByRole('button', { name: 'Align & indent: Centre' }).click();
  await page
    .getByRole('menu', { name: 'Align & indent' })
    .getByRole('menuitemradio', { name: 'Right' })
    .click();
  await expect(body).toBeFocused();
  await expect(first).toHaveCSS('text-align', 'end');
  await (await officeMenuItem(page, ['Format', 'Align & indent', 'Justified'])).click();
  await expect(first).toHaveCSS('text-align', 'justify');

  // The second: Ctrl+] twice, the toolbar's Decrease indent once: 0.5 in.
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ControlOrMeta+]');
  await page.keyboard.press('ControlOrMeta+]');
  await expect(second).toHaveCSS('padding-left', '96px');
  await toolbar.getByRole('button', { name: 'Decrease indent' }).click();
  await expect(second).toHaveCSS('padding-left', '48px');

  // Indentation options: a hanging indent of 1.27 cm and a right indent of 2.54 cm.
  await (await officeMenuItem(page, ['Format', 'Align & indent', 'Indentation options'])).click();
  const dialog = page.getByRole('dialog', { name: 'Indentation options' });
  await expect(dialog.getByRole('textbox', { name: 'Left (cm)' })).toHaveValue('1.27');
  await dialog.getByRole('textbox', { name: 'Right (cm)' }).fill('2.54');
  await dialog.getByRole('combobox', { name: 'Special indent' }).selectOption('hanging');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  await expect(second).toHaveCSS('padding-right', '96px');
  await expect(second).toHaveCSS('text-indent', '-48px');

  // Kept after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('p').first()).toHaveCSS('text-align', 'justify');
  await expect(body.locator('p').nth(1)).toHaveCSS('padding-left', '48px');
  await expect(body.locator('p').nth(1)).toHaveCSS('text-indent', '-48px');
  expectNoPageErrors(pageErrors);
});
