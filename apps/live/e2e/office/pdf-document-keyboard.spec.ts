import type { Page } from '@playwright/test';
import { spoiled, textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// A PDF by keyboard alone (docs/specs/035-pdf-documents/accessibility.md "Keyboard alone"; keyboard-shortcuts.md
// "Panels"): F6 moves between the surface's regions in screen order, the notice and the page bar among them, and
// Shift+F6 walks back.

const regionInFocus = (page: Page) =>
  page.evaluate(
    () => document.activeElement?.closest<HTMLElement>('[data-region]')?.dataset.region ?? null,
  );

async function walk(page: Page, key: string, steps: number): Promise<(string | null)[]> {
  const seen: (string | null)[] = [];
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press(key);
    seen.push(await regionInFocus(page));
  }
  return seen;
}

test('F6 moves between a PDF’s regions, its notice and page bar among them', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  // A repaired file, so a notice shows under the toolbar.
  await dropPdf(page, 'Damaged.pdf', spoiled(await textPdf(2)));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
  await expect(page.locator('[data-region="notice"]')).toBeVisible();
  await page.locator('[data-pdf-pages]').focus();

  const onward = await walk(page, 'F6', 8);
  expect(onward.slice(0, onward.indexOf('document') + 1)).toEqual([
    'pagebar',
    'tabs',
    'header',
    'menubar',
    'toolbar',
    'notice',
    'rail',
    'document',
  ]);
  await expect(page.locator('[data-pdf-pages]')).toBeFocused();

  const back = await walk(page, 'Shift+F6', 2);
  expect(back).toEqual(['rail', 'notice']);
  await expect(
    page.locator('[data-region="notice"]').getByRole('button', { name: 'Details' }),
  ).toBeFocused();

  expectNoPageErrors(pageErrors);
});
