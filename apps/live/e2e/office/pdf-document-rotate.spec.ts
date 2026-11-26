import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// Turning marks end to end (docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate): a stamp turned 30° by
// its handle, snapped; a Rectangle a quarter by Format > Rotate; a Text by Properties' Angle; each one step of undo;
// downloaded, each carries `Rotate` its angle and its appearance turned by its `Matrix`.

/** A point of page one given as fractions of its box. */
async function pointOn(first: Locator, [x, y]: [number, number]) {
  const box = (await first.boundingBox())!;
  return [box.x + box.width * x, box.y + box.height * y] as const;
}

/** A drag across page one between points given as fractions of its box. */
async function drag(page: Page, first: Locator, from: [number, number], to: [number, number]) {
  await page.mouse.move(...(await pointOn(first, from)));
  await page.mouse.down();
  await page.mouse.move(...(await pointOn(first, to)), { steps: 6 });
  await page.mouse.up();
}

/** The middle of a locator's box on screen. */
async function middleOf(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Selects a mark with Select by a press at `at`, and waits for its control to show it selected. */
async function select(page: Page, at: { x: number; y: number }, name: RegExp) {
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('v');
  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
}

test('marks are turned by the handle, Format > Rotate and Properties’ Angle, and leave turned', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Turning.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const kind = (name: string) => page.locator(`${PAGE_ONE} [data-pdf-mark-kind="${name}"]`);
  const outline = page.locator(`${PAGE_ONE} [data-pdf-mark-outline]`);

  // A stamp, selected: its rotate handle stands above it. Dragged 37° anticlockwise, it turns 30°, snapped.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('k');
  await page.mouse.click(...(await pointOn(first, [0.3, 0.2])));
  await select(page, await middleOf(kind('stamp')), /^Stamp by /);
  const knob = page.locator(`${PAGE_ONE} [data-pdf-rotate-handle]`);
  await expect(knob).toBeVisible();
  const middle = await middleOf(kind('stamp'));
  const rest = await middleOf(knob);
  const reach = Math.hypot(rest.x - middle.x, rest.y - middle.y);
  const swung = (Math.PI * (90 + 37)) / 180;
  await page.mouse.move(rest.x, rest.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + reach * Math.cos(swung), middle.y - reach * Math.sin(swung), {
    steps: 8,
  });
  await page.screenshot({ path: test.info().outputPath('pdf-rotate-handle-dragging.png') });
  await page.mouse.up();
  await expect(outline).toHaveCount(1);
  await expect(outline).toHaveJSProperty('tagName', 'polygon');
  await page.screenshot({ path: test.info().outputPath('pdf-rotate-stamp-turned.png') });

  // Undo stands it upright again; redo turns it again.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(outline).toHaveJSProperty('tagName', 'rect');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(outline).toHaveJSProperty('tagName', 'polygon');

  // A Rectangle, turned a quarter by Format > Rotate > Counterclockwise: it stands on end.
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Rectangle'])).click();
  await drag(page, first, [0.55, 0.12], [0.8, 0.18]);
  const flat = (await kind('rectangle').boundingBox())!;
  await select(page, { x: flat.x + 1, y: flat.y + flat.height / 2 }, /^Rectangle by /);
  await (await officeMenuItem(page, ['Format', 'Rotate', 'Counterclockwise'])).click();
  await expect
    .poll(async () => {
      const box = (await kind('rectangle').boundingBox())!;
      return box.height > box.width;
    })
    .toBe(true);

  // A Text, turned to 30° by Properties' Angle: 37 typed is taken to 30.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('x');
  await page.mouse.click(...(await pointOn(first, [0.15, 0.3])));
  await page.keyboard.type('Turned words');
  await page.keyboard.press('Escape');
  await expect(kind('text').locator('text')).toHaveText(['Turned words']);
  await select(page, await middleOf(kind('text')), /^Text by /);
  await (await officeMenuItem(page, ['Format', 'Properties'])).click();
  const angle = page.getByRole('complementary', { name: 'Properties' }).getByLabel('Angle');
  await expect(angle).toHaveValue('0');
  await angle.fill('37');
  await angle.press('Enter');
  await expect(angle).toHaveValue('30');
  await expect(outline).toHaveJSProperty('tagName', 'polygon');
  await page.screenshot({ path: test.info().outputPath('pdf-rotate-text-angle.png') });

  // Downloaded: the stamp and the Text carry Rotate 30, the Rectangle Rotate 90, each appearance turned.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-turning-')), 'Turning.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  expect(added.match(/\/Rotate 30\b/g)).toHaveLength(2);
  expect(added).toContain('/Rotate 90');
  expect(added).toMatch(/\/Matrix \[0\.866\d* 0\.5 -0\.5 0\.866\d* /);
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
  expectNoPageErrors(pageErrors);
});
