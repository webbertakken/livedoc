import { readFileSync } from 'node:fs';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Plain Text and Markdown (docs/specs/034-text-documents/files-and-print.md "Downloading"): a heading and a bulleted
// item typed here leave as a line each, and as Markdown's heading and list item.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('a text document downloads as Plain Text and Markdown', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  // Heading 1 (Ctrl+Alt+1), then a bulleted item (Ctrl+Shift+8) with an italic word (Ctrl+I).
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('1');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await page.keyboard.type('Plan');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Shift+8');
  await page.keyboard.type('First ');
  await page.keyboard.press('Control+i');
  await page.keyboard.type('step');
  await expect(body.locator('em, [style*="italic"]').filter({ hasText: 'step' })).toHaveCount(1);

  const save = async (label: string, name: string) => {
    const item = await officeMenuItem(page, ['File', 'Download', label]);
    const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${name}$`));
    const path = test.info().outputPath(`export.${name}`);
    await download.saveAs(path);
    return readFileSync(path, 'utf8');
  };
  expect(await save('Plain Text (.txt)', 'txt')).toBe('Plan\n● First step\n');
  expect(await save('Markdown (.md)', 'md')).toBe('# Plan\n\n- First *step*\n');
  expectNoPageErrors(pageErrors);
});
