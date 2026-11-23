import { FIXTURE_LINE, linksPdf, textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dragAcrossFirstLine, dropPdf, pageOneDrawn } from './pdf-document-pages';

// Selecting a PDF's text and copying it, and its links (docs/specs/035-pdf-documents/reading-surface.md "The pages": Selecting text,
// Copy; keyboard-shortcuts.md "Selections, marks and comments"): a drag with Select in hand selects by character, a
// double press a word, ⌘A the page in view, and ⌘C puts the selection on the clipboard as plain text.

const SELECTION = '[data-pdf-text-selection] polygon';

test('a PDF’s text is selected by a drag, a double press and ⌘A, and copied by ⌘C', async ({
  page,
  context,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Field guide.pdf', await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  // A drag from the line's first character selects up to where it ends, drawn over the glyphs.
  await expect(page.locator('[data-pdf-tool="select"]')).toBeVisible();
  await dragAcrossFirstLine(page, first, { from: 1, to: 110 });
  await expect(first.locator(SELECTION)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(clipboard).toMatch(/^The quick brown fox/);
  const dragged = await clipboard();
  expect(FIXTURE_LINE.startsWith(dragged)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('pdf-text-selected-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-text-selected-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });

  // A double press on "quick" selects the word.
  const box = (await first.boundingBox())!;
  const scale = box.width / 612;
  await page.mouse.dblclick(box.x + 100 * scale, box.y + 68 * scale);
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(clipboard).toBe('quick');

  // ⌘A on the pages selects the page in view's text; Escape clears the selection.
  await page.keyboard.press('ControlOrMeta+a');
  await expect(first.locator(SELECTION)).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(clipboard).toBe(`${FIXTURE_LINE}\nPage 1`);
  await page.keyboard.press('Escape');
  await expect(first.locator(SELECTION)).toHaveCount(0);

  expectNoPageErrors(pageErrors);
});

// "Links", "Following a link", "Previous view": a link on a page names where it leads, goes to its place's point, asks
// before an address; ⌥← comes back to where the view was.
test('a PDF’s links go to their place and ask before an address, and Previous view comes back', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Links.pdf', linksPdf());
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const pageField = page
    .getByRole('group', { name: 'Page and zoom' })
    .getByRole('textbox', { name: 'Page' });
  const scroller = page.locator('[data-pdf-pages]');

  const toPage = first.getByRole('button', { name: 'Link to page 2' });
  await expect(first.getByRole('button', { name: 'Link to https://example.com/a' })).toBeVisible();
  // The tooltip is the link's name: where it leads, as plain text.
  await toPage.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Link to page 2');
  await page.screenshot({ path: test.info().outputPath('pdf-link-hover-dark.png') });

  // The place is 20 points up page two: far down it, so the view scrolls past page two's top.
  await toPage.click();
  await expect(pageField).toHaveValue('2');
  const second = page.locator('[data-pdf-page="2"]');
  const secondTop = await second.evaluate((element) => (element as HTMLElement).offsetTop);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(secondTop);

  // ⌥← comes back to page one's top; ⌥→ goes again.
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(pageField).toHaveValue('1');
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  await page.keyboard.press('Alt+ArrowRight');
  await expect(pageField).toHaveValue('2');
  await page.keyboard.press('Alt+ArrowLeft');

  // An address is asked about first.
  await first.getByRole('button', { name: 'Link to https://example.com/a' }).click();
  const dialog = page.getByRole('dialog', { name: 'Link' });
  await expect(dialog).toContainText('Open this address?');
  await page.screenshot({ path: test.info().outputPath('pdf-link-address-dark.png') });
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  expectNoPageErrors(pageErrors);
});

// "Find", "The context menu": ⌘F opens the field; a query is counted and tinted, Enter steps to the next page's match, All results lists
// each by page, and Escape closes it, its tints gone.
test('a PDF’s text is found, stepped through and listed', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Pages.pdf', await textPdf(3));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
  const pageField = page
    .getByRole('group', { name: 'Page and zoom' })
    .getByRole('textbox', { name: 'Page' });

  // "The context menu": a right-click on a word selected offers Find with it.
  const first = page.locator('[data-pdf-page="1"]');
  const box = (await first.boundingBox())!;
  const scale = box.width / 612;
  await page.mouse.dblclick(box.x + 100 * scale, box.y + 68 * scale);
  await page.mouse.click(box.x + 100 * scale, box.y + 68 * scale, { button: 'right' });
  const menu = page.getByRole('menu', { name: 'Context menu' });
  await expect(menu.getByRole('menuitem', { name: /^Copy/ })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('pdf-context-menu-dark.png') });
  await menu.getByRole('menuitem', { name: /Find “quick”/ }).click();
  const search = page.getByRole('search', { name: 'Find in this PDF' });
  const field = search.getByRole('searchbox', { name: 'Find' });
  await expect(field).toHaveValue('quick');
  await expect(search.getByRole('status')).toHaveText('1 of 3');

  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(field).toBeFocused();
  await field.fill('page');
  await expect(search.getByRole('status')).toHaveText('1 of 3');
  await expect(page.locator('[data-pdf-page="1"] [data-pdf-found-current] polygon')).toHaveCount(1);

  await field.press('Enter');
  await expect(search.getByRole('status')).toHaveText('2 of 3');
  await expect(pageField).toHaveValue('2');

  await search.getByRole('button', { name: 'All results' }).click();
  const results = page.getByRole('complementary', { name: 'Find results' });
  await expect(results.getByRole('button')).toHaveCount(4);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('pdf-find-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-find-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await results.getByRole('region', { name: 'Page 3' }).getByRole('button').click();
  await expect(search.getByRole('status')).toHaveText('3 of 3');

  await field.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(page.locator('[data-pdf-found]')).toHaveCount(0);
  await expect(page.locator('[data-pdf-pages]')).toBeFocused();

  expectNoPageErrors(pageErrors);
});
