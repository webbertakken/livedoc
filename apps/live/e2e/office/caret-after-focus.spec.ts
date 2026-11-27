import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The caret moved at once after the writing takes the focus (docs/specs/034-text-documents/editing-surface.md "The
// caret"): Escape leaves a header and Ctrl+Home goes to the document's start straight away. ProseMirror took a move to
// the start within 200 ms of a focus for the browser's own reset and put its old caret back; with
// `patches/prosemirror-view@1.43.0.patch` a key pressed since the focus is the person's move, and it stays.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ colorScheme: 'dark' });

test('Ctrl+Home right after leaving a header goes to the start, and stays there', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('The cat sat.');
  await (await officeMenuItem(page, ['Insert', 'Headers & footers', 'Header'])).click();
  const editor = page.getByRole('textbox', { name: 'Header' });
  await expect(editor).toBeFocused();
  await page.keyboard.type('Cat news');

  // Escape, then Ctrl+Home as soon as the header is drawn on its page again: well within ProseMirror's 200 ms after
  // the body takes the focus.
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(page.locator('[data-page-sheet="1"] [data-page-story="header"]')).toHaveText(
    'Cat news',
  );
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('X');

  await expect(body).toBeFocused();
  await expect(body.locator('p').first()).toHaveText('XThe cat sat.');
  expectNoPageErrors(pageErrors);
});
