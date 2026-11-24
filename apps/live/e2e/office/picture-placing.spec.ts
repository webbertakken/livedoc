import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { documentWithPicture } from './office-pictures';

// Image options' Text wrapping and Position (docs/specs/034-text-documents/objects.md "In the editor"): a picture
// leaving In line stays where it is drawn and the text runs beside it; switching to Fix position on page and back
// keeps it in place; Margin from text widens the room; In line puts it back in its line, and undo brings it out again.

const WORDS =
  ' Words run on after the picture, line after line, as the column has room for them.'.repeat(4);

test('a picture is wrapped and positioned from Image options', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  const { body, picture } = await documentWithPicture(page, 'Placed:');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(WORDS);
  const image = picture.locator('img');
  const at = async () => {
    const box = (await image.boundingBox())!;
    return {
      x: Math.round(box.x),
      y: Math.round(box.y),
      right: box.x + box.width,
      bottom: box.y + box.height,
    };
  };
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2);
  };
  // The first line's text boxes beside the picture: right of it, or none.
  const besideRight = (bottom: number) =>
    body
      .locator('p')
      .first()
      .evaluate((p, bottom) => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        const lefts: number[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          range.selectNodeContents(node);
          for (const r of range.getClientRects())
            if (r.width > 0 && r.top < bottom) lefts.push(r.left);
        }
        return lefts;
      }, bottom);

  await picture.click();
  await (await officeMenuItem(page, ['Format', 'Image', 'Image options'])).click();
  const panel = page.getByRole('complementary', { name: 'Image options' });
  await expect(panel.getByRole('radio', { name: 'In line' })).toBeChecked();
  await expect(panel.getByRole('radio', { name: 'Fix position on page' })).toBeDisabled();
  const inLine = await at();

  // Wrap text: where it stood, the words running beside it, ⅛ in clear.
  await panel.getByRole('radio', { name: 'Wrap text' }).click();
  await expect(body.locator('.text-document-picture-placed')).toHaveCount(1);
  near(await at(), inLine);
  await expect(panel.getByRole('textbox', { name: 'Margin from text' })).toHaveValue('0.13');
  const wrapped = await at();
  const lefts = await besideRight(wrapped.bottom);
  expect(lefts.some((left) => left >= wrapped.right + 10)).toBe(true);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('picture-wrapped.png') });

  // Margin from text: half an inch, the words further off.
  const margin = panel.getByRole('textbox', { name: 'Margin from text' });
  await margin.fill('0.5');
  await margin.press('Enter');
  await expect
    .poll(async () =>
      Math.min(...(await besideRight(wrapped.bottom)).filter((l) => l > wrapped.right)),
    )
    .toBeGreaterThanOrEqual(wrapped.right + 46);

  // Fixed on the page and back with its text: never moving.
  await panel.getByRole('radio', { name: 'Fix position on page' }).click();
  await expect(panel.getByRole('radio', { name: 'Fix position on page' })).toBeChecked();
  near(await at(), inLine);
  await panel.getByRole('radio', { name: 'Move with text' }).click();
  await expect(panel.getByRole('radio', { name: 'Move with text' })).toBeChecked();
  near(await at(), inLine);

  // In line: back in its line; undo brings it out again.
  await panel.getByRole('radio', { name: 'In line' }).click();
  await expect(body.locator('.text-document-picture-placed')).toHaveCount(0);
  await expect(panel.getByRole('radio', { name: 'Move with text' })).toBeDisabled();
  await body.focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(body.locator('.text-document-picture-placed')).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});

// objects.md "The picture's bar": under a selected picture, the wraps (the one in force pressed) and Image options.
test('a picture is wrapped from its bar', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  const { body, picture } = await documentWithPicture(page, 'Barred:');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(WORDS);
  await picture.click();
  const bar = page.getByRole('toolbar', { name: 'Image' });
  await expect(bar.getByRole('button', { name: 'In line' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const before = (await picture.locator('img').boundingBox())!;
  await bar.getByRole('button', { name: 'Break text' }).click();
  await expect(body.locator('.text-document-picture-placed')).toHaveCount(1);
  await expect(bar.getByRole('button', { name: 'Break text' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const after = (await picture.locator('img').boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('picture-bar.png') });

  // Alt+F10 reaches the bar from the picture; Image options opens the panel on it.
  // Placed, its anchor has no size: the picture is pressed where it is drawn.
  await picture.locator('img').click();
  await page.keyboard.press('Alt+F10');
  await expect(bar.getByRole('button', { name: 'In line' })).toBeFocused();
  await bar.getByRole('button', { name: 'Image options' }).click();
  const panel = page.getByRole('complementary', { name: 'Image options' });
  await expect(panel.getByRole('radio', { name: 'Break text' })).toBeChecked();
  expectNoPageErrors(pageErrors);
});

// objects.md "Dragging a placed picture", "Guides": a selected placed picture follows the pointer, its left edge
// snapping to its column's with a guide drawn, its move one undo step.
test('a placed picture is dragged, snapping to its column', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  const { body, picture } = await documentWithPicture(page, 'Dragged:');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(WORDS);
  await picture.click();
  await page
    .getByRole('toolbar', { name: 'Image' })
    .getByRole('button', { name: 'In front of text' })
    .click();
  const image = picture.locator('img');
  await image.click();
  const start = (await image.boundingBox())!;
  const column = (await body.locator('p').first().boundingBox())!;

  // Dragged 60 px right and 30 down: it follows.
  await page.mouse.move(start.x + 20, start.y + 20);
  await page.mouse.down();
  await page.mouse.move(start.x + 50, start.y + 35, { steps: 4 });
  await page.mouse.move(start.x + 80, start.y + 50, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await image.boundingBox())!.x - start.x)).toBe(60);
  const moved = (await image.boundingBox())!;
  expect(Math.round(moved.y - start.y)).toBe(30);

  // Dragged to 2 px off its column's left edge: it snaps there, the guide drawn while dragging.
  await page.mouse.move(moved.x + 20, moved.y + 20);
  await page.mouse.down();
  await page.mouse.move(column.x + 2 + 20, moved.y + 20, { steps: 6 });
  await expect(body.locator('.text-document-picture-guide')).toHaveCount(1);
  await page.waitForTimeout(200);
  await page.screenshot({ path: test.info().outputPath('picture-guide.png') });
  await page.mouse.up();
  await expect(body.locator('.text-document-picture-guide')).toHaveCount(0);
  await expect
    .poll(async () => Math.round((await image.boundingBox())!.x))
    .toBe(Math.round(column.x));

  // Undo puts it back where the first drag left it.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => Math.round((await image.boundingBox())!.x - moved.x)).toBe(0);
  expectNoPageErrors(pageErrors);
});
