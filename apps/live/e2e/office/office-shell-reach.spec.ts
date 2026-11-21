import { expect, expectNoPageErrors, test } from '../fixtures';

// The office shell's reach (docs/specs/004-interface-design/office-shell.md "Phone and tablet", "Motion",
// "Behaviour"; editing-surface.md "Accessibility"): every control of the title row and toolbar is reached from the
// keyboard, a phone gets one line and More, and reduced motion stills the menus.

const BODY = '[role="textbox"][aria-label="Document body"]';

async function newTextDocument(page: import('@playwright/test').Page) {
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
}

test('every control of the title row and the toolbar is reached from the keyboard', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1440, height: 860 });
  await newTextDocument(page);
  await page.getByRole('link', { name: 'Explorer' }).focus();
  const stops: string[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute('aria-label') || el?.textContent?.trim() || el?.tagName || '';
    });
    if (name === 'Document body') break;
    stops.push(name);
  }
  for (const name of ['Rename', 'Star', 'Move', 'Settings', 'Mode: Editing', 'Share', 'File'])
    expect(stops).toContain(name);
  // The toolbar is one stop; its arrows reach each of its controls (the zoom field takes a press per character).
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const controls = await toolbar.locator('[data-office-control]:visible').count();
  await toolbar.locator('[tabindex="0"]').first().focus();
  const reached = new Set<string>();
  for (let i = 0; i < controls + 8; i++) {
    reached.add(
      await page.evaluate(
        () => (document.activeElement as HTMLElement).dataset.officeControl ?? '',
      ),
    );
    await page.keyboard.press('ArrowRight');
  }
  expect(reached.size).toBe(controls);
  expectNoPageErrors(pageErrors);
});

// office-shell.md "Toolbar": every target a pointer presses in the bar is at least 24 by 24 px (WCAG 2.2 AA, 2.5.8).
test('every target in the toolbar is at least 24 by 24 px', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 1440, height: 860 });
  await newTextDocument(page);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const targets = await toolbar.locator('button:visible, input:visible').evaluateAll((elements) =>
    elements.map((e) => {
      const r = e.getBoundingClientRect();
      return {
        name: e.getAttribute('aria-label') ?? e.textContent?.trim() ?? e.tagName,
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }),
  );
  expect(targets.length).toBeGreaterThan(20);
  expect(targets.filter((t) => t.width < 24 || t.height < 24)).toEqual([]);
  expectNoPageErrors(pageErrors);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });

  test('the title row is one line, the menus live in More, the toolbar scrolls', async ({
    page,
    pageErrors,
  }) => {
    await newTextDocument(page);
    await expect(page.getByRole('menubar', { name: 'Menu bar' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
    const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
    await expect(toolbar.getByRole('combobox', { name: 'Zoom' })).toHaveCount(0);
    expect(await toolbar.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    // The title row stays one line: nothing in it overlaps the name.
    const header = await page.locator('header[data-region="header"] > div').first().boundingBox();
    expect(header!.height).toBeLessThan(60);
    await page.screenshot({ path: test.info().outputPath('phone.png') });

    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page.getByRole('menuitem', { name: 'Select all' })).toBeInViewport({ ratio: 1 });
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    await page.screenshot({ path: test.info().outputPath('phone-more.png') });
    await page.getByRole('menuitem', { name: 'Select all' }).click();
    await expect(page.locator(BODY)).toBeFocused();
    expectNoPageErrors(pageErrors);
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a menu appears without moving', async ({ page, pageErrors }) => {
    await newTextDocument(page);
    await page
      .getByRole('menubar', { name: 'Menu bar' })
      .getByRole('menuitem', { name: 'File' })
      .click();
    const duration = await page
      .getByRole('menu')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    expect(duration).toBeLessThan(0.001);
    expectNoPageErrors(pageErrors);
  });
});
