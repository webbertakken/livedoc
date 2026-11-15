import { expect, expectNoPageErrors, startBlankDocument, test } from './fixtures';

// The diagram pencil is one-shot (docs/specs/008-canvas/two-pens.md): lifting it lands the stroke, selects it and
// puts the pencil down. The three happen in one transition (docs/specs/008-canvas/canvas-performance.md "A one-shot
// pen's stroke lands in a transition"), and must still all happen. Dark mode; synthesised content only.

const CANVAS = '[data-canvas-a11y-root]';

test('a pencil stroke lands selected, and the pencil goes down', async ({ page, pageErrors }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await startBlankDocument(page);
  const sketches = page.locator(CANVAS).getByRole('img', { name: /^Sketch/ });
  const viewport = page.viewportSize()!;
  const at = { x: viewport.width / 2 - 120, y: viewport.height / 2 };

  await page.keyboard.press('p');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let k = 1; k <= 20; k++) await page.mouse.move(at.x + k * 8, at.y + Math.sin(k / 3) * 30);
  await page.mouse.up();

  await expect(sketches).toHaveCount(1);
  await expect(page.locator('[data-testid="selection-popover"]')).toBeVisible();

  // The pencil is down: a drag over bare canvas draws nothing more.
  await page.mouse.move(at.x, at.y + 180);
  await page.mouse.down();
  await page.mouse.move(at.x + 140, at.y + 220, { steps: 6 });
  await page.mouse.up();
  await expect(sketches).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});
