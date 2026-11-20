import { expect, expectNoPageErrors, test } from '../fixtures';

// Text colour and highlight on a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Colour"): the
// toolbar's two colour controls open the one colour picker; a standard colour, a custom colour, Reset and None change
// the writing, the bar follows the caret, and what is set stays after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('text colour and highlight colour a text document through the one picker', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const textColour = toolbar.getByRole('button', { name: 'Text colour' });
  const highlight = toolbar.getByRole('button', { name: 'Highlight colour' });
  const bar = (control: typeof textColour) => control.locator('[data-colour-bar]');

  await body.click();
  await page.keyboard.type('Field notes');
  await expect(bar(textColour)).toHaveAttribute('data-colour-bar', '#000000');
  await page.keyboard.press('ControlOrMeta+a');

  // A strong red from the Dark row: the writing keeps its selection and focus comes back to it.
  await textColour.click();
  const textPicker = page.getByRole('group', { name: 'Text colour' });
  await expect(textPicker.getByText('Theme Palette')).toHaveCount(0);
  await textPicker
    .getByRole('group', { name: 'Dark' })
    .getByRole('button', { name: 'Red' })
    .click();
  await expect(textPicker).toBeHidden();
  await expect(body).toBeFocused();
  const words = body.locator('span', { hasText: 'Field notes' }).first();
  // The toolbar reads the writing's colour once the change has drawn.
  await expect(bar(textColour)).not.toHaveAttribute('data-colour-bar', '#000000');
  const red = await bar(textColour).getAttribute('data-colour-bar');
  expect(red).toMatch(/^#[0-9a-f]{6}$/);
  // Written as picked; drawn for the page's paper (text-document-paper.spec.ts proves the drawing).
  await expect(words).toHaveAttribute(
    'style',
    new RegExp(escaped(`color: light-dark(${hexToRgb(red!)}`)),
  );

  // A custom highlight, kept among Custom Colours.
  await highlight.click();
  const highlightPicker = page.getByRole('group', { name: 'Highlight colour' });
  await highlightPicker.getByRole('button', { name: 'Add a custom colour' }).click();
  const hex = page.getByRole('textbox', { name: 'Hex' });
  await hex.fill('#ffe599');
  await hex.press('Enter');
  await expect(body.locator('span[style*="background-color"]').first()).toHaveAttribute(
    'style',
    /background-color: light-dark\(rgb\(255, 229, 153\)/,
  );
  await expect(bar(highlight)).toHaveAttribute('data-colour-bar', '#ffe599');

  // Both stay after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('span', { hasText: 'Field notes' }).first()).toBeVisible();
  await expect(body.locator('span[style*="background-color"]').first()).toHaveAttribute(
    'style',
    /background-color: light-dark\(rgb\(255, 229, 153\)/,
  );

  // Reset and None take them away again.
  await body.click();
  await page.keyboard.press('ControlOrMeta+a');
  await textColour.click();
  await page
    .getByRole('group', { name: 'Text colour' })
    .getByRole('button', { name: 'Reset' })
    .click();
  await highlight.click();
  await page
    .getByRole('group', { name: 'Highlight colour' })
    .getByRole('button', { name: 'None' })
    .click();
  await expect(body.locator('span[style*="background-color"]')).toHaveCount(0);
  await expect(body.locator('span[style*="color"]')).toHaveCount(0);
  await expect(bar(textColour)).toHaveAttribute('data-colour-bar', '#000000');
  expectNoPageErrors(pageErrors);
});

function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const escaped = (text: string) => text.replace(/[()]/g, (c) => `\\${c}`);
