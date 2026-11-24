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
