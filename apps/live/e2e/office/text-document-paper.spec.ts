import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// The page's paper (docs/specs/034-text-documents/editing-surface.md "The page in the dark scheme"): dark paper and
// light ink in the dark scheme, a dark colour drawn light and a pale highlight drawn dark; white paper and the colours
// as written in the light scheme.

const BODY = '[role="textbox"][aria-label="Document body"]';

async function writeBlackOnYellow(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Plain ');
  // Black text on a light yellow highlight, from the toolbar's pickers.
  await page.keyboard.press('Shift+Home');
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  await toolbar.getByRole('button', { name: 'Text colour' }).click();
  await page
    .getByRole('group', { name: 'Text colour' })
    .getByRole('group', { name: 'Dark' })
    .getByRole('button', { name: 'Ink', exact: true })
    .click();
  await toolbar.getByRole('button', { name: 'Highlight colour' }).click();
  await page
    .getByRole('group', { name: 'Highlight colour' })
    .getByRole('group', { name: 'Light' })
    .getByRole('button', { name: 'Yellow' })
    .click();
  return { body, page: page.locator('.text-document-page') };
}

const spanStyle = (page: Page) =>
  page.evaluate((selector: string) => {
    const span = document.querySelector(`${selector} p span[style*="background"]`)!;
    const style = getComputedStyle(span);
    return { color: style.color, background: style.backgroundColor };
  }, BODY);

test.describe('in the dark scheme', () => {
  test.use({ colorScheme: 'dark' });

  test('the page is dark paper, and the colours are drawn for it', async ({ page, pageErrors }) => {
    const { page: paper } = await writeBlackOnYellow(page);
    await expect(paper).toHaveCSS('background-color', 'rgb(30, 31, 32)');
    await expect(paper).toHaveCSS('color', 'rgb(227, 227, 227)');
    const drawn = await spanStyle(page);
    // Black ink drawn near white; the pale yellow drawn as a deep yellow.
    const [ir, ig, ib] = drawn.color.match(/\d+/g)!.map(Number);
    expect(ir! + ig! + ib!).toBeGreaterThan(600);
    const [r, g, b] = drawn.background.match(/\d+/g)!.map(Number);
    expect(r! + g! + b!).toBeLessThan(300);
    expect(r!).toBeGreaterThan(b!);
    expectNoPageErrors(pageErrors);
  });
});

test.describe('in the light scheme', () => {
  test.use({ colorScheme: 'light' });

  test('the page is white paper with the colours as written', async ({ page, pageErrors }) => {
    const { page: paper } = await writeBlackOnYellow(page);
    await expect(paper).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const drawn = await spanStyle(page);
    // The ink as picked: the Text colour bar's value.
    const ink = await page
      .getByRole('toolbar', { name: 'Toolbar' })
      .locator('[data-office-control="text-colour"] [data-colour-bar]')
      .getAttribute('data-colour-bar');
    const n = Number.parseInt(ink!.slice(1), 16);
    expect(drawn.color).toBe(`rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`);
    expect(drawn.background).not.toBe('rgba(0, 0, 0, 0)');
    const [r, g, b] = drawn.background.match(/\d+/g)!.map(Number);
    expect(r! + g! + b!).toBeGreaterThan(600);
    expectNoPageErrors(pageErrors);
  });
});
