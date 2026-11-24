import { FIXTURE_LINE, labelledPdf, taggedPdf, textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// A PDF's pages for assistive technology (docs/specs/035-pdf-documents/accessibility.md "The accessible tree"): one
// landmark a page, named with the file's label where it gives one; a page near view reads the file's tags where they
// cover it, else its text as paragraphs.

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

test('a tagged PDF’s page reads its headings, list, table and figure from the file’s tags', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Annual report.pdf', taggedPdf());
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  // The tags' order, not the order the page draws them in; the page number, an artifact, is not read.
  await expect(page.getByRole('region', { name: 'Page 1 of 2', exact: true })).toMatchAriaSnapshot(`
    - region "Page 1 of 2":
      - heading "Annual report" [level=1]
      - paragraph: The year began quietly and ended with a record.
      - list:
        - listitem: 1. Plant more trees
      - table:
        - row:
          - columnheader "Name"
          - columnheader "Score"
        - row:
          - cell "Ada"
          - cell "9"
      - img "A red square"
  `);
  // A line no tag reaches: the page reads from geometry, so nothing is left out.
  await expect(page.getByRole('region', { name: 'Page 2 of 2', exact: true })).toMatchAriaSnapshot(`
    - region "Page 2 of 2":
      - paragraph: Tagged words
      - paragraph: Words no tag reaches
  `);

  expectNoPageErrors(pageErrors);
});
