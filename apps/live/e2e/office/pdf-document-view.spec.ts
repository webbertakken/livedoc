import type { Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// A person's view of a PDF's pages (docs/specs/035-pdf-documents/reading-surface.md "The pages", "The page bar";
// keyboard-shortcuts.md "Reading"): page display, zoom by the menus, the keys, the bar and the wheel, and Go to, with
// the page bar in the dark and the light scheme, on a wide window and on a phone's.

const PAGES = '[data-pdf-pages]';
const pageBar = (page: Page) => page.getByRole('group', { name: 'Page and zoom' });
const pageField = (page: Page) => pageBar(page).getByRole('textbox', { name: 'Page' });
const zoomField = (page: Page) => pageBar(page).getByRole('combobox', { name: 'Zoom' });
const menuBar = (page: Page) => page.getByRole('menubar', { name: 'Menu bar' });
/** Opens View and a submenu of it, and runs one of its items. */
async function viewItem(page: Page, submenu: string, item: string) {
  await menuBar(page).getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitem', { name: submenu, exact: true }).click();
  const named = (role: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox') =>
    page.getByRole(role, { name: item, exact: true });
  await named('menuitemradio').or(named('menuitemcheckbox')).or(named('menuitem')).click();
}
/** The pages laid out now: each page's number and box. */
const laidOut = (page: Page) =>
  page.locator(`${PAGES} [data-pdf-page]`).evaluateAll((pages) =>
    pages.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        page: Number((element as HTMLElement).dataset.pdfPage),
        x: box.x,
        y: box.y,
        w: box.width,
      };
    }),
  );

test('a PDF’s pages are laid out, zoomed and turned as the person’s own view says', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Field guide.pdf', await textPdf(7));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  // "A PDF opens in Continuous at Fit width"; the page bar says page one of seven and the zoom as a percentage.
  await expect(pageBar(page)).toBeVisible();
  await expect(pageField(page)).toHaveValue('1');
  await expect(pageBar(page).getByText('/ 7')).toBeVisible();
  await expect(zoomField(page)).toHaveValue(/^\d+%$/);
  await expect(pageBar(page).getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('pdf-view-bar-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-view-bar-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });

  // "The page bar": a typed page goes there; one that is none says so.
  await pageField(page).fill('5');
  await pageField(page).press('Enter');
  await expect(pageField(page)).toHaveValue('5');
  await expect(page.locator('[data-pdf-page="5"]')).toBeInViewport();
  await pageField(page).fill('99');
  await pageField(page).press('Enter');
  await expect(pageBar(page).locator('..').getByRole('status')).toHaveText('There is no page 99.');
  await expect(pageField(page)).toHaveValue('5');

  // keyboard-shortcuts.md "Reading": Home and End on the pages; ⌘= and ⌘- step the zoom; ⌘1 is Actual size.
  await page.locator(PAGES).focus();
  await page.keyboard.press('End');
  await expect(pageField(page)).toHaveValue('7');
  await page.keyboard.press('Home');
  await expect(pageField(page)).toHaveValue('1');
  await page.keyboard.press('ControlOrMeta+1');
  await expect(zoomField(page)).toHaveValue('100%');
  await page.keyboard.press('ControlOrMeta+Equal');
  await expect(zoomField(page)).toHaveValue('125%');
  await page.keyboard.press('ControlOrMeta+Minus');
  await page.keyboard.press('ControlOrMeta+Minus');
  await expect(zoomField(page)).toHaveValue('75%');
  // "The page bar": a typed zoom takes 10 to 6400, with or without a per cent sign.
  await zoomField(page).fill('250');
  await zoomField(page).press('Enter');
  await expect(zoomField(page)).toHaveValue('250%');

  // "The pages": at 800% the whole-page picture is softer than the screen, so the part in view is drawn as sharp
  // tiles over it: a few, never the page's hundreds.
  await zoomField(page).fill('800');
  await zoomField(page).press('Enter');
  await expect(page.locator('[data-pdf-tile-drawn="true"]').first()).toBeAttached({
    timeout: 15_000,
  });
  expect(await page.locator('[data-pdf-tile]').count()).toBeLessThan(40);
  // Over the line of text on page one, 72 points in and down: at 800% about 768 CSS pixels from the page's corner.
  await page.locator(PAGES).evaluate((pages) => {
    const one = pages.querySelector<HTMLElement>('[data-pdf-page="1"]')!;
    pages.scrollTo(one.offsetLeft + 600, one.offsetTop + 600);
  });
  await expect(
    page.locator('[data-pdf-page="1"] [data-pdf-tile-drawn="true"]').first(),
  ).toBeAttached({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: test.info().outputPath('pdf-view-tiles-dark.png') });

  // "The wheel and a pinch keep what is under the pointer."
  await viewItem(page, 'Zoom', 'Fit width');
  const pages = page.locator(PAGES);
  const box = (await pages.boundingBox())!;
  const pointer = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 };
  const under = () =>
    page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-pdf-page]');
      const rect = element!.getBoundingClientRect();
      return {
        page: element!.dataset.pdfPage,
        across: (x - rect.x) / rect.width,
        down: (y - rect.y) / rect.height,
      };
    }, pointer);
  const before = await under();
  await page.mouse.move(pointer.x, pointer.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect(zoomField(page)).not.toHaveValue(/^1\d\d%$|^9\d%$/);
  const after = await under();
  expect(after.page).toBe(before.page);
  expect(after.across).toBeCloseTo(before.across, 2);
  expect(after.down).toBeCloseTo(before.down, 2);

  // "Page display": two pages across meet at the middle; with a cover page the first stands alone on the right.
  await viewItem(page, 'Zoom', 'Fit page');
  await viewItem(page, 'Page display', 'Two pages, continuous');
  const two = await laidOut(page);
  const [first, second] = [two.find((p) => p.page === 1)!, two.find((p) => p.page === 2)!];
  expect(Math.abs(first.y - second.y)).toBeLessThan(1);
  expect(second.x).toBeGreaterThan(first.x + first.w);
  await page.screenshot({ path: test.info().outputPath('pdf-view-two-dark.png') });
  await viewItem(page, 'Page display', 'Show cover page');
  const covered = await laidOut(page);
  const cover = covered.find((p) => p.page === 1)!;
  const third = covered.find((p) => p.page === 3)!;
  expect(cover.x).toBeGreaterThan(box.x + box.width / 2 - 20);
  expect(Math.abs(covered.find((p) => p.page === 2)!.y - third.y)).toBeLessThan(1);

  // "Single page shows the row in view alone"; ← and → turn it, Go to > Next page too.
  await viewItem(page, 'Page display', 'Single page');
  await page.locator(PAGES).focus();
  await expect(page.locator(`${PAGES} [data-pdf-page]`)).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(pageField(page)).toHaveValue('2');
  await viewItem(page, 'Go to', 'Next page');
  await expect(pageField(page)).toHaveValue('3');
  await expect(page.locator(`${PAGES} [data-pdf-page]`)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Alt+KeyG');
  await expect(pageField(page)).toBeFocused();

  // "Rotate view": every page a quarter, drawn turned; a mark is made where the turned picture shows the text.
  await viewItem(page, 'Page display', 'Continuous');
  await viewItem(page, 'Zoom', 'Fit width');
  await viewItem(page, 'Rotate view', 'Clockwise');
  const pageOne = page.locator('[data-pdf-page="1"]');
  await pageOne.scrollIntoViewIfNeeded();
  // The picture drawn turned, not the upright one stretched while the turned one is drawn.
  await expect(pageOne).toHaveAttribute('data-pdf-page-turns', '1');
  const turned = (await pageOne.boundingBox())!;
  expect(turned.width / turned.height).toBeCloseTo(792 / 612, 2);
  await page.screenshot({ path: test.info().outputPath('pdf-view-turned-dark.png') });
  // The fixture's line, 72 points in and 68 down an upright page, runs down the turned page 68 points from its right.
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  const scale = turned.height / 612;
  const x = turned.x + (792 - 68) * scale;
  await page.mouse.move(x, turned.y + 74 * scale);
  await page.mouse.down();
  await page.mouse.move(x, turned.y + 170 * scale, { steps: 6 });
  await page.mouse.move(x, turned.y + 272 * scale, { steps: 6 });
  await page.mouse.up();
  const mark = pageOne.locator('[data-pdf-mark]');
  await expect(mark).toHaveCount(1);
  const along = (await mark.boundingBox())!;
  expect(along.height).toBeGreaterThan(along.width * 3);
  await page.locator(PAGES).focus();
  await page.keyboard.press('ControlOrMeta+Shift+Minus');
  await expect
    .poll(async () => (await pageOne.boundingBox())!.height > (await pageOne.boundingBox())!.width)
    .toBe(true);
  const upright = (await mark.boundingBox())!;
  expect(upright.width).toBeGreaterThan(upright.height * 3);

  // On a phone's width the bar stays clear of the document group at the bottom right.
  await page.setViewportSize({ width: 390, height: 780 });
  await expect(pageBar(page)).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('pdf-view-phone-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-view-phone-light.png') });

  expectNoPageErrors(pageErrors);
});
