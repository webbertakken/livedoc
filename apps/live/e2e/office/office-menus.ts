import type { Locator, Page } from '@playwright/test';

// The office shell's menus (docs/specs/004-interface-design/office-shell.md "Menu bar"), as a person reaches them:
// a name on the menu bar, then a submenu's row, then the item. Returns the item, for the caller to press.
export async function officeMenuItem(page: Page, path: readonly string[]): Promise<Locator> {
  const [menu, ...rest] = path;
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: menu })
    .click();
  const last = rest.pop()!;
  for (const submenu of rest)
    await page.getByRole('menuitem', { name: submenu, exact: true }).click();
  return page.getByRole('menuitem', { name: last, exact: true });
}
