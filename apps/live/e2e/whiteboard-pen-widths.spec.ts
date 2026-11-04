import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, seedTab, test } from './fixtures';

// The three marker widths (docs/specs/023-draw-mode/draw-mode.md "Pens"): Fine, Medium and Bold in
// the marker's flyout and the quick style panel; a stored retired width reads as Bold; a stroke
// drawn wider than Bold marks no width. Dark mode; synthesised board.

const SHOTS = process.env.E2E_SHOTS_DIR;
const WIDTHS = ['Fine', 'Medium', 'Bold'];
const PREFS_KEY = 'livedoc:v2:whiteboard-pens';
const dock = (page: Page) => page.locator('[data-whiteboard-dock]');
const panel = (page: Page) => page.getByRole('region', { name: 'Quick style' });

async function openNewWhiteboard(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/new?template=whiteboard');
  await page.locator('[data-canvas-a11y-root]').waitFor({ timeout: 30_000 });
  await dock(page).waitFor();
}

test.describe('whiteboard marker widths', () => {
  test('a stored Broad pen reads as Bold, offered among three widths', async ({
    page,
    pageErrors,
  }) => {
    const warnings: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning') warnings.push(m.text());
    });
    await page.addInitScript(
      ([key]) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem(
          key!,
          JSON.stringify({
            pens: [
              { id: 'main', colour: null, width: 'medium' },
              { id: 'second', colour: 'blue', width: 'broad' },
              { id: 'third', colour: 'red', width: 'heavy' },
            ],
            activePenId: 'second',
          }),
        );
      },
      [PREFS_KEY],
    );
    await openNewWhiteboard(page);
    const marker2 = dock(page).getByRole('button', { name: 'Marker 2, blue, bold' });
    await expect(marker2).toHaveAttribute('aria-pressed', 'true');
    await expect(dock(page).getByRole('button', { name: 'Marker 3, red, bold' })).toBeVisible();
    expect(warnings).toContain('[whiteboard] pen width retired: broad → bold');
    expect(warnings).toContain('[whiteboard] pen width retired: heavy → bold');
    const stored = await page.evaluate((key) => localStorage.getItem(key), PREFS_KEY);
    const pens = (JSON.parse(stored!) as { pens: { width: string }[] }).pens;
    expect(pens.map((p) => p.width)).toEqual(['medium', 'bold', 'bold']);

    await marker2.click();
    const flyout = page.getByRole('group', { name: 'Marker 2' });
    for (const name of WIDTHS) await expect(flyout.getByRole('button', { name })).toBeVisible();
    for (const name of ['Thick', 'Heavy', 'Broad']) {
      await expect(flyout.getByRole('button', { name })).toHaveCount(0);
    }
    await expect(flyout.getByRole('button', { name: 'Bold' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    if (SHOTS) await flyout.screenshot({ path: `${SHOTS}/width-flyout.png` });
    expectNoPageErrors(pageErrors);
  });

  test('a stroke wider than Bold marks no width, and takes the one chosen', async ({
    page,
    pageErrors,
  }) => {
    await openNewWhiteboard(page);
    await seedTab(page, [
      {
        id: 'wide',
        type: 'freehand',
        x: 500,
        y: 300,
        width: 300,
        height: 60,
        points: Array.from({ length: 12 }, (_, i) => ({ nx: i / 11, ny: (i % 2) * 0.5 })),
        closed: false,
        penWidth: 9,
      },
    ]);
    await page.keyboard.press('v');
    await page.mouse.click(1400, 800);
    await page.keyboard.press('ControlOrMeta+a');
    const width = panel(page).getByRole('radiogroup', { name: 'Marker width', exact: true });
    expect(
      await width.getByRole('radio').evaluateAll((r) => r.map((e) => e.getAttribute('aria-label'))),
    ).toEqual(WIDTHS);
    await expect(width.getByRole('radio', { checked: true })).toHaveCount(0);
    if (SHOTS) await panel(page).screenshot({ path: `${SHOTS}/quick-style-wide.png` });

    await width.getByRole('radio', { name: 'Bold' }).click();
    await expect(width.getByRole('radio', { name: 'Bold' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    if (SHOTS) await panel(page).screenshot({ path: `${SHOTS}/quick-style-bold.png` });
    expectNoPageErrors(pageErrors);
  });
});
