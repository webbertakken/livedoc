import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Tools > Review suggested edits (docs/specs/034-text-documents/review.md "Reviewing suggestions"): the Suggested edits
// panel counts the whole document's suggestions and each tab's; Next goes on into the next tab; Preview accept all
// shows the writing settled, the body read only and the panel saying why; Reject all settles every suggestion as one
// change, which one ⌘Z takes back (director, 2026-11-26).

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const CARD = '[data-suggestion-card]';

test.use({ colorScheme: 'dark' });

async function chord(page: Page, first: string, then: string) {
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press(first);
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await page.keyboard.press(then);
}

async function suggesting(page: Page) {
  // ⌘⌥⇧X (Ctrl+Alt+Shift+X here) switches to Suggesting.
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();
}

test('the Suggested edits panel counts, steps across tabs, previews and settles everything at once', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Kept words');
  await (await officeMenuItem(page, ['Insert', 'Tab'])).click();
  await expect(body).toHaveText('');
  await body.click();
  await page.keyboard.type('Second');

  // Suggestions in both tabs: one in the second, two in the first.
  await suggesting(page);
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await page.keyboard.press('Control+Shift+PageUp');
  await expect(body).toHaveText('Kept words');
  await body.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Home');
  await page.keyboard.type('New ');
  await expect(page.locator(CARD)).toHaveCount(2);

  // Ctrl+Alt+O then U opens the panel: the whole document's count, each tab's.
  await chord(page, 'KeyO', 'KeyU');
  const panel = page.getByRole('dialog', { name: 'Suggested edits' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('3 suggested edits')).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Suggested edits by tab' })).toHaveText([
    'Tab 1: 2',
    'Tab 2: 1',
  ]);

  // Next past the shown tab's last goes on into the second tab.
  await panel.getByRole('button', { name: 'Next suggested edit' }).click();
  await panel.getByRole('button', { name: 'Next suggested edit' }).click();
  await panel.getByRole('button', { name: 'Next suggested edit' }).click();
  await expect(body).toHaveText('Second more');
  await page.keyboard.press('Control+Shift+PageUp');
  await expect(body).toHaveText('New Kept words');

  // Preview accept all: the writing as accepting would leave it, read only, the panel saying why.
  await panel.getByRole('combobox', { name: 'Preview' }).selectOption('accept-all');
  await expect(body).toHaveText('New Kept wor');
  await expect(body).toHaveAttribute('aria-readonly', 'true');
  await expect(
    panel.getByText(/can’t be edited until you choose Show suggested edits/),
  ).toBeVisible();
  await expect(page.locator(CARD)).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('review-panel-preview.png') });
  await panel.getByRole('combobox', { name: 'Preview' }).selectOption('reject-all');
  await expect(body).toHaveText('Kept words');
  await panel.getByRole('combobox', { name: 'Preview' }).selectOption('show');
  await expect(body).toHaveText('New Kept words');
  await expect(body).toHaveAttribute('aria-readonly', 'false');

  // Reject all: every suggestion of the document at once; one ⌘Z brings them all back.
  await panel.getByRole('button', { name: /^Reject all$/ }).click();
  await expect(panel.getByText('No suggested edits')).toBeVisible();
  await expect(body).toHaveText('Kept words');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('review-panel-settled.png') });
  await body.click();
  await page.keyboard.press('Control+KeyZ');
  await expect(panel.getByText('3 suggested edits')).toBeVisible();
  await expect(body).toHaveText('New Kept words');

  // Escape in the panel closes it.
  await panel.getByRole('button', { name: 'Next suggested edit' }).focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
