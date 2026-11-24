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

/**
 * Chooses a mode where it is offered and answers true; where it is not (Editing, until PDFs have it), leaves the
 * mode menu open on its dimmed item and its reason, and answers false.
 */
async function chooseMode(page: Page, mode: (typeof MODES)[number]): Promise<boolean> {
  const button = page.getByRole('button', { name: /^Mode: / });
  if ((await button.getAttribute('aria-label')) === `Mode: ${mode}`) return true;
  await button.click();
  const item = page.getByRole('menuitemradio', { name: new RegExp(mode) });
  if ((await item.getAttribute('aria-disabled')) === 'true') return false;
  await item.click();
  await expect(page.getByRole('button', { name: `Mode: ${mode}` })).toBeVisible();
  return true;
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
  await expect(
    page
      .getByRole('region', { name: 'Page 1 of 2' })
      .getByRole('heading', { name: 'Annual report', level: 1 }),
  ).toBeAttached();

  const found: Record<string, string[]> = {};
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const mode of MODES) {
      const offered = await chooseMode(page, mode);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
      found[`${scheme}, ${mode}`] = await broken(page);
      if (!offered) await page.keyboard.press('Escape');
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

// "Seeing" (WCAG 1.4.4): on a phone a PDF tab's page zooms with the browser, the editor's pin dropped while it shows.
// Two fingers drawn apart across the title row, as raw touches: Chromium's synthetic touch pinch does not zoom a
// headless page, a zoomable one included.
async function pinch(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const fingers = (apart: number) => [
    { x: 196 - apart, y: 30, id: 0 },
    { x: 196 + apart, y: 30, id: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(20) });
  for (let apart = 25; apart <= 150; apart += 5) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(apart) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const pageScale = (page: Page) => page.evaluate(() => window.visualViewport?.scale ?? 1);

test.describe('on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

  test('a PDF tab’s page zooms with a pinch, the chrome’s text with it', async ({
    page,
    pageErrors,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/explorer/all');
    await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
    await dropPdf(page, 'Annual report.pdf', taggedPdf());
    await page.waitForURL(/\/document\//, { timeout: 30_000 });
    await pageOneDrawn(page);

    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute('content', 'width=device-width, initial-scale=1');
    await pinch(page);
    await expect.poll(() => pageScale(page)).toBeGreaterThan(1.5);
    await page.screenshot({ path: test.info().outputPath('pdf-phone-pinched.png') });

    // A canvas route keeps its pin: the same pinch leaves its page as it is (the unit test holds the pin's return).
    await page.goto('/new');
    await expect(viewport).toHaveAttribute('content', /user-scalable=no/);
    await pinch(page);
    expect(await pageScale(page)).toBe(1);

    expectNoPageErrors(pageErrors);
  });
});
