import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The ruler on a text document (docs/specs/034-text-documents/editing-surface.md "The ruler"): an indent dragged, a
// tab stop added from the press menu and dragged away, a margin dragged with the page following, and View > Show
// ruler hiding it, remembered after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';
// CSS pixels per inch.
const INCH = 96;

async function dragBy(page: Page, name: string, dx: number, dy = 0) {
  const box = (await page.getByRole('slider', { name, exact: true }).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

const valueOf = (page: Page, name: string) =>
  page.getByRole('slider', { name, exact: true }).getAttribute('aria-valuetext');

test('the ruler sets indents, tab stops and margins, and hides', async ({ page, pageErrors }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const ruler = page.getByRole('group', { name: /^Ruler/ });
  await expect(ruler).toBeVisible();
  await body.click();
  await page.keyboard.type('Indented by the ruler');

  // The left indent, an inch to the right: the paragraph follows, focus back in the writing.
  await dragBy(page, 'Left indent', INCH);
  await expect.poll(() => valueOf(page, 'Left indent')).toBe('1 in');
  await expect(body.locator('p').first()).toHaveCSS('padding-left', `${INCH}px`);
  await expect(body).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('ruler-indent.png') });

  // A press three inches in opens the menu; a right tab stop goes there.
  const strip = (await ruler.boundingBox())!;
  const marginLeft = (await page.getByRole('slider', { name: 'Left margin' }).boundingBox())!;
  await page.mouse.click(marginLeft.x + marginLeft.width / 2 + 3 * INCH, strip.y + strip.height / 2);
  const menu = page.getByRole('menu', { name: 'Add tab stop' });
  await expect(menu).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('ruler-menu.png') });
  await menu.getByRole('menuitem', { name: 'Add right tab stop' }).click();
  await expect.poll(() => valueOf(page, 'Right tab stop')).toBe('3 in');

  // Dragged off the ruler, the stop is taken away.
  await dragBy(page, 'Right tab stop', 0, 60);
  await expect(page.getByRole('slider', { name: 'Right tab stop' })).toHaveCount(0);

  // The right margin, half an inch in: the page's text area narrows.
  await dragBy(page, 'Right margin', -INCH / 2);
  await expect.poll(() => valueOf(page, 'Right margin')).toBe('1.5 in');
  await expect(page.locator('.text-document-page')).toHaveCSS('padding-right', `${1.5 * INCH}px`);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => valueOf(page, 'Right margin')).toBe('1 in');

  // View > Show ruler hides it, and it stays hidden after a reload.
  await (await officeMenuItem(page, ['View', 'Show ruler'])).click();
  await expect(ruler).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(page.getByRole('group', { name: /^Ruler/ })).toHaveCount(0);
  await expect(body.locator('p').first()).toHaveCSS('padding-left', `${INCH}px`);
  await (await officeMenuItem(page, ['View', 'Show ruler'])).click();
  await expect(page.getByRole('group', { name: /^Ruler/ })).toBeVisible();
  expectNoPageErrors(pageErrors);
});
