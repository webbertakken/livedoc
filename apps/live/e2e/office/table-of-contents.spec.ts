import { readFileSync, writeFileSync } from 'node:fs';
import {
  Styles,
  TextDocument,
  readTextDocumentFile,
  writeTextDocumentFile,
  type Block,
} from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// docs/specs/034-text-documents/links-and-navigation.md "Table of contents": a file's table of contents opens as one
// read-only block, its entries drawn with their dotted tab to the page numbers; a press selects it whole; it is
// written back as one.

const BODY = '[role="textbox"][aria-label="Document body"]';

function contentsFile(path: string): void {
  const blank = TextDocument.blank({ format: 'ooxml', title: 'Report' });
  const style = (role: 'normal' | 'heading1') => Styles.idOfRole(blank.styles, role)!;
  const dotted = { tabStops: [{ position: 468, align: 'end' as const, leader: 'dot' as const }] };
  const entry = (text: string, id: string) => ({
    type: 'paragraph' as const,
    style: style('normal'),
    props: dotted,
    inlines: [{ type: 'run' as const, text, props: {}, link: `#${id}` }],
  });
  const heading = (text: string, id: string) => ({
    type: 'paragraph' as const,
    style: style('heading1'),
    props: {},
    inlines: [
      { type: 'bookmark' as const, name: id, props: {} },
      { type: 'run' as const, text, props: {} },
    ],
  });
  const body: Block[] = [
    {
      type: 'contents',
      look: 'dotted',
      levels: 3,
      entries: [entry('Introduction\t1', '_intro000001'), entry('Findings\t1', '_find0000001')],
    },
    heading('Introduction', '_intro000001'),
    heading('Findings', '_find0000001'),
  ];
  const written = writeTextDocumentFile({ ...blank, body }, 'docx');
  if (!written.ok) throw new Error(written.rejection);
  writeFileSync(path, written.bytes);
}

test('a file’s table of contents opens as one read-only block and is kept', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const file = test.info().outputPath('Report.docx');
  contentsFile(file);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(file);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Report');

  const body = page.locator(BODY);
  const contents = body.getByRole('navigation', { name: 'Table of contents' });
  await expect(contents).toHaveAttribute('contenteditable', 'false');
  await expect(contents).toHaveAttribute('data-look', 'dotted');
  await expect(contents.locator('p')).toHaveText(['Introduction\t1', 'Findings\t1']);

  // The tab leads to the page number at the right margin, dotted.
  const tab = contents.locator('.text-document-tab').first();
  await expect(tab).toHaveAttribute('data-leader', 'dot');
  await expect.poll(async () => (await tab.boundingBox())?.width ?? 0).toBeGreaterThan(300);

  // A press selects it whole.
  await contents.locator('p').first().click();
  await expect(contents).toHaveClass(/ProseMirror-selectednode/);
  await expect(contents).toHaveCSS('outline-style', 'solid');
  // Its laid-out tabs stay as the writing loses the focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect.poll(async () => (await tab.boundingBox())?.width ?? 0).toBeGreaterThan(300);
  // A double press selects it whole too, never a word inside it.
  await contents.locator('p').first().dblclick();
  await expect(contents).toHaveClass(/ProseMirror-selectednode/);
  expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('');
  await page.screenshot({ path: test.info().outputPath('table-of-contents-dotted.png') });
  // The screenshot writes to the page's elements and takes it back; the tabs stay laid out.
  await expect.poll(async () => (await tab.boundingBox())?.width ?? 0).toBeGreaterThan(300);

  // Written back as one.
  const download = await officeMenuItem(page, ['File', 'Download', 'Microsoft Word (.docx)']);
  const [saved] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const out = test.info().outputPath('Report-again.docx');
  await saved.saveAs(out);
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(out)));
  expect(read.ok).toBe(true);
  if (read.ok) {
    const block = read.document.body.find((b) => b.type === 'contents');
    expect(block?.type === 'contents' && block.look).toBe('dotted');
    expect(block?.type === 'contents' && block.entries).toHaveLength(2);
  }
  expectNoPageErrors(pageErrors);
});
