import { writeFileSync } from 'node:fs';
import { TextDocument, writeTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Headers and footers drawn (docs/specs/034-text-documents/page-layout.md "Headers and footers"): a Word file's first
// page header on page 1, its even page header on page 2, its default header and footer on page 3; the first page
// header, taller than its room, pushes the body's first line down; on a phone no header or footer is drawn.

const BODY = '[role="textbox"][aria-label="Document body"]';
const TEXT =
  'A header and a footer stand in the margins of every page, drawn from the writing the section holds for them.';

function wordFile(path: string) {
  const blocks = (...texts: string[]) => TextDocument.fromTexts(texts, { format: 'ooxml' }).body;
  const document = TextDocument.fromTexts(
    Array.from({ length: 90 }, (_, i) => `Paragraph ${i + 1}. ${TEXT}`),
    { format: 'ooxml' },
  );
  const headed = {
    ...document,
    section: {
      ...document.section,
      headers: {
        header: {
          default: { blocks: blocks('Running header') },
          first: {
            blocks: blocks('Title line one', 'Title line two', 'Title line three', 'Four', 'Five'),
          },
          even: { blocks: blocks('Even page header') },
        },
        footer: { default: { blocks: blocks('Page footer') } },
        differentFirst: true as const,
        differentOddEven: true as const,
      },
    },
  };
  const written = writeTextDocumentFile(headed, 'docx');
  if (!written.ok) throw new Error(written.rejection);
  writeFileSync(path, written.bytes);
}

test('a Word file’s headers and footers are drawn in each page’s margins, a tall one pushing the body', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();

  const file = test.info().outputPath('headers.docx');
  wordFile(file);
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(file);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('headers');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();

  const story = (sheet: number, kind: 'header' | 'footer') =>
    page.locator(`[data-page-sheet="${sheet}"] [data-page-story="${kind}"]`);
  await expect(story(1, 'header')).toContainText('Title line one');
  await expect(story(2, 'header')).toHaveText('Even page header');
  await expect(story(3, 'header')).toHaveText('Running header');
  // The first page has no first page footer, the even page no even one; page 3 the default.
  await expect(story(1, 'footer')).toHaveCount(0);
  await expect(story(2, 'footer')).toHaveCount(0);
  await expect(story(3, 'footer')).toHaveText('Page footer');

  // The first page header, five lines in a room of half an inch, pushes the first line below it.
  const pushed = await page.evaluate((body) => {
    const sheet = document.querySelector('[data-page-sheet="1"]')!.getBoundingClientRect();
    const header = document
      .querySelector('[data-page-sheet="1"] [data-page-story="header"]')!
      .getBoundingClientRect();
    const first = document.querySelector(`${body} > p`)!.getBoundingClientRect();
    return { headerBottom: header.bottom - sheet.top, firstTop: first.top - sheet.top };
  }, BODY);
  expect(pushed.headerBottom).toBeGreaterThan(96);
  expect(Math.abs(pushed.firstTop - pushed.headerBottom)).toBeLessThanOrEqual(1);
  // Never read with the body.
  await expect(page.locator(BODY)).not.toContainText('Running header');
  await page.screenshot({ path: test.info().outputPath('headers-and-footers.png') });

  // On a phone the writing flows to the window: no header or footer is drawn.
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.locator('[data-page-story]')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
