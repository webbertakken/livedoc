import { expect, expectNoPageErrors, test } from '../fixtures';
import { taggedPdf } from '@livedoc/pdf-documents/testing';
import { officeMenuItem } from './office-menus';

// Imports (docs/specs/034-text-documents/files-and-print.md "Opening"): a Markdown or HTML file opened from the
// computer becomes a new OpenDocument text document named after the file, its heading, list items, code and table in
// place; a page's script is never read, and the import report says so once, reopened by File > Security limitations.

const BODY = '[role="textbox"][aria-label="Document body"]';
const MARKDOWN = [
  '# Launch plan',
  '',
  'The **first** step.',
  '',
  '- Write it',
  '- Ship it',
  '',
  '```ts',
  'const ready = true;',
  '```',
  '',
  '| Who | What |',
  '| --- | --- |',
  '| Ann | Docs |',
].join('\n');

test('a Markdown file opens as a new text document', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles({
    name: 'Launch notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(MARKDOWN),
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Launch notes');
  const body = page.locator(BODY);
  await expect(body).toContainText('Launch plan');
  await expect(
    body.locator('[style*="font-weight: 700"]').filter({ hasText: 'first' }),
  ).toHaveCount(1);
  await expect(body).toContainText('Ship it');
  await expect(body).toContainText('const ready = true;');
  await expect(body.locator('table')).toHaveCount(1);
  await expect(body.locator('table')).toContainText('Ann');
  await expect(page.getByText('.ODT', { exact: true })).toBeVisible();
  // Nothing was left out: no import report.
  await expect(page.locator('[data-import-report]')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});

const HTML =
  '<!doctype html><html lang="en"><body><h1>Quarterly</h1><p>Revenue <em>grew</em>.</p><ul><li>North</li><li>South</li></ul><table><tr><th>Q</th><th>Sum</th></tr><tr><td>Q3</td><td>12</td></tr></table><script>document.title = "pwned"</script></body></html>';

test('an HTML file opens as a new text document, its script never read', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles({ name: 'Report.html', mimeType: 'text/html', buffer: Buffer.from(HTML) });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Report');
  const body = page.locator(BODY);
  await expect(body).toContainText('Quarterly');
  await expect(
    body.locator('[style*="font-style: italic"]').filter({ hasText: 'grew' }),
  ).toHaveCount(1);
  await expect(body).toContainText('South');
  await expect(body.locator('table')).toContainText('Q3');
  await expect(body).not.toContainText('pwned');
  const report = page.getByRole('dialog', { name: 'Opened “Report”' });
  await expect(report).toContainText('1 script, frame or control left out, never run: script');
  await report.getByRole('button', { name: 'OK' }).click();
  await expect(report).toBeHidden();
  await (await officeMenuItem(page, ['File', 'Security limitations'])).click();
  const limits = page.getByRole('dialog', { name: 'Security limitations' });
  await expect(limits).toContainText('Opened from a .html file');
  await expect(limits).toContainText('never run: script');
  await page.keyboard.press('Escape');
  await expect(limits).toBeHidden();
  // Shown once: a later visit does not show it again unasked.
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(page.locator('[data-import-report]')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});

const RTF =
  '{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\stylesheet{\\s1\\outlinelevel0 heading 1;}}\\pard\\s1 Minutes\\par\\pard Agreed {\\b unanimously}.\\par}';

test('a Rich Text file opens as a new text document', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles({
    name: 'Minutes.rtf',
    mimeType: 'application/rtf',
    buffer: Buffer.from(RTF),
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Minutes');
  const body = page.locator(BODY);
  await expect(body).toContainText('Agreed');
  await expect(
    body.locator('[style*="font-weight: 700"]').filter({ hasText: 'unanimously' }),
  ).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});

// files-and-print.md "A PDF imported": read in this browser by the PDF engine, a tagged page by its tags (its page
// number, an artifact, left out), an untagged page by its lines; the report says the pictures were not read.
test('a PDF file opens as a new text document, its tags read', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles({
    name: 'Annual.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(taggedPdf()),
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Annual');
  const report = page.getByRole('dialog', { name: 'Opened “Annual”' });
  await expect(report).toContainText('pages read without their pictures');
  await report.getByRole('button', { name: 'OK' }).click();
  const body = page.locator(BODY);
  await expect(body).toContainText('Annual report');
  await expect(body).toContainText('Plant more trees');
  await expect(body.locator('table')).toContainText('Ada');
  await expect(body).toContainText('Tagged words');
  await expect(body).not.toContainText('Page 1');
  await expect(page.getByText('.ODT', { exact: true })).toBeVisible();
  expectNoPageErrors(pageErrors);
});
