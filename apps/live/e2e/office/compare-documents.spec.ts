import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Tools > Compare documents (docs/specs/034-text-documents/review.md "Compare documents"): the person's other text
// document is chosen, the differences attributed to a name; the comparison is a new document that opens in a new
// browser tab, each difference a suggestion from that name, "From the comparison".

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const CARD = '[data-suggestion-card]';

test.use({ colorScheme: 'dark' });

async function written(page: Page, text: string): Promise<void> {
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type(text);
  // Stored in the room before the next document is made.
  await expect(page.locator('[data-save-status]').first()).toHaveAttribute(
    'data-save-status',
    'saved',
  );
}

test('compares two text documents into a new document of suggestions', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await written(page, 'The quick fox jumps.');
  await written(page, 'The slow fox jumps.');

  await (await officeMenuItem(page, ['Tools', 'Compare documents'])).click();
  const dialog = page.getByRole('dialog', { name: 'Compare documents' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Suggestions in either document are left out.')).toBeVisible();
  const compare = dialog.getByRole('button', { name: 'Compare', exact: true });
  await expect(compare).toBeDisabled();
  await dialog.getByRole('radio').first().check();
  await dialog.getByRole('textbox', { name: 'Attribute differences to' }).fill('Reviewer');
  await page.screenshot({ path: test.info().outputPath('compare-dialog.png') });
  await compare.click();

  const ready = page.getByRole('dialog', { name: 'Comparison ready' });
  await expect(ready).toBeVisible();
  const [comparison] = await Promise.all([
    page.context().waitForEvent('page'),
    ready.getByRole('button', { name: 'Open' }).click(),
  ]);
  await comparison.setViewportSize({ width: 1440, height: 900 });
  await expect(comparison.locator(READY)).toBeVisible();
  const card = comparison.locator(CARD);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Reviewer');
  await expect(card).toContainText('From the comparison');
  await expect(card).toContainText('Replace: “slow” with “quick”');
  await comparison.screenshot({ path: test.info().outputPath('compare-result.png') });
  expectNoPageErrors(pageErrors);
});
