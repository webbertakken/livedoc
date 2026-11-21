import { writeFileSync } from 'node:fs';
import { TextDocument, writeTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import type { Page } from '@playwright/test';
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

async function writeLong(page: Page, count: number) {
  await page.locator(BODY).click();
  for (let i = 0; i < count; i++) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.insertText(`Paragraph ${i + 1}. ${TEXT}`);
  }
}

// page-layout.md "Editing headers and footers": Insert > Headers & footers > Header puts the caret in a new header;
// every page draws it as it is typed; bold and undo work in it; Escape leaves; a double-click in a page's bottom margin
// enters its footer, and one left empty is taken away.
test('a header made from the Insert menu is typed on every page, and an empty footer goes', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await writeLong(page, 30);
  await expect(page.locator('[data-page-sheet="2"]')).toBeVisible();
  await page.keyboard.press('Control+Home');

  await (await officeMenuItem(page, ['Insert', 'Headers & footers', 'Header'])).click();
  const editor = page.getByRole('textbox', { name: 'Header' });
  await expect(editor).toBeFocused();
  await expect(page.locator('[data-editing-story="header"]')).toBeVisible();
  await page.keyboard.type('Quarterly ');
  await page.keyboard.press('Control+B');
  await page.keyboard.type('report');
  // Every other page draws it as it is typed, the bold too.
  const second = page.locator('[data-page-sheet="2"] [data-page-story="header"]');
  await expect(second).toHaveText('Quarterly report');
  await expect(second.locator('span', { hasText: 'report' })).toHaveCSS('font-weight', '700');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('header-editing.png') });
  // Undo in the header takes back its own typing.
  await page.keyboard.press('Control+Z');
  await expect(editor).not.toContainText('report');
  await page.keyboard.press('Control+Shift+Z');
  await expect(editor).toHaveText('Quarterly report');

  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(page.locator(BODY)).toBeFocused();
  await expect(page.locator('[data-page-sheet="1"] [data-page-story="header"]')).toHaveText(
    'Quarterly report',
  );

  // A double-click in page 1's bottom margin enters its footer; left empty, it goes.
  // Page 1's foot scrolled into view first.
  await page.locator('[data-region="document"]').evaluate((scroller) => scroller.scrollBy(0, 500));
  const sheet = await page.locator('[data-page-sheet="1"]').boundingBox();
  await page.mouse.dblclick(sheet!.x + sheet!.width / 2, sheet!.y + sheet!.height - 30);
  await expect(page.getByRole('textbox', { name: 'Footer' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Footer' })).toHaveCount(0);
  await expect(page.locator('[data-page-story="footer"]')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});

// "The bar": Different first page gives page 1 a header of its own, page 2 keeping the default; Options > Remove
// header takes page 1's away; Alt+F10 reaches the bar.
test('the header’s bar: a different first page, and its header removed', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await writeLong(page, 30);
  await expect(page.locator('[data-page-sheet="2"]')).toBeVisible();
  await page.keyboard.press('Control+Home');
  const header = (sheet: number) =>
    page.locator(`[data-page-sheet="${sheet}"] [data-page-story="header"]`);

  await (await officeMenuItem(page, ['Insert', 'Headers & footers', 'Header'])).click();
  await page.keyboard.type('Running');
  const bar = page.getByRole('toolbar', { name: 'Header options' });
  await expect(bar).toBeVisible();
  await page.keyboard.press('Alt+F10');
  const first = bar.getByRole('checkbox', { name: 'Different first page' });
  await expect(first).toBeFocused();
  await page.keyboard.press('Space');
  await expect(first).toBeChecked();
  // Page 1 now shows a header of its own, empty, the caret in it; page 2 keeps the default.
  const editor = page.getByRole('textbox', { name: 'Header' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText('');
  await page.keyboard.type('Cover');
  await expect(header(2)).toHaveText('Running');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('header-bar.png') });
  await page.keyboard.press('Escape');
  await expect(header(1)).toHaveText('Cover');

  // Options > Remove header takes page 1's own away.
  await page.keyboard.press('Control+Home');
  await (await officeMenuItem(page, ['Insert', 'Headers & footers', 'Header'])).click();
  await expect(editor).toHaveText('Cover');
  await bar.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('menuitem', { name: /Remove header/ }).click();
  await expect(editor).toHaveCount(0);
  await expect(header(1)).toHaveCount(0);
  await expect(header(2)).toHaveText('Running');
  expectNoPageErrors(pageErrors);
});

// "Headers and footers options": Format > Headers & footers sets the header margin, the header moving down by it;
// Different first page from the bar's Header format moves the caret into page 1's own, new header.
test('headers and footers options: the header margin, and a different first page', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await writeLong(page, 30);
  await expect(page.locator('[data-page-sheet="2"]')).toBeVisible();
  await page.keyboard.press('Control+Home');
  const header = (sheet: number) =>
    page.locator(`[data-page-sheet="${sheet}"] [data-page-story="header"]`);
  const headerTop = async () => {
    const sheet = await page.locator('[data-page-sheet="2"]').boundingBox();
    const box = await header(2).boundingBox();
    return box!.y - sheet!.y;
  };

  await (await officeMenuItem(page, ['Insert', 'Headers & footers', 'Header'])).click();
  await page.keyboard.type('Report');
  await page.keyboard.press('Escape');
  await expect(header(2)).toHaveText('Report');
  const before = await headerTop();

  await (await officeMenuItem(page, ['Format', 'Headers & footers'])).click();
  const dialog = page.getByRole('dialog', { name: 'Headers & footers' });
  await expect(dialog).toBeVisible();
  const margin = dialog.getByRole('textbox', { name: /^Header \(/ });
  const inches = (await margin.getAttribute('aria-label'))!.includes('(in)');
  await expect(margin).toHaveValue(inches ? '0.5' : '1.27');
  await margin.fill(inches ? '1' : '2.54');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('header-options.png') });
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toHaveCount(0);
  // Half an inch further down: 48 CSS pixels at the page's zoom, within a pixel.
  await expect.poll(async () => (await headerTop()) - before).toBeGreaterThan(40);

  // From the bar: Header format, Different first page; page 1 then shows a header of its own, made and entered.
  await page.keyboard.press('Control+Home');
  await (await officeMenuItem(page, ['Insert', 'Headers & footers', 'Header'])).click();
  const bar = page.getByRole('toolbar', { name: 'Header options' });
  await bar.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('menuitem', { name: /Header format/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Different first page' }).check();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const editor = page.getByRole('textbox', { name: 'Header' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText('');
  await expect(bar.getByRole('checkbox', { name: 'Different first page' })).toBeChecked();
  await expect(header(2)).toHaveText('Report');
  await page.keyboard.press('Escape');
  await expect(header(1)).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
