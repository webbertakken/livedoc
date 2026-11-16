import type { Page } from '@playwright/test';
import { createInMode, expect, expectNoPageErrors, test } from './fixtures';

// The Workshop control end to end (docs/specs/012-collaboration/workshop-mode.md), in dark mode: an Editor's toggle in
// the actions group that brings the session kit (the Session strip; Ask and Session on the category bar) into
// Structured, Sketch and Pages, and takes it away; one undo step; the same for everyone on the tab; a Viewer sees no
// control; on a phone it keeps its name for assistive technology. Synthesised content only.

const mode = (page: Page) => page.locator('[data-editor-mode]');
const control = (page: Page) => page.getByRole('button', { name: 'Workshop', exact: true });
const timer = (page: Page) => page.getByRole('button', { name: 'Open Timer' });
const barButton = (page: Page, name: string) =>
  page.locator('[data-category-bar-button]').and(page.getByRole('button', { name, exact: true }));

async function open(page: Page, width = 1600, height = 900) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: 'dark' });
  await createInMode(page, 'diagram');
}

async function chooseMode(page: Page, name: 'Sketch' | 'Structured' | 'Pages') {
  await page.getByRole('button', { name: /^Editor mode: / }).click();
  await page.getByRole('menuitemradio', { name }).click();
}

test.describe('the Workshop control', () => {
  test('brings the session kit into Structured, Sketch and Pages, and takes it away', async ({
    page,
    pageErrors,
  }) => {
    await open(page);
    await expect(control(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(timer(page)).toHaveCount(0);
    await expect(barButton(page, 'Ask')).toHaveCount(0);

    // Structured: the strip, and the category bar with Ask and Session; Start Diagramming gives way to Start a
    // Workshop on the empty tab.
    await control(page).click();
    await expect(control(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(mode(page)).toHaveAttribute('data-workshop', 'on');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'diagram');
    await expect(timer(page)).toBeVisible();
    await expect(barButton(page, 'Ask')).toBeVisible();
    await expect(barButton(page, 'Session')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Start a Workshop' })).toBeVisible();

    // Sketch keeps the control: the strip stays, beside the dock.
    await chooseMode(page, 'Sketch');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'draw');
    await expect(control(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(timer(page)).toBeVisible();

    // Pages: the strip and the kit on its bar.
    await chooseMode(page, 'Pages');
    await expect(timer(page)).toBeVisible();
    await expect(barButton(page, 'Ask')).toBeVisible();

    // Off: the kit goes, in Pages, the mode stays.
    await control(page).click();
    await expect(control(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(mode(page)).not.toHaveAttribute('data-workshop', 'on');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'pages');
    await expect(timer(page)).toHaveCount(0);
    await expect(barButton(page, 'Ask')).toHaveCount(0);
    expectNoPageErrors(pageErrors);
  });

  test('is one undo step, followed by everyone on the tab', async ({ page, pageErrors }) => {
    await open(page);
    const other = await page.context().newPage();
    await other.emulateMedia({ colorScheme: 'dark' });
    await other.setViewportSize({ width: 1600, height: 900 });
    await other.goto(page.url());
    await other.locator('[data-canvas-a11y-root]').waitFor({ timeout: 30_000 });

    await control(page).click();
    await expect(mode(other)).toHaveAttribute('data-workshop', 'on', { timeout: 15_000 });
    await expect(timer(other)).toBeVisible();

    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(control(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(mode(other)).not.toHaveAttribute('data-workshop', 'on', { timeout: 15_000 });
    await other.close();
    expectNoPageErrors(pageErrors);
  });

  // docs/specs/012-collaboration/workshop-mode.md "Share roles": a Viewer sees no control and follows the tab.
  test('shows a Viewer no control, the tab still in its session', async ({ page, pageErrors }) => {
    await open(page);
    await control(page).click();
    await expect(timer(page)).toBeVisible();
    // The role pill previews as a Participant, then as a Viewer.
    await page.getByRole('button', { name: /^Editing/ }).click();
    await expect(control(page)).toHaveCount(0);
    await page.getByRole('button', { name: /^Participating/ }).click();
    await expect(control(page)).toHaveCount(0);
    await expect(mode(page)).toHaveAttribute('data-workshop', 'on');
    await expect(page.getByRole('button', { name: /^Editor mode: / })).toHaveCount(0);
    expectNoPageErrors(pageErrors);
  });

  test('keeps its name on a phone, where it shows its mark alone', async ({ page, pageErrors }) => {
    await open(page, 390, 844);
    await expect(control(page)).toHaveCount(1);
    await control(page).scrollIntoViewIfNeeded();
    await control(page).click();
    await expect(control(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(mode(page)).toHaveAttribute('data-workshop', 'on');
    expectNoPageErrors(pageErrors);
  });
});
