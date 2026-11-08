import { enableDebugLogs, expect, expectNoPageErrors, test } from './fixtures';
import { NEW_EDITOR, openExplorer } from './new-document-open';

// Brainstorm in the New Document menu (docs/specs/013-workspace/new-document-menu.md "The blanks"): its row makes a
// diagram holding one central idea that lands selected (docs/specs/009-elements/mind-node.md "A lone root opens
// selected"), so typing names it and Tab grows its first branch; its pane holds the mind maps, which Diagram's leaves
// to it.

test.use({ colorScheme: 'dark' });

const SHOTS = process.env.E2E_SHOTS_DIR;

test.beforeEach(async ({ context }) => {
  await enableDebugLogs(context);
});

test('the menu lists the mind maps under Brainstorm, never under Diagram', async ({
  page,
  pageErrors,
}) => {
  await openExplorer(page);
  await page.getByRole('button', { name: 'More new document choices' }).click();
  const row = page.getByRole('menuitem', { name: 'Brainstorm, blank' });
  await expect(row).toHaveAttribute('aria-keyshortcuts', '3');
  await row.hover();
  const pane = page.getByRole('group', { name: 'Brainstorm templates' });
  for (const name of ['Mind Map', 'Tree Mind Map', 'Bubble Map'])
    await expect(pane.getByRole('menuitem', { name, exact: true })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/brainstorm-menu.png` });
  await page.getByRole('menuitem', { name: 'Diagram, blank' }).hover();
  const diagram = page.getByRole('group', { name: 'Diagram templates' });
  await expect(diagram.getByRole('menuitem', { name: 'Flowchart', exact: true })).toBeVisible();
  await expect(diagram.getByRole('menuitem', { name: 'Mind Map', exact: true })).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});

test('Brainstorm opens on its central idea, selected: typing names it and Tab branches out', async ({
  page,
  pageErrors,
}) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await openExplorer(page);
  await page.getByRole('button', { name: 'More new document choices' }).click();
  await page.getByRole('menuitem', { name: 'Brainstorm, blank' }).click();
  await expect(page).toHaveURL(NEW_EDITOR);
  // Selected on landing: its toolbar offers Add Child, with nothing clicked.
  await expect(page.getByRole('button', { name: 'Add Child', exact: true }).first()).toBeVisible();
  expect(logs.some((l) => l.includes('[mind] lone-root selected'))).toBe(true);
  // Framed on landing, never left at the canvas origin off the top left.
  const idea = await page.getByRole('img', { name: 'Mind node "Central idea"' }).boundingBox();
  const view = page.viewportSize()!;
  expect(idea!.x).toBeGreaterThan(0);
  expect(idea!.y).toBeGreaterThan(0);
  expect(idea!.x + idea!.width).toBeLessThan(view.width);
  expect(idea!.y + idea!.height).toBeLessThan(view.height);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/brainstorm-open.png` });
  await page.keyboard.type('Weekend plans');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Beach');
  await page.keyboard.press('Escape');
  const node = (label: string) => page.getByRole('img', { name: `Mind node "${label}"` });
  await expect(node('Weekend plans')).toBeVisible();
  await expect(node('Beach')).toBeVisible();
  await expect(node('Central idea')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/brainstorm-grown.png` });
  expectNoPageErrors(pageErrors);
});
