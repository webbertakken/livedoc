import type { Page } from '@playwright/test';
import { expect, untilHydrated } from './fixtures';

// Click to editable for the New Document menu (docs/specs/013-workspace/new-document-menu.md "Opening at once"),
// measured inside the page on one clock: from the click's own timestamp to the first frame painted after the editor's
// canvas is on screen at /document/<id> (D196). Shared by the guest and the signed-in budget specs.

export const NEW_DOCUMENT_OPEN_BUDGET_MS = 200;
export const NEW_DOCUMENT_TEMPLATE_BUDGET_MS = 500;
export const NEW_EDITOR = /\/document\/[0-9a-f-]{36}(#.*)?$/;

// Installed before any page loads: the last click's time, and the moment the editor is painted after it.
const PROBE = `(() => {
  const w = window;
  w.__openProbe = { click: null, ready: null };
  document.addEventListener('click', (e) => { w.__openProbe = { click: e.timeStamp, ready: null }; }, true);
  const check = () => {
    const p = w.__openProbe;
    if (p.click === null || p.ready !== null || p.pending) return;
    if (!/^\\/document\\//.test(location.pathname)) return;
    const root = document.querySelector('[data-canvas-a11y-root]');
    if (!root || !root.checkVisibility()) return;
    p.pending = true;
    requestAnimationFrame(() => setTimeout(() => { p.ready = performance.now(); }, 0));
  };
  new MutationObserver(check).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'hidden', 'class'],
  });
})()`;

export async function installOpenProbe(page: Page): Promise<void> {
  await page.addInitScript(PROBE);
}

// The Explorer, settled: the button hydrated, what opening needs fetched and the standby built, all on idle. The
// face is named after the last blank made (New Diagram in a fresh browser); the caret keeps its name.
export async function openExplorer(page: Page): Promise<void> {
  await page.goto('/explorer/home');
  const caret = page.getByRole('button', { name: 'More new document choices' });
  await untilHydrated(caret);
  await page.waitForLoadState('networkidle');
  // The face's blank made ready while the Explorer is idle: its editor, built and hidden.
  await expect(page.locator('[data-canvas-a11y-root]')).toBeAttached();
  await caret.hover();
}

// Milliseconds from the last click to the editor painted.
export async function clickToEditable(page: Page): Promise<number> {
  await expect(page).toHaveURL(NEW_EDITOR);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __openProbe: { ready: number | null } }).__openProbe.ready,
      ),
    )
    .not.toBeNull();
  return page.evaluate(() => {
    const p = (window as unknown as { __openProbe: { click: number; ready: number } }).__openProbe;
    return Math.round(p.ready - p.click);
  });
}

export async function openBlank(page: Page): Promise<number> {
  await page.getByRole('button', { name: 'New Diagram' }).click();
  return clickToEditable(page);
}

export async function openKanban(page: Page): Promise<number> {
  await page.getByRole('button', { name: 'More new document choices' }).click();
  await page.getByRole('menuitem', { name: 'Board, blank', exact: true }).hover();
  await page
    .getByRole('group', { name: 'Board templates' })
    .getByRole('menuitem', { name: /Kanban Board/ })
    .click();
  return clickToEditable(page);
}

// The median of the runs, so one slow frame on a busy machine does not decide.
export const median = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
