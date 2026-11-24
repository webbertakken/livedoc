import { expect, expectNoPageErrors, test } from '../fixtures';

// Text Colour and Fill Colour (plan 0020 Phase 9 box 2; docs/specs/029-sheets/formatting.md "Text and colour"): the
// toolbar's colour controls colour the selection through the one colour picker; Reset takes the colour away.

const READY = '[data-spreadsheet-surface="ready"]';

test('Text Colour and Fill Colour colour the selection and Reset takes it away', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill('A1');
  await nameBox.press('Enter');
  await page.keyboard.type('Red text');
  await page.keyboard.press('Enter');
  await nameBox.fill('A1');
  await nameBox.press('Enter');

  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const textColour = toolbar.getByRole('button', { name: 'Text Colour' });
  const fillColour = toolbar.getByRole('button', { name: 'Fill Colour' });
  const bar = (control: typeof textColour) => control.locator('[data-colour-bar]');
  await expect(bar(textColour)).toHaveAttribute('data-colour-bar', '#000000');

  await textColour.click();
  const picker = page.getByRole('group', { name: 'Text Colour' });
  await page.screenshot({
    path: test.info().outputPath('text-colour.png'),
    animations: 'disabled',
  });
  await picker.getByRole('group', { name: 'Dark' }).getByRole('button', { name: 'Red' }).click();
  await expect(picker).toBeHidden();
  await expect(bar(textColour)).not.toHaveAttribute('data-colour-bar', '#000000');

  await fillColour.click();
  await page
    .getByRole('group', { name: 'Fill Colour' })
    .getByRole('group', { name: 'Light' })
    .getByRole('button', { name: 'Yellow' })
    .click();
  await expect(bar(fillColour)).toHaveAttribute('data-colour-bar', /^#[0-9a-f]{6}$/);
  await page.screenshot({
    path: test.info().outputPath('cell-colours.png'),
    animations: 'disabled',
  });

  await textColour.click();
  await page
    .getByRole('group', { name: 'Text Colour' })
    .getByRole('button', { name: 'Reset' })
    .click();
  await expect(bar(textColour)).toHaveAttribute('data-colour-bar', '#000000');
  expectNoPageErrors(pageErrors);
});
