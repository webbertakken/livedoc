import { readFileSync } from 'node:fs';
import { readTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Bookmarks (docs/specs/034-text-documents/links-and-navigation.md "Bookmarks"): Insert > Bookmark puts one at the caret,
// its ribbon in the left margin and its card beside the caret; the link editor offers it by the text after it; a link
// to it goes there on Alt+Enter; the document's address with #bookmark= goes there on opening; the file holds both.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('a bookmark is put in, linked to, gone to and kept in the file', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Contents: ');
  for (let i = 0; i < 30; i += 1) await page.keyboard.press('Enter');
  await page.keyboard.type('Chapter one');
  await page.keyboard.press('Home');

  // Insert > Bookmark: the ribbon in the margin, left of the text, and the card.
  await (await officeMenuItem(page, ['Insert', 'Bookmark'])).click();
  const ribbon = body.locator('.text-document-bookmark-glyph');
  await expect(ribbon).toHaveCount(1);
  const line = (await body.locator('p').last().boundingBox())!;
  const mark = (await ribbon.boundingBox())!;
  expect(mark.x + mark.width).toBeLessThan(line.x);
  expect(Math.abs(mark.y - line.y)).toBeLessThan(line.height);
  const card = page.locator('[data-text-document-bookmark-card]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('bookmark.png') });

  // A link to it, from the link editor's bookmarks.
  await body.focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('End');
  await page.keyboard.press('Control+k');
  const editor = page.locator('[data-office-link-editor]');
  await editor.getByRole('combobox', { name: 'Link' }).fill('chapter');
  await expect(editor.getByRole('group', { name: 'Bookmarks' })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const link = body.locator('a').first();
  await expect(link).toHaveText('Chapter one');

  // Alt+Enter on it goes to the bookmark, far down the page.
  await expect(page.locator('[data-office-link-card]').getByRole('link')).toHaveText('Chapter one');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Alt+Enter');
  await expect(card).toBeVisible();
  await expect.poll(async () => (await ribbon.boundingBox())?.y ?? -1).toBeGreaterThan(0);

  // The file holds the bookmark and the link to it (a new document is ODF).
  const download = await officeMenuItem(page, ['File', 'Download', 'OpenDocument format (.odt)']);
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const saved = test.info().outputPath('bookmarks.odt');
  await file.saveAs(saved);
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(read.ok).toBe(true);
  let name = '';
  if (read.ok) {
    const inlines = read.document.body.flatMap((b) => (b.type === 'paragraph' ? b.inlines : []));
    name = inlines.flatMap((i) => (i.type === 'bookmark' ? [i.name] : []))[0] ?? '';
    expect(name).toMatch(/^[a-z][a-z0-9]{11}$/);
    expect(inlines.some((i) => i.type === 'run' && i.link === `#${name}`)).toBe(true);
  }

  // The document's address with #bookmark= goes there on opening.
  await page.waitForTimeout(1000);
  await page.goto(`${page.url().split('#')[0]}#bookmark=${name}`);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(card).toBeVisible();
  expectNoPageErrors(pageErrors);
});
