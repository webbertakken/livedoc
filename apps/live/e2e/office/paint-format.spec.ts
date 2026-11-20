import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// Paint format and Clear formatting on a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Paint
// format", "Clear formatting"): the roller copies the formatting at the caret and paints the next selection the
// pointer makes, once or held until Escape; Clear formatting takes the text and paragraphs back to their style.

const BODY = '[role="textbox"][aria-label="Document body"]';

// Where a word is drawn, and the weight it is drawn in.
async function wordOf(page: Page, word: string) {
  return page.evaluate(
    ([selector, word]) => {
      const body = document.querySelector(selector)!;
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent!.indexOf(word);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + word.length);
        const { x, y, width, height } = range.getBoundingClientRect();
        return { x, y, width, height, weight: getComputedStyle(node.parentElement!).fontWeight };
      }
      throw new Error(`no ${word}`);
    },
    [BODY, word] as const,
  );
}

// A selection made with the pointer, across the word.
async function dragAcross(page: Page, word: string) {
  const box = await wordOf(page, word);
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
}

test('the paint roller paints once or held, and Clear formatting clears', async ({
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
  const roller = toolbar.getByRole('button', { name: 'Paint format' });
  const paragraphs = body.locator('p');

  // "Alpha" bold in a centred paragraph, then a plain one.
  await body.click();
  await page.keyboard.type('Alpha beta');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Gamma delta epsilon');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Control+B');
  await page.keyboard.press('Control+Shift+E');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  expect((await wordOf(page, 'Alpha')).weight).toBe('700');

  // Once: pressed, the pointer a roller; the next drag takes the formatting, then it lets go.
  await roller.click();
  await expect(roller).toHaveAttribute('aria-pressed', 'true');
  await expect(body).toHaveClass(/text-document-painting/);
  await dragAcross(page, 'Gamma');
  await expect.poll(async () => (await wordOf(page, 'Gamma')).weight).toBe('700');
  await expect(paragraphs.nth(1)).toHaveCSS('text-align', 'center');
  await expect(roller).toHaveAttribute('aria-pressed', 'false');
  await expect(body).not.toHaveClass(/text-document-painting/);
  expect((await wordOf(page, 'delta')).weight).toBe('400');

  // Held: a double-click keeps it on through two drags, until Escape.
  await page.keyboard.press('Control+Home');
  await roller.dblclick();
  await expect(roller).toHaveAttribute('aria-pressed', 'true');
  await dragAcross(page, 'delta');
  await expect.poll(async () => (await wordOf(page, 'delta')).weight).toBe('700');
  await dragAcross(page, 'epsilon');
  await expect.poll(async () => (await wordOf(page, 'epsilon')).weight).toBe('700');
  await expect(roller).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(roller).toHaveAttribute('aria-pressed', 'false');

  // Clear formatting from the toolbar: plain text, paragraphs back to their style.
  await body.click();
  await page.keyboard.press('Control+A');
  await toolbar.getByRole('button', { name: 'Clear formatting' }).click();
  await expect(body).toBeFocused();
  for (const word of ['Alpha', 'Gamma', 'delta', 'epsilon'])
    expect((await wordOf(page, word)).weight).toBe('400');
  await expect(paragraphs.first()).toHaveCSS('text-align', 'start');
  await expect(paragraphs.nth(1)).toHaveCSS('text-align', 'start');

  // Kept after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('p').first()).toHaveCSS('text-align', 'start');
  expect((await wordOf(page, 'Alpha')).weight).toBe('400');
  expectNoPageErrors(pageErrors);
});
