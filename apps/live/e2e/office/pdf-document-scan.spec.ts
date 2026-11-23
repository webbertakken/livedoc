import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { taggedPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// An automated accessibility scan of a PDF's surface (docs/specs/035-pdf-documents/accessibility.md "Tests"): WCAG
// 2.2 A and AA, in both schemes, in each editing mode, on a tagged file so its pages' tree is scanned too.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MODES = ['Viewing', 'Reviewing', 'Editing'] as const;

/** Each rule broken, with the elements that break it, so a failure names what to fix. */
async function broken(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(
    ({ id, nodes }) => `${id}: ${nodes.map(({ target }) => target.join(' ')).join(', ')}`,
  );
}

async function chooseMode(page: Page, mode: (typeof MODES)[number]): Promise<void> {
  const button = page.getByRole('button', { name: /^Mode: / });
  if ((await button.getAttribute('aria-label')) === `Mode: ${mode}`) return;
  await button.click();
  await page.getByRole('menuitemradio', { name: new RegExp(mode) }).click();
  await expect(page.getByRole('button', { name: `Mode: ${mode}` })).toBeVisible();
}

test('a PDF’s surface passes an accessibility scan in both schemes, in each editing mode', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Annual report.pdf', taggedPdf());
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
  await expect(page.getByRole('heading', { name: 'Annual report', level: 1 })).toBeAttached();

  const found: Record<string, string[]> = {};
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const mode of MODES) {
      await chooseMode(page, mode);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
      found[`${scheme}, ${mode}`] = await broken(page);
    }
  }
  expect(found).toEqual({
    'dark, Viewing': [],
    'dark, Reviewing': [],
    'dark, Editing': [],
    'light, Viewing': [],
    'light, Reviewing': [],
    'light, Editing': [],
  });

  expectNoPageErrors(pageErrors);
});

// "Seeing": the chrome reflows at 400% browser zoom of a 1280 px window, which is a window 320 px wide; the pages, a
// fixed layout, scroll in both directions inside their own region.
test('a PDF’s chrome reflows at 400% zoom, nothing of it scrolling sideways', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Annual report.pdf', taggedPdf());
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  await page.setViewportSize({ width: 320, height: 215 });
  await expect(page.getByRole('toolbar', { name: 'Toolbar' })).toBeVisible();
  const sideways = await page.evaluate(() => {
    const root = document.scrollingElement!;
    return root.scrollWidth - root.clientWidth;
  });
  expect(sideways).toBeLessThanOrEqual(0);
  for (const region of ['header', 'menubar', 'toolbar', 'pagebar']) {
    const box = (await page.locator(`[data-region="${region}"]`).first().boundingBox())!;
    expect(box.x, region).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, region).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: test.info().outputPath('pdf-zoom-400.png') });

  expectNoPageErrors(pageErrors);
});
