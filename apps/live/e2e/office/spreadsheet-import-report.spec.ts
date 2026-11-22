import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The import report (plan 0020 Phase 7; docs/specs/029-sheets/files-and-print.md "The import report", D120): a file
// that left something behind opens its spreadsheet with the report, a line a kind; OK closes it, and it shows once.

const READY = '[data-spreadsheet-surface="ready"]';

test('a file that left something behind opens with the import report, once', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const from = page.url();

  // A cell's text past the 50,000 characters a cell holds.
  const dir = mkdtempSync(join(tmpdir(), 'livedoc-report-'));
  const csv = join(dir, 'Long.csv');
  writeFileSync(csv, `Note,Size\r\n${'x'.repeat(50_001)},1\r\n`);
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(csv);
  await page.waitForURL((url) => url.href !== from);
  await expect(page.locator(READY)).toBeVisible();

  const report = page.getByRole('dialog', { name: 'Opened “Long”' });
  await expect(report).toBeVisible();
  await expect(report).toContainText('Some of what the file holds is not in the spreadsheet:');
  await expect(report.getByRole('listitem')).toHaveText([
    '1 cell’s text is cut to 50,000 characters',
  ]);
  await test.info().attach('import-report', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await report.getByRole('button', { name: 'OK' }).click();
  await expect(report).toBeHidden();

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
