import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Viewing (docs/specs/034-text-documents/review.md "Editing modes"): it draws what a Viewer sees, whoever chooses it:
// pending suggestions as not yet made, no comment highlight, no margin, no Comment history or comments panel, no Review
// suggested edits; leaving it brings the threads, the cards and the panel left open back as they were (director,
// 2026-11-27).

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const THREAD_CARD =
  '[data-thread-card]:not([data-thread-card="draft"]):not([data-suggestion-card])';
const SUGGESTION_CARD = '[data-suggestion-card]';

test.use({ colorScheme: 'dark' });

async function modeKey(page: Page, key: string, mode: string) {
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press(key);
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: `Mode: ${mode}` })).toBeVisible();
}

test('Viewing hides comments and suggestions, and leaving it brings them back', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('The quarterly results are in.');

  // A comment on "quarterly".
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('Shift+ArrowRight');
  await (await officeMenuItem(page, ['Insert', 'Comment'])).click();
  const draft = page.getByRole('group', { name: 'New comment' });
  await expect(draft.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
  await page.keyboard.type('Which quarter?');
  await draft.getByRole('button', { name: 'Comment' }).click();
  await expect(page.locator(THREAD_CARD)).toHaveCount(1);

  // A suggestion at the end.
  await body.click();
  await modeKey(page, 'KeyX', 'Suggesting');
  await page.keyboard.press('End');
  await page.keyboard.type(' Indeed.');
  await expect(page.locator(SUGGESTION_CARD)).toHaveCount(1);
  await expect(body).toHaveText('The quarterly results are in. Indeed.');

  // The comments panel open.
  await page.getByRole('button', { name: 'Open comment history' }).click();
  const comments = page.getByRole('complementary', { name: 'Comments' });
  await expect(comments).toBeVisible();

  // Viewing: the writing as a Viewer sees it.
  await modeKey(page, 'KeyC', 'Viewing');
  await expect(body).toHaveText('The quarterly results are in.');
  await expect(body).toHaveAttribute('aria-readonly', 'true');
  await expect(body.locator('.text-document-insertion')).toHaveCount(0);
  await expect(body.locator('.text-document-comment')).toHaveCount(0);
  await expect(page.locator(THREAD_CARD)).toHaveCount(0);
  await expect(page.locator(SUGGESTION_CARD)).toHaveCount(0);
  await expect(comments).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open comment history' })).toBeHidden();
  // Review suggested edits is not offered: its keys open nothing.
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyO');
  await page.keyboard.press('KeyU');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(page.getByRole('dialog', { name: 'Suggested edits' })).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('viewing.png') });

  // Back to Editing: the suggestion, the thread, its tint and the panel as they were.
  await modeKey(page, 'KeyZ', 'Editing');
  await expect(body).toHaveText('The quarterly results are in. Indeed.');
  await expect(page.locator(SUGGESTION_CARD)).toHaveCount(1);
  await expect(page.locator(THREAD_CARD)).toHaveCount(1);
  await expect(body.locator('.text-document-comment')).toHaveText('quarterly');
  await expect(comments).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('editing-again.png') });
  expectNoPageErrors(pageErrors);
});
