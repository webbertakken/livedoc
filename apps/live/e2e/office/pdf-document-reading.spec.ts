import { FIXTURE_LINE, labelledPdf, textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// A PDF's pages for assistive technology (docs/specs/035-pdf-documents/accessibility.md "The accessible tree"): one
// landmark a page, named with the file's label where it gives one; a page near view reads its text as paragraphs.

test('a PDF’s page reads its text as paragraphs to assistive technology', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Field guide.pdf', await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  const first = page.getByRole('region', { name: 'Page 1 of 2', exact: true });
  await expect(first).toMatchAriaSnapshot(`
    - region "Page 1 of 2":
      - paragraph: ${FIXTURE_LINE}
      - paragraph: Page 1
  `);

  expectNoPageErrors(pageErrors);
});

test('a PDF’s page landmark carries the label the file gives it', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Labelled.pdf', labelledPdf());
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  await expect(page.getByRole('region', { name: 'Page 1 of 3 (i)', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Page 3 of 3 (A-1)', exact: true })).toBeAttached();

  expectNoPageErrors(pageErrors);
});
