import { readFileSync } from 'node:fs';
import { readTextDocumentFile, type Paragraph } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Links (docs/specs/034-text-documents/links-and-navigation.md "Links"): Ctrl+K over a word opens the link editor with
// the word as Text; a bare domain applied links it as https; the caret in the link shows its card, Escape hides it;
// Alt+Enter opens the address in a new tab; Remove link takes the address off and Undo puts it back; Insert > Link at a
// bare caret puts the address in, linked; the file holds the links.

const BODY = '[role="textbox"][aria-label="Document body"]';
const CARD = '[data-office-link-card]';
const EDITOR = '[data-office-link-editor]';

test('links are made, shown, opened, removed and kept in the file', async ({
  page,
  context,
  pageErrors,
}) => {
  await context.route('https://example.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Example</title>' }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Read the guide now');
  await page.keyboard.press('End');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowLeft');

  // Ctrl+K: the word as Text, the focus in Link.
  await page.keyboard.press('Control+k');
  const editor = page.locator(EDITOR);
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Text' })).toHaveValue('guide');
  await expect(editor.getByRole('combobox', { name: 'Link' })).toBeFocused();
  await page.keyboard.type('example.com');
  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);
  const link = body.locator('a');
  await expect(link).toHaveText('guide');
  await expect(link).toHaveAttribute('href', 'https://example.com');

  // The caret in the link: its card, which leaves the focus in the writing.
  const card = page.locator(CARD);
  await expect(card).toBeVisible();
  await expect(card.getByRole('link')).toHaveText('https://example.com');
  await expect(body).toBeFocused();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('link-card.png') });
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);

  // Alt+Enter opens it in a new tab.
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    page.keyboard.press('Alt+Enter'),
  ]);
  await expect.poll(() => opened.url()).toContain('https://example.com');
  await opened.close();

  // Remove link from the card; Undo puts it back.
  await body.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Remove link' }).click();
  await expect(body.locator('a')).toHaveCount(0);
  await expect(body).toHaveText('Read the guide now');
  await body.focus();
  await page.keyboard.press('Control+z');
  await expect(body.locator('a')).toHaveText('guide');

  // Insert > Link at a bare caret puts the address in, linked; the editor shown for the capture.
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' ');
  await (await officeMenuItem(page, ['Insert', 'Link'])).click();
  await expect(editor).toBeVisible();
  await editor.getByRole('combobox', { name: 'Link' }).fill('ada@example.com');
  await page.screenshot({ path: test.info().outputPath('link-editor.png') });
  await editor.getByRole('button', { name: 'Apply' }).click();
  await expect(body.locator('a').nth(1)).toHaveText('ada@example.com');
  await expect(body.locator('a').nth(1)).toHaveAttribute('href', 'mailto:ada@example.com');

  // The file holds both links (a new document is ODF).
  const download = await officeMenuItem(page, ['File', 'Download', 'OpenDocument format (.odt)']);
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const saved = test.info().outputPath('links.odt');
  await file.saveAs(saved);
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(read.ok).toBe(true);
  if (read.ok) {
    const paragraph = read.document.body.find((b): b is Paragraph => b.type === 'paragraph');
    const links = (paragraph?.inlines ?? []).flatMap((inline) =>
      'link' in inline && inline.link ? [inline.link] : [],
    );
    expect(links).toEqual(['https://example.com', 'mailto:ada@example.com']);
  }
  expectNoPageErrors(pageErrors);
});
