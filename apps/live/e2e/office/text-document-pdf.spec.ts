import { readFileSync } from 'node:fs';
import { createPdfEngine } from '@livedoc/pdf-documents/engine';
import { readerWasm } from '@livedoc/pdf-documents/testing';
import { PageTags, type TagNode } from '@livedoc/pdf-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Download as PDF (docs/specs/034-text-documents/files-and-print.md "Downloading", PDF): the pages as laid out, text as
// text, a heading in the outline, a link live, tagged. Read back by the PDF engine, as any reader would.

const BODY = '[role="textbox"][aria-label="Document body"]';
const LINK_EDITOR = '[data-office-link-editor]';

const types = (nodes: readonly (TagNode | string)[]): string[] =>
  nodes.flatMap((node) => (typeof node === 'string' ? [] : [node.type, ...types(node.kids)]));

test('a text document downloads as a tagged PDF of its pages', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  // Heading 1, a paragraph with a link, a bulleted item.
  await page.keyboard.press('Control+Alt+1');
  await page.keyboard.type('Quarterly plan');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Read the guide now');
  await page.keyboard.press('End');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Control+k');
  await expect(page.locator(LINK_EDITOR)).toBeVisible();
  await page.keyboard.type('example.com');
  await page.keyboard.press('Enter');
  await expect(body.locator('a')).toHaveText('guide');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Shift+8');
  await page.keyboard.type('First step');

  const item = await officeMenuItem(page, ['File', 'Download', 'PDF document (.pdf)']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const path = test.info().outputPath('export.pdf');
  await download.saveAs(path);
  // The dialog goes once the PDF is made, and the page is the editor's again.
  await expect(page.getByRole('dialog', { name: 'Making the PDF' })).toHaveCount(0);
  await expect(page.locator('[data-printing]')).toHaveCount(0);

  const engine = await createPdfEngine({ wasm: readerWasm() });
  const opened = await engine.open(new Uint8Array(readFileSync(path)));
  expect(opened.ok).toBe(true);
  if (!opened.ok) return;
  expect(opened.pages).toHaveLength(1);
  // A4 or Letter, as the setup says.
  expect(opened.pages[0]!.width).toBeGreaterThan(590);
  const text = (await engine.pageText(0))!.text.replace(/\s+/g, ' ');
  expect(text).toContain('Quarterly plan');
  expect(text).toContain('Read the guide now');
  expect(text).toContain('First step');
  const outline = await engine.outline();
  expect(outline.items.map((each) => each.title)).toEqual(['Quarterly plan']);
  const links = await engine.links(0);
  expect(links.map((link) => link.target)).toEqual([
    { kind: 'address', address: 'https://example.com/' },
  ]);
  const read = PageTags.read(await engine.pageTags(0), await engine.pageText(0));
  expect(read.source).toBe('tags');
  if (read.source === 'tags')
    expect(types(read.nodes)).toEqual(
      expect.arrayContaining(['H1', 'P', 'Link', 'L', 'LI', 'Lbl', 'LBody']),
    );
  await engine.close();
  expectNoPageErrors(pageErrors);
});

test('a text document’s PDF copy is kept in LiveDoc as a PDF document naming its source', async ({
  page,
  context,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('Kept words');

  await (await officeMenuItem(page, ['File', 'Keep a PDF copy in LiveDoc'])).click();
  const dialog = page.getByRole('dialog', { name: 'Keeping a PDF copy' });
  await expect(dialog.getByRole('status')).toHaveText(/^Kept a PDF copy of “.+”\.$/, {
    timeout: 30_000,
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('kept-copy.png') });
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    dialog.getByRole('button', { name: 'Open' }).click(),
  ]);
  await expect(dialog).toHaveCount(0);
  await expect(opened.locator('[data-pdf-surface="ready"]')).toBeVisible({ timeout: 30_000 });
  await expect(opened.getByText('Kept words')).toBeVisible({ timeout: 30_000 });
  expectNoPageErrors(pageErrors);
});
