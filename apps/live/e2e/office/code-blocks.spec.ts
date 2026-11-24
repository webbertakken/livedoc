import { readFileSync } from 'node:fs';
import { CodeBlocks, Paragraph, readTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Insert > Building blocks > Code blocks (docs/specs/034-text-documents/objects.md "Code blocks"): a Python block goes
// in at the caret, typed as it is (no typing aids), Enter starting a line with its indent, its keywords coloured;
// Enter on an empty last line leaves it; the file holds one paragraph in the `Code (Python)` style.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('a code block is typed, highlighted, left, and written as a styled paragraph', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();

  await (
    await officeMenuItem(page, ['Insert', 'Building blocks', 'Code blocks', 'Python'])
  ).click();
  const block = body.locator('p.text-document-code-block');
  await expect(block).toHaveCount(1);
  await expect(block).toHaveAttribute('data-code-language', 'Python');

  // Typed as it is: no capital, no curly quote; Enter keeps the indent.
  await page.keyboard.type("def f(x):\n    return 'x'");
  await expect(block).toHaveText("def f(x):\n    return 'x'");
  const keyword = block.locator('.text-document-code-keyword').first();
  await expect(keyword).toHaveText('def');
  await expect(keyword).not.toHaveCSS(
    'color',
    await block.evaluate((e) => getComputedStyle(e).color),
  );
  await expect(block).toHaveCSS('font-family', /Roboto Mono/);

  // Enter on an empty last line leaves the block for Normal text.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('After');
  await expect(block).toHaveText("def f(x):\n    return 'x'");
  const paragraphs = body.locator(':scope > p');
  await expect(paragraphs.last()).toHaveText('After');
  await expect(paragraphs.last()).not.toHaveClass(/text-document-code-block/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('code-block.png') });

  // The file holds one paragraph in the language's code style (the new document is ODF).
  const download = await officeMenuItem(page, ['File', 'Download', 'OpenDocument format (.odt)']);
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const saved = test.info().outputPath('code.odt');
  await file.saveAs(saved);
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(read.ok).toBe(true);
  if (read.ok) {
    const code = read.document.body.find(
      (b): b is Paragraph =>
        b.type === 'paragraph' && CodeBlocks.of(read.document.styles, b.style) !== undefined,
    );
    expect(code && CodeBlocks.of(read.document.styles, code.style)).toEqual({ language: 'python' });
    expect(code && Paragraph.text(code)).toBe("def f(x):\n    return 'x'");
  }
  expectNoPageErrors(pageErrors);
});
