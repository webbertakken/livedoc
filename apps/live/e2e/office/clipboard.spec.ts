import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The clipboard of a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard"): a heading and a
// list copied from one document arrive in another as a heading and a list; HTML from a web page is read with its
// headings and lists; ⌘⇧V and Edit > Paste without formatting paste plain text in the formatting at the caret.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('copies between documents, reads HTML, and pastes without formatting', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const body = page.locator(BODY);
  const open = async () => {
    await page.goto('/new?kind=text-document');
    await page.waitForURL(/\/document\//);
    await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
    await body.click();
  };

  // A heading, a paragraph and a bulleted item, copied.
  await open();
  await page.keyboard.press('ControlOrMeta+Alt+1');
  await page.keyboard.type('Plan');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Body text');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+Shift+8');
  await page.keyboard.type('First item');
  await expect(body.locator('.text-document-list-marker')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+C');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'Plan\nBody text\n● First item',
  );

  // Pasted in another document: still a heading, a paragraph and a list item.
  await open();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(body.locator('p')).toHaveCount(3);
  await expect(body.locator('p').first()).toHaveAttribute('data-style', /Heading/);
  await expect(body.locator('p').first()).toHaveText('Plan');
  await expect(body.locator('.text-document-list-marker')).toHaveText(['●']);
  await page.screenshot({ path: test.info().outputPath('pasted-document.png') });

  // HTML from a web page: its heading and its numbered list, its whitespace collapsed.
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await body.evaluate((target) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<h2>\n  From the web\n</h2>\n<ol>\n  <li>one</li>\n  <li>two</li>\n</ol>',
    );
    data.setData('text/plain', 'From the web\none\ntwo');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(body.locator('p')).toHaveText(['From the web', '1.one', '2.two']);
  await expect(body.locator('p').first()).toHaveAttribute('data-style', /Heading/);

  // ⌘⇧V: plain text in the formatting at the caret, a paragraph a line.
  await page.evaluate(() => navigator.clipboard.writeText('alpha\nbeta'));
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('End');
  // The editor reads a caret the keys moved on the browser's next selectionchange.
  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+Shift+V');
  await expect(body.locator('p')).toHaveCount(5);
  await expect(body.locator('p').nth(2)).toHaveText('beta');

  // Edit > Paste without formatting asks the browser, as the keys do.
  await (await officeMenuItem(page, ['Edit', 'Paste without formatting'])).click();
  await expect(body.locator('p').nth(3)).toHaveText('beta');
  await page.screenshot({ path: test.info().outputPath('pasted-html.png') });
  expectNoPageErrors(pageErrors);
});
