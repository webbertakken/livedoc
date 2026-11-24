import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Drawings (docs/specs/034-text-documents/objects.md "Drawings"): Insert > Drawing > New opens an empty drawing tab in
// the canvas editor, under a bar naming its text document; a square drawn and Save and close leave a picture of it at
// the caret, naming its drawing tab, and the document still shows no tab strip. The picture draws the drawing live; a
// double-click opens it again, and Save and close makes the same one picture again.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('a new drawing is drawn in the canvas and placed in the writing', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Before ');

  await (await officeMenuItem(page, ['Insert', 'Drawing', 'New'])).click();
  const bar = page.getByRole('region', { name: 'Drawing', exact: true });
  await expect(bar).toContainText('Drawing in');
  await expect(page.locator('[data-text-document-surface]')).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('drawing-open.png') });

  // A square in the middle of the canvas.
  await page.keyboard.press('r');
  await page.mouse.click(640, 430);
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Save and close' }).click();

  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const picture = body.locator('.text-document-picture');
  await expect(picture).toHaveCount(1);
  await expect(bar).toHaveCount(0);
  // Its one listed tab is the text document: no tab strip, drawing or not.
  await expect(page.getByRole('button', { name: /Drawing 1/ })).toHaveCount(0);
  // Drawn live from its tab over its PNG (objects.md "Drawn").
  await expect(picture.locator('[data-drawing-svg] > svg > g')).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('drawing-placed.png') });

  // Selected, its bar offers Edit (objects.md "The picture's bar").
  await picture.click();
  const edit = page.getByRole('toolbar', { name: 'Drawing' }).getByRole('button', { name: 'Edit' });
  await expect(edit).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('drawing-selected.png') });
  const firstMedia = await picture.getAttribute('data-media');

  // Opened again by a double-click, a second square drawn, Save and close: the same one picture, made again.
  await picture.dblclick();
  await expect(bar).toContainText('Drawing in');
  await page.keyboard.press('r');
  await page.mouse.click(820, 430);
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Save and close' }).click();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(picture).toHaveCount(1);
  await expect(picture).not.toHaveAttribute('data-media', firstMedia ?? '');
  // Both squares drawn live once the redraw has caught up (each element is a group of the drawing).
  await expect(picture.locator('[data-drawing-svg] > svg > g')).toHaveCount(2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('drawing-again.png') });
  expectNoPageErrors(pageErrors);
});

// objects.md "One drawing, one picture": a drawing's picture copied shares its drawing until one is opened; opening the
// copy gives it its own drawing, so what is drawn there never changes the first picture.
test('a copied drawing gets its own drawing when opened', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await (await officeMenuItem(page, ['Insert', 'Drawing', 'New'])).click();
  const bar = page.getByRole('region', { name: 'Drawing', exact: true });
  await expect(bar).toContainText('Drawing in');
  await page.keyboard.press('r');
  await page.mouse.click(640, 430);
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Save and close' }).click();
  const pictures = body.locator('.text-document-picture');
  await expect(pictures).toHaveCount(1);
  const shapes = (at: number) => pictures.nth(at).locator('[data-drawing-svg] > svg > g');
  await expect(shapes(0)).toHaveCount(1);

  // Copied and pasted after itself: two pictures of the one drawing.
  await pictures.first().click();
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(pictures).toHaveCount(2);

  // The copy opened, a second square drawn: the copy shows two, the first still one.
  await pictures.nth(1).dblclick();
  await expect(bar).toContainText('Drawing in');
  await page.keyboard.press('r');
  await page.mouse.click(820, 430);
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Save and close' }).click();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(shapes(1)).toHaveCount(2);
  await expect(shapes(0)).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('drawing-own-copy.png') });
  expectNoPageErrors(pageErrors);
});
