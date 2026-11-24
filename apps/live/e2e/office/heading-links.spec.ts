import { readFileSync } from 'node:fs';
import { Bookmarks, readTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Heading links (docs/specs/034-text-documents/links-and-navigation.md "Heading links"): the context menu's Copy heading
// link copies the document's address with #heading=<id>, the heading gaining its id; the link editor offers headings;
// a link to one goes there on Alt+Enter; the address with #heading= goes there on opening; the file holds the id.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('a heading’s link is copied, linked to, gone to and kept in the file', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('See ');
  for (let i = 0; i < 60; i += 1) await page.keyboard.press('Enter');
  await page.keyboard.type('Chapter one');
  await page.keyboard.press('Control+Alt+1');

  // Copy heading link, from the context menu on the heading.
  await body.locator('p', { hasText: 'Chapter one' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy heading link' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/\/document\/[^#]+#heading=_[a-z][a-z0-9]{11}$/);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const id = decodeURIComponent(copied.split('#heading=')[1]!);

  // A link to it, from the link editor's headings.
  await body.focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('End');
  await page.keyboard.press('Control+k');
  const editor = page.locator('[data-text-document-link-editor]');
  await editor.getByRole('combobox', { name: 'Link' }).fill('chapter');
  await expect(editor.getByRole('group', { name: 'Headings' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('heading-links.png') });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const link = body.locator('a').first();
  await expect(link).toHaveText('Chapter one');

  // Alt+Enter on it goes to the heading, far down the page.
  await expect(page.locator('[data-text-document-link-card]').getByRole('link')).toHaveText(
    'Chapter one',
  );
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Alt+Enter');
  const heading = body.locator('p', { hasText: 'Chapter one' });
  await expect.poll(async () => (await heading.boundingBox())?.y ?? -1).toBeGreaterThan(0);
  await expect.poll(async () => (await heading.boundingBox())?.y ?? 9999).toBeLessThan(900);

  // The file holds the heading's id and the link to it (a new document is ODF).
  const download = await officeMenuItem(page, ['File', 'Download', 'OpenDocument format (.odt)']);
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const saved = test.info().outputPath('heading-links.odt');
  await file.saveAs(saved);
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(read.ok).toBe(true);
  if (read.ok) {
    const inlines = read.document.body.flatMap((b) => (b.type === 'paragraph' ? b.inlines : []));
    const hidden = inlines.flatMap((i) =>
      i.type === 'bookmark' && Bookmarks.hidden(i.name) ? [i.name] : [],
    );
    expect(hidden).toEqual([id]);
    expect(inlines.some((i) => i.type === 'run' && i.link === `#${id}`)).toBe(true);
  }

  // The document's address with #heading= goes there on opening.
  await page.waitForTimeout(1000);
  await page.goto(copied);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect.poll(async () => (await heading.boundingBox())?.y ?? 9999).toBeLessThan(900);
  expectNoPageErrors(pageErrors);
});
