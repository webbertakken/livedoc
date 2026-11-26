import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// Lines and shapes end to end (docs/specs/035-pdf-documents/marks.md "Making a mark": Line, Arrow, Rectangle, Ellipse,
// the shape tools, a press makes nothing; "In the file"; keyboard-shortcuts.md "Tools": ⇧D): each made by a drag,
// shown as it is dragged; undo takes one back; the download holds each as the standard's annotation.

/** A drag across page one between points given as fractions of its box, kept within the window. */
async function drag(
  page: Page,
  first: Locator,
  from: [number, number],
  to: [number, number],
  shift = false,
) {
  const box = (await first.boundingBox())!;
  const point = ([x, y]: [number, number]) =>
    [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...point(from));
  await page.mouse.down();
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(...point(to), { steps: 6 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

test('a line, an arrow, a rectangle and an ellipse are dragged onto a page and leave as annotations', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Shapes.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const kind = (name: string) => page.locator(`${PAGE_ONE} [data-pdf-mark-kind="${name}"]`);
  const tool = page.locator('[data-pdf-tool]');

  // ⇧D takes the Shape control's tool, Line at first; the control shows it pressed.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('Shift+D');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'line');
  await expect(page.getByRole('button', { name: 'Line', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // A press alone makes nothing; a drag makes a Line.
  await drag(page, first, [0.2, 0.2], [0.2, 0.2]);
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark]`)).toHaveCount(0);
  await drag(page, first, [0.15, 0.2], [0.45, 0.22]);
  await expect(kind('line')).toHaveCount(1);

  // ⇧D again: the Arrow, its head a second line.
  await page.keyboard.press('Shift+D');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'arrow');
  await drag(page, first, [0.15, 0.27], [0.45, 0.3]);
  await expect(kind('arrow').locator('polyline')).toHaveCount(2);

  // Insert > Shape > Rectangle; ⇧ keeps it square.
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Rectangle'])).click();
  await expect(tool).toHaveAttribute('data-pdf-tool', 'rectangle');
  await drag(page, first, [0.55, 0.2], [0.75, 0.24], true);
  await expect(kind('rectangle')).toHaveCount(1);
  const square = (await kind('rectangle').boundingBox())!;
  expect(Math.abs(square.width - square.height)).toBeLessThan(4);

  // ⇧D: the Ellipse.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('Shift+D');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'ellipse');
  await drag(page, first, [0.55, 0.32], [0.85, 0.38]);
  await expect(kind('ellipse')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('pdf-shapes.png') });

  // Undo takes the Ellipse back; redo makes it again.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(kind('ellipse')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(kind('ellipse')).toHaveCount(1);

  // Downloaded: a valid PDF holding each as the standard's annotation, appended to the file.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-shapes-')), 'Shapes.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  for (const subtype of ['/Line', '/Square', '/Circle', '/OpenArrow'])
    expect(added).toContain(subtype);
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
  expectNoPageErrors(pageErrors);
});

/** A press on page one at a point given as a fraction of its box; `count` 2 a double press. */
async function pressAt(page: Page, first: Locator, [x, y]: [number, number], count = 1) {
  const box = (await first.boundingBox())!;
  const at = [box.x + box.width * x, box.y + box.height * y] as const;
  if (count === 2) await page.mouse.dblclick(...at);
  else await page.mouse.click(...at);
}

// marks.md "Making a mark": a Polygon, a Cloud and Connected lines a corner a press, ended by a double press, a press
// on the first corner or Enter; Backspace and Escape; "Changing a mark": a corner dragged alone; "In the file".
test('a polygon, a cloud and connected lines are made a corner a press and leave as annotations', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Corners.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const kind = (name: string) => page.locator(`${PAGE_ONE} [data-pdf-mark-kind="${name}"]`);
  const tool = page.locator('[data-pdf-tool]');

  // Insert > Shape > Polygon: three presses, the third a double press, end it.
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Polygon'])).click();
  await expect(tool).toHaveAttribute('data-pdf-tool', 'polygon');
  await pressAt(page, first, [0.15, 0.1]);
  await pressAt(page, first, [0.35, 0.1]);
  await pressAt(page, first, [0.25, 0.22], 2);
  await expect(kind('polygon')).toHaveCount(1);

  // Q takes the Cloud: four presses, closed by a press on its first corner.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('q');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'cloud');
  for (const at of [
    [0.5, 0.1],
    [0.8, 0.1],
    [0.8, 0.22],
    [0.5, 0.22],
    [0.5, 0.1],
  ] as [number, number][])
    await pressAt(page, first, at);
  await expect(kind('cloud')).toHaveCount(1);

  // Connected lines: Backspace takes a corner back, Escape lets one go, Enter ends one.
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Connected lines'])).click();
  await expect(tool).toHaveAttribute('data-pdf-tool', 'polyline');
  await pressAt(page, first, [0.15, 0.3]);
  await pressAt(page, first, [0.3, 0.33]);
  await page.keyboard.press('Escape');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'polyline');
  await page.keyboard.press('Enter');
  await expect(kind('polyline')).toHaveCount(0);
  await pressAt(page, first, [0.15, 0.3]);
  await pressAt(page, first, [0.3, 0.36]);
  await pressAt(page, first, [0.45, 0.3]);
  await pressAt(page, first, [0.6, 0.36]);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await expect(kind('polyline')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('pdf-corners.png') });

  // A second Escape takes Select; a press on the Polygon's corner selects it, and its corner is dragged alone.
  await page.keyboard.press('Escape');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'select');
  await pressAt(page, first, [0.35, 0.1]);
  const corner = page.locator(`${PAGE_ONE} [data-pdf-mark-handle="corner-1"]`);
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark-handle]`)).toHaveCount(3);
  const before = (await kind('polygon').boundingBox())!;
  const handle = (await corner.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await kind('polygon').boundingBox())!.width)
    .toBeGreaterThan(before.width + 40);

  // Downloaded: a valid PDF holding each as the standard's annotation, the Cloud's border its effect.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-corners-')), 'Corners.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  for (const entry of ['/Polygon', '/PolyLine', '/Vertices', '/BE']) expect(added).toContain(entry);
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
  expectNoPageErrors(pageErrors);
});
