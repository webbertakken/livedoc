import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Imports (docs/specs/034-text-documents/files-and-print.md "Opening"): a Markdown file opened from the computer
// becomes a new OpenDocument text document named after the file, its heading, list items, code and table in place.

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
  expectNoPageErrors(pageErrors);
});
