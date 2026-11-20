import { expect, expectNoPageErrors, test } from '../fixtures';

// Lists on a text document (docs/specs/034-text-documents/lists.md): numbered from the toolbar, a level in with Tab,
// Enter making items and leaving the list, a checklist ticked by its box and by ⌘⌥Enter; kept after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('lists are made, numbered, nested, left and ticked, kept after a reload', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const markers = body.locator('.text-document-list-marker');

  // Numbered: three items, the second a level in.
  await body.click();
  await toolbar.getByRole('button', { name: 'Numbered list' }).click();
  await expect(toolbar.getByRole('button', { name: 'Numbered list' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.type('First');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Nested');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('Second');
  await expect(markers).toHaveText(['1.', 'a.', '2.']);
  // The marker is no text of the writing.
  await expect(body.locator('p').first()).toHaveText('1.First');
  expect(await body.evaluate((b) => b.querySelector('p')!.firstChild!.textContent)).toBe('1.');

  // Enter on an empty item leaves the list.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Plain');
  await expect(markers).toHaveCount(3);

  // A checklist: ⌘⇧9, ticked by its box, then by Ctrl+Alt+Enter.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Shift+9');
  await page.keyboard.type('Milk');
  const box = body.getByRole('checkbox', { name: 'Milk' });
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect(body.locator('p').last()).toHaveCSS('text-decoration-line', 'line-through');
  await page.keyboard.press('Control+Alt+Enter');
  await expect(box).toHaveAttribute('aria-checked', 'false');

  // Kept after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('.text-document-list-marker')).toHaveText(['1.', 'a.', '2.', '']);
  await expect(body.getByRole('checkbox', { name: 'Milk' })).toBeVisible();
  expectNoPageErrors(pageErrors);
});
