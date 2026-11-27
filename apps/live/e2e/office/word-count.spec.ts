import { expect, expectNoPageErrors, test } from '../fixtures';

// Word count (docs/specs/034-text-documents/tools.md "Word count"): Ctrl+Shift+C opens the dialog on the document's
// counts, a selection counted as its part; Display word count while typing keeps a box at the bottom left current as
// the person writes, and a press on it shows the next count; the setting stays on a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ colorScheme: 'dark' });

test('word count counts the writing and the selection, and keeps a count while typing', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('The cat sat on the mat.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('It purred.');

  await page.keyboard.press('Control+Shift+C');
  const dialog = page.getByRole('dialog', { name: 'Word count' });
  await expect(dialog).toBeVisible();
  const value = (row: string) =>
    dialog
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: row, exact: true }) })
      .getByRole('cell');
  await expect(value('Pages')).toHaveText('1');
  await expect(value('Words')).toHaveText('8');
  await expect(value('Characters')).toHaveText('33');
  await expect(value('Characters excluding spaces')).toHaveText('27');
  await dialog.getByRole('checkbox', { name: 'Display word count while typing' }).check();
  await page.screenshot({ path: test.info().outputPath('word-count-dialog.png') });
  await dialog.getByRole('button', { name: /^OK$/ }).click();
  await expect(dialog).toHaveCount(0);

  const box = page.getByRole('button', { name: /Show another count$/ });
  await expect(box).toHaveText('8 words');
  await expect(body).toBeFocused();
  await page.keyboard.type(' Then it slept.');
  await expect(box).toHaveText('11 words');
  await page.keyboard.press('Shift+Home');
  await expect(box).toHaveText('5 of 11 words');
  await page.screenshot({ path: test.info().outputPath('word-count-while-typing.png') });
  await box.click();
  await expect(box).toContainText('of 48 characters');

  // The setting is kept: after a reload the box is back (the selection may be kept too).
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(box).toHaveText(/11 words$/);
  expectNoPageErrors(pageErrors);
});
