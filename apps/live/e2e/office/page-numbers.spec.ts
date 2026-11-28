import { writeFileSync } from 'node:fs';
import { TextDocument, writeTextDocumentFile, type Block } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Page numbers drawn (docs/specs/034-text-documents/page-layout.md "Page numbers"): a Word file's footer "Page N of M"
// shows each page's number and the page count; a second section starting at 7 counts on from 7; a page count in the
// body shows the count; a header being edited shows its page's number.

const TEXT =
  'Every page counts itself in its footer, and the second section starts its numbering again from seven.';

function wordFile(path: string) {
  const paragraphs = (from: number, count: number) =>
    TextDocument.fromTexts(
      Array.from({ length: count }, (_, i) => `Paragraph ${from + i}. ${TEXT}`),
      { format: 'ooxml' },
    ).body;
  const base = TextDocument.fromTexts(['x'], { format: 'ooxml' });
  const normal = (base.body[0] as Extract<Block, { type: 'paragraph' }>).style;
  const counted: Block = {
    type: 'paragraph',
    style: normal,
    props: {},
    inlines: [
      { type: 'run', text: 'Pages in all: ', props: {} },
      { type: 'field', field: 'page-count', text: '0', props: {} },
    ],
  };
  const footer = {
    blocks: [
      {
        type: 'paragraph' as const,
        style: normal,
        props: {},
        inlines: [
          { type: 'run' as const, text: 'Page ', props: {} },
          { type: 'field' as const, field: 'page-number' as const, text: '0', props: {} },
          { type: 'run' as const, text: ' of ', props: {} },
          { type: 'field' as const, field: 'page-count' as const, text: '0', props: {} },
        ],
      },
    ],
  };
  const document: TextDocument = {
    ...base,
    section: { ...base.section, headers: { footer: { default: footer } } },
    body: [
      counted,
      ...paragraphs(1, 30),
      { type: 'section', start: 'next-page', setup: base.section.setup, numberStart: 7 },
      ...paragraphs(31, 4),
    ],
  };
  const written = writeTextDocumentFile(document, 'docx');
  writeFileSync(path, written.bytes);
}

test('page numbers and the page count are drawn on every page, a section starting again at 7', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();

  const file = test.info().outputPath('numbered.docx');
  wordFile(file);
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(file);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('numbered');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();

  const footer = (sheet: number) =>
    page.locator(`[data-page-sheet="${sheet}"] [data-page-story="footer"]`);
  const sheets = page.locator('[data-page-sheet]');
  await expect(footer(1)).toHaveText(/^Page 1 of \d+$/);
  const count = await sheets.count();
  expect(count).toBeGreaterThanOrEqual(3);
  await expect(footer(1)).toHaveText(`Page 1 of ${count}`);
  await expect(footer(2)).toHaveText(`Page 2 of ${count}`);
  // The last page is the second section's first: it starts at 7.
  await expect(footer(count)).toHaveText(`Page 7 of ${count}`);
  await expect(
    page.locator('[role="textbox"][aria-label="Document body"] [data-field="page-count"]'),
  ).toHaveText(String(count));
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('page-numbers.png') });

  // Editing page 2's footer shows page 2's number in it.
  await footer(2).evaluate((box) => box.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('page-numbers-footer.png') });
  const second = await footer(2).boundingBox();
  await page.mouse.dblclick(second!.x + second!.width / 2, second!.y + second!.height / 2);
  const editor = page.getByRole('textbox', { name: 'Footer' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText(`Page 2 of ${count}`);
  await page.keyboard.press('Escape');
  expectNoPageErrors(pageErrors);
});

// Insert > Page numbers' preset Footer, not the first page; Page count at the caret; Format > Page numbers' Start at,
// taken back with one undo.
test('page numbers put in from the Insert menu and the Page numbers dialog', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator('[role="textbox"][aria-label="Document body"]');
  await body.click();
  for (let i = 0; i < 30; i++) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.insertText(`Paragraph ${i + 1}. ${TEXT}`);
  }
  await expect(page.locator('[data-page-sheet="2"]')).toBeVisible();
  const footer = (sheet: number) =>
    page.locator(`[data-page-sheet="${sheet}"] [data-page-story="footer"]`);

  await (
    await officeMenuItem(page, ['Insert', 'Page numbers', 'Footer, not the first page'])
  ).click();
  await expect(footer(2)).toHaveText('2');
  await expect(footer(1)).toHaveCount(0);

  await page.keyboard.press('Control+Home');
  await (await officeMenuItem(page, ['Insert', 'Page numbers', 'Page count'])).click();
  const count = await page.locator('[data-page-sheet]').count();
  await expect(body.locator('[data-field="page-count"]')).toHaveText(String(count));

  await (await officeMenuItem(page, ['Format', 'Page numbers'])).click();
  const dialog = page.getByRole('dialog', { name: 'Page numbers' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: 'Footer' }).check();
  await dialog.getByRole('checkbox', { name: 'Show on first page' }).uncheck();
  await dialog.getByRole('radio', { name: 'Start at' }).check();
  await dialog.getByRole('textbox', { name: 'Start at' }).fill('10');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('page-numbers-dialog.png') });
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(footer(2)).toHaveText('11');
  await page.keyboard.press('Control+Z');
  await expect(footer(2)).toHaveText('2');
  expectNoPageErrors(pageErrors);
});
