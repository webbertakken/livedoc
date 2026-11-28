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
  await page.keyboard.type('# Plan');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- first *step*');
  await expect(body.locator('li, p').filter({ hasText: 'first step' })).toHaveCount(1);

  const save = async (label: string, name: string) => {
    const item = await officeMenuItem(page, ['File', 'Download', label]);
    const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${name}$`));
    const path = test.info().outputPath(`export.${name}`);
    await download.saveAs(path);
    return readFileSync(path, 'utf8');
  };
  expect(await save('Plain Text (.txt)', 'txt')).toBe('Plan\n● first step\n');
  expect(await save('Markdown (.md)', 'md')).toBe('# Plan\n\n- first *step*\n');
  expectNoPageErrors(pageErrors);
});
