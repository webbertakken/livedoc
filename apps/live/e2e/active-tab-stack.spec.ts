import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, openStartBlank, test } from './fixtures';

// The active tab holds the tab stack (docs/specs/007-editor/toolbar-layout.md "The bottom line", "The tab's name"):
// a click on the tab's name opens the tab list, the kind glyph before it renames the tab, by pointer and keyboard.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

const segment = (page: Page) => page.locator('[data-document-group] [data-active-tab-segment]');

async function addTab(page: Page) {
  await page.locator('[data-document-group]').getByRole('button', { name: 'Add tab' }).click();
  await page.getByRole('menuitem', { name: 'Tab', exact: true }).click();
}

test('the tab name opens the tab list; the kind glyph renames the tab', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  await addTab(page);
  const stack = segment(page).getByRole('button', { name: 'Tab 2, all tabs (2)' });
  await expect(stack).toBeVisible();

  await segment(page).getByText('Tab 2', { exact: true }).click();
  const list = page.getByRole('dialog', { name: 'Tabs' });
  await expect(list).toBeVisible();
  await expect(stack).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({
    path: test.info().outputPath('tab-list-from-name.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(stack).toBeFocused();

  const rename = segment(page).getByRole('button', { name: 'Rename Diagram tab' });
  await rename.hover();
  await expect(page.getByText('Click to rename it.').filter({ visible: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('rename-hover.png'),
    animations: 'disabled',
  });
  await rename.click();
  const field = segment(page).getByRole('textbox');
  await field.fill('Checkout');
  await field.press('Enter');
  await expect(segment(page).getByRole('button', { name: 'Checkout, all tabs (2)' })).toBeVisible();
  expectNoPageErrors(pageErrors);
});

test('the keyboard reaches rename, the tab list and the tab menu in that order', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  const rename = segment(page).getByRole('button', { name: 'Rename Diagram tab' });
  await rename.focus();
  await page.keyboard.press('Tab');
  await expect(segment(page).getByRole('button', { name: 'Tab 1, all tabs (1)' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(segment(page).getByRole('button', { name: 'Tab menu' })).toBeFocused();

  await rename.focus();
  await page.keyboard.press('Enter');
  const field = segment(page).getByRole('textbox');
  await field.fill('Overview');
  await field.press('Enter');
  await expect(segment(page).getByRole('button', { name: 'Overview, all tabs (1)' })).toBeVisible();
  expectNoPageErrors(pageErrors);
});

test('a phone keeps the rename and the tab list apart in the active tab', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStartBlank(page);
  await addTab(page);
  await page.keyboard.press('Escape');
  const stack = segment(page).getByRole('button', { name: 'Tab 2, all tabs (2)' });
  await expect(stack).toBeVisible();
  await expect(segment(page).getByRole('button', { name: 'Rename Diagram tab' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('active-tab-phone.png'),
    clip: (await page.locator('[data-document-group]').boundingBox())!,
  });
  await stack.click();
  await expect(page.getByRole('dialog', { name: 'Tabs' })).toBeVisible();
  expectNoPageErrors(pageErrors);
});
