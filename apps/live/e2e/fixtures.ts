import {
  test as base,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import type { StoredDocument, StoredTab } from './stored';
import { DEBUG_STORAGE_KEY } from '../lib/debug-log';

// Shared fixture (docs/specs/003-system-architecture/e2e-smoke.md): every smoke test fails on an uncaught
// exception or unhandled rejection surfaced to the page — the class the
// "maximum update depth" pan-loop bug was in, which the per-test UI
// checks merely exercise. `pageErrors` collects them; assert it stays
// empty (directly, or via expectNoPageErrors in an afterEach-style
// check at the end of a test).
//
// Deliberately narrow: we listen to `pageerror` (real uncaught
// throws / rejections) and `console.error`. Expected-benign noise —
// a favicon 404, React's dev double-invoke notices — is filtered so a
// green run means "no real error", not "no output".
const IGNORED_ERROR_PATTERNS: RegExp[] = [
  /favicon/i,
  /manifest\.webmanifest/i,
  // Next.js dev-only HMR / fast-refresh chatter (absent from the CI
  // production build, present when reusing a local `pnpm dev`).
  /\[Fast Refresh\]/i,
  /Download the React DevTools/i,
  // Chromium logs every non-2xx fetch/XHR to the console as a generic
  // "Failed to load resource" line — browser chrome, not app logic,
  // and never carries the URL. Expected app flows probe endpoints that
  // 404 (a fresh guest's participant is looked-up-then-created). Real
  // failures surface as uncaught throws via `pageerror`, which we do
  // catch; this generic line is noise.
  /Failed to load resource/i,
  // The photo-import e2e blocks model downloads (nothing may pull weights over
  // the wire in a test), so a blocked fetch surfaces as a pageerror there. That
  // is the setup working, not an app bug.
  /huggingface|onnxruntime|transformers/i,
];

function isIgnored(text: string): boolean {
  return IGNORED_ERROR_PATTERNS.some((re) => re.test(text));
}

// The editor's debug flag (docs/specs/003-system-architecture/console-logging.md): the suite drives
// the production build, which writes its trace lines only with it set, and specs wait for some of
// them (`[drive-mirror] pass-end`). Set before any page of the context loads.
export async function enableDebugLogs(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ([key]) => {
      try {
        localStorage.setItem(key, '*');
      } catch {
        // A page with no storage (about:blank, a sandboxed frame) has no trace lines to show.
      }
    },
    [DEBUG_STORAGE_KEY] as const,
  );
}

export const test = base.extend<{ pageErrors: string[] }>({
  context: async ({ context }, use) => {
    await enableDebugLogs(context);
    await use(context);
  },
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      const text = `${err.name}: ${err.message}`;
      if (!isIgnored(text)) errors.push(text);
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!isIgnored(text)) errors.push(text);
    });
    await use(errors);
  },
});

export { expect };

// Assert the collected errors are empty with a readable failure that
// names what leaked.
export function expectNoPageErrors(pageErrors: string[]): void {
  expect(pageErrors, `unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
}

// Opens a focused control's context menu from the keyboard. Chromium turns Shift+F10 into a `contextmenu` event
// on Windows and Linux only: macOS has no such key (VoiceOver's VO+Shift+M sends the event itself), so there the
// test sends the event the platform would.
export async function openContextMenuFromKeyboard(target: Locator): Promise<void> {
  await target.focus();
  if (process.platform === 'darwin') await target.dispatchEvent('contextmenu');
  else await target.page().keyboard.press('Shift+F10');
}

// The wizard is a static export: its buttons are in the HTML before React attaches their handlers. A mode
// card clicked in that gap is kept and acted on at hydration (new-document-route.md "A choice before
// hydration"), but every other control's click in that gap does nothing, more often the busier the
// machine. React tags every element it has hydrated with a `__reactProps$` key; wait for it on the
// element about to be used.
export async function untilHydrated(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate((el) => Object.keys(el).some((key) => key.startsWith('__reactProps$'))),
    )
    .toBe(true);
}

// The wizard asks only for a mode (docs/specs/007-editor/new-document-route.md "One-step wizard"): choosing one
// creates the document there and then, and lands on the editor with the mode's start screen over the canvas
// (docs/specs/007-editor/start-diagramming.md).
// Resolves to the new document's id; `url` carries a `/new?folder=` / `?team=` context.
export async function createInMode(page: Page, mode: string, url = '/new'): Promise<string> {
  await page.goto(url);
  await page.getByText('New Document', { exact: false }).waitFor();
  const card = page.locator(`[data-new-mode="${mode}"]`);
  await untilHydrated(card);
  await card.click();
  await page.locator('[data-canvas-a11y-root]').waitFor({ timeout: 30_000 });
  return new URL(page.url()).pathname.split('/').pop()!;
}

// The start screen over a new tab, by its mode's title (Start Diagramming, ...).
const startScreen = (page: Page, title: RegExp = /^Start /) =>
  page.getByRole('region', { name: title });

// Start a document from a named TEMPLATE in a named group of Start Diagramming: a Diagram document from the
// wizard, then the template picked on its start screen, so template creation (builders, layers, per-template
// canvas overrides, the tab kind) is its own path, as a person takes it.
export async function startTemplateDocument(
  page: Page,
  group: string,
  template: RegExp,
): Promise<void> {
  await createInMode(page, 'diagram');
  const start = startScreen(page, /^Start Diagramming$/);
  const rail = start.locator(`[data-rail]`).filter({ hasText: group }).first();
  await untilHydrated(rail);
  await rail.click();
  await start.getByRole('button', { name: template }).first().click();
  await start.waitFor({ state: 'detached' });
}

// An event-storming board with a ROW of three domain events on it, one gutter
// apart (docs/specs/021-event-storming/event-storming.md). The template seeds a single "Board Created" note; the lane,
// rhythm and insertion tests need neighbours to place against, so this writes
// a row around that note through the api and reloads. The three are copies of
// the seeded note (so they carry exactly its stationery), one rhythm step apart.
export async function startEventStormingRow(page: Page): Promise<void> {
  await startTemplateDocument(page, 'Technical', /^Event storming/i);
  const notes = page.locator('[data-canvas-a11y-root]').getByRole('img', { name: /^Sticky note/ });
  await notes.first().waitFor();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
  const headers = await pageOwnerHeaders(page, { 'Content-Type': 'application/json' });
  await page.evaluate(
    async ({ base, headers }) => {
      const id = location.pathname.split('/').filter(Boolean).pop()!;
      // Wait for the new board's first save to land (its seeded note on the
      // server), so the row is not written over by it.
      type Seed = { width: number; x: number };
      let tab: (Record<string, unknown> & { elements: Seed[] }) | null = null;
      let tabId = '';
      for (let i = 0; i < 50 && !tab; i += 1) {
        const liveDoc = (await (
          await fetch(`${base}/documents/${id}`, { headers })
        ).json()) as StoredDocument;
        tabId = liveDoc.document?.tabs?.[0]?.id ?? '';
        if (tabId) {
          const got = (await (
            await fetch(`${base}/documents/${id}/tabs/${tabId}`, { headers })
          ).json()) as StoredTab<Seed>;
          if (got.tab?.elements?.length === 1) tab = { ...got.tab, elements: got.tab.elements };
        }
        if (!tab) await new Promise((r) => setTimeout(r, 100));
      }
      if (!tab) throw new Error('the new board never saved its seed note');
      const seed = tab.elements[0]!;
      const step = seed.width + 16;
      const labels = ['Order placed', 'Payment received', 'Order shipped'];
      const elements = labels.map((label, i) => ({
        ...seed,
        id: crypto.randomUUID(),
        label,
        x: seed.x + (i - 1) * step,
        rotation: i % 2 === 0 ? -1.1 : 1.1,
      }));
      const res = await fetch(`${base}/documents/${id}/tabs/${tabId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...tab, elements }),
      });
      if (!res.ok) throw new Error(`seeding the row failed: ${res.status}`);
    },
    { base: apiBase, headers },
  );
  await page.reload();
  await notes.nth(2).waitFor();
}

// A blank canvas straight away: /new?blank=1, the wizard bypass Start Blank
// links to (docs/specs/007-editor/new-document-route.md).
export async function openStartBlank(page: Page): Promise<void> {
  await page.goto('/new?blank=1');
  await page.locator('[data-canvas-a11y-root]').waitFor({ timeout: 30_000 });
}

// A blank Structured tab with the Workshop control on, straight away: /new?template=blank-session creates it with no
// wizard (docs/specs/012-collaboration/workshop-mode.md "Templates"). Where the session kit is: the Collaborate and
// Stickers categories and the Session strip.
export async function openBlankSession(page: Page): Promise<void> {
  await page.goto('/new?template=blank-session');
  await page.locator('[data-canvas-a11y-root]').waitFor({ timeout: 30_000 });
}

// A blank Diagram document through the wizard: Diagram on the Mode step, Create, then the start screen's × (a blank
// canvas, docs/specs/007-editor/start-diagramming.md "Bringing it back").
export async function startBlankDocument(page: Page): Promise<void> {
  await createInMode(page, 'diagram');
  const start = startScreen(page, /^Start Diagramming$/);
  await start.getByRole('button', { name: 'Close' }).click();
  await start.waitFor({ state: 'detached' });
}

export type Seed = Record<string, unknown>[];

// Write the seed into the new document's first tab through the api, reload. `tabFields` lands on the tab beside its
// elements (its pages, the mode it opens in).
export async function seedTab(
  page: Page,
  elements: Seed,
  tabFields: Record<string, unknown> = {},
): Promise<void> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
  const headers = await pageOwnerHeaders(page, { 'Content-Type': 'application/json' });
  await page.evaluate(
    async ({ base, elements, headers, tabFields }) => {
      const id = location.pathname.split('/').filter(Boolean).pop()!;
      let tab: Record<string, unknown> | null = null;
      let tabId = '';
      for (let i = 0; i < 50 && !tab; i += 1) {
        const liveDoc = (await (
          await fetch(`${base}/documents/${id}`, { headers })
        ).json()) as StoredDocument;
        tabId = liveDoc.document?.tabs?.[0]?.id ?? '';
        if (tabId) {
          const got = (await (
            await fetch(`${base}/documents/${id}/tabs/${tabId}`, { headers })
          ).json()) as StoredTab;
          tab = got.tab ?? null;
        }
        if (!tab) await new Promise((r) => setTimeout(r, 100));
      }
      if (!tab) throw new Error('the new document never saved its first tab');
      const res = await fetch(`${base}/documents/${id}/tabs/${tabId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...tab, ...tabFields, elements }),
      });
      if (!res.ok) throw new Error(`seeding failed: ${res.status}`);
    },
    { base: apiBase, elements, headers, tabFields },
  );
  await page.reload();
  await page.locator('[data-canvas-a11y-root]').waitFor();
  // The seeded elements pop in (a short scale animation) after the canvas mounts: a test that
  // measures or drags one before it settles works from a box that is still changing.
  const first = elements.find((el) => typeof el.id === 'string');
  if (first) await settledBox(page.locator(`[data-element-id="${String(first.id)}"]`).first());
}

// A guest as production makes one: minted and signed by the api worker
// (docs/specs/014-identity/auth-and-guest-access.md). The e2e stack signs guest ids, so a hand-made
// unsigned id would be upgraded (and its data moved) the moment the app opens.
const guestSigs = new Map<string, string>();

export async function mintSignedGuest(
  request: import('@playwright/test').APIRequestContext,
): Promise<string> {
  const res = await request.post(`${process.env.NEXT_PUBLIC_API_BASE ?? '/api'}/guest-id`, {
    data: {},
  });
  expect(res.ok()).toBe(true);
  const { ownerId, ownerSig } = (await res.json()) as { ownerId: string; ownerSig: string | null };
  if (ownerSig) guestSigs.set(ownerId, ownerSig);
  return ownerId;
}

export function guestSigFor(owner: string): string | null {
  return guestSigs.get(owner) ?? null;
}

export function ownerHeaders(
  owner: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const sig = guestSigs.get(owner);
  return { 'X-Owner-Id': owner, ...(sig ? { 'X-Owner-Sig': sig } : {}), ...extra };
}

// The page's OWN guest identity as request headers, for api calls a spec makes from inside the page
// (`page.evaluate`, which cannot import this module). The stack enforces guest signatures as
// production does, so the id travels with the signature the app stored beside it. Read once, before
// the evaluate, and passed in as an argument.
export async function pageOwnerHeaders(
  page: Page,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const { id, sig } = await page.evaluate(() => ({
    id: localStorage.getItem('livedoc:v2:self-id') ?? '',
    sig: localStorage.getItem('livedoc:v2:self-sig'),
  }));
  return { 'X-Owner-Id': id, ...(sig ? { 'X-Owner-Sig': sig } : {}), ...extra };
}

// A box once it has stopped moving: a surface that pops in (the `pop-in` scale animation) reports a
// smaller, then overshooting, box until it settles, so one measurement mid-animation, or two from
// different frames, misplaces its edges.
export async function settledBox(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  let last = '';
  let box: { x: number; y: number; width: number; height: number } | null = null;
  await expect
    .poll(async () => {
      box = await locator.boundingBox();
      const now = JSON.stringify(box);
      const still = box !== null && now === last;
      last = now;
      return still;
    })
    .toBe(true);
  return box!;
}

/** A palette tile (docs/specs/007-editor/toolbar-layout.md). On the category bar (Pages, Workshop control on): from its
 *  category's flyout, opened by a press (so it stays open whatever the pointer does next) unless already showing. On
 *  the category picker's strip (Structured, Plan): the tile on the strip when the current category shows it, else the
 *  category picked first, then More when the strip has no room for it. */
export async function paletteTile(page: Page, name: string, category = 'Shapes'): Promise<Locator> {
  await page.locator('[data-toolbar-palette]').waitFor();
  const button = page.locator(`[data-category-bar-button][aria-label="${category}"]`);
  if ((await button.count()) > 0) {
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    const tile = page
      .locator('[data-category-flyout]')
      .getByRole('button', { name, exact: true })
      .first();
    await tile.waitFor();
    return tile;
  }
  const strip = page.locator('[data-toolbar-palette]');
  const onStrip = () => strip.getByRole('button', { name, exact: true }).first();
  if (await onStrip().isVisible()) return onStrip();
  await strip.getByRole('button', { name: 'Palette category' }).click();
  await page
    .locator('[data-tour-id="palette-category-menu"]')
    .getByRole('option', { name: category })
    .first()
    .click();
  // The new category's tiles refit the strip (More comes and goes as they fit), so it is read once it is still.
  await settledBox(page.locator('[data-tour-id="palette"]'));
  if (await onStrip().isVisible()) return onStrip();
  await strip.locator('button[data-toolbar-more-button]').click();
  const tile = page.getByRole('button', { name, exact: true }).first();
  await tile.waitFor();
  return tile;
}

// Switch to a tab by name through the tab list (docs/specs/007-editor/toolbar-layout.md "The tab list"): the document
// group's tab stack opens it, a row switches and closes it.
export async function switchToTab(page: Page, name: string | RegExp): Promise<void> {
  await page.locator('[data-document-group] [data-tab-stack]').click();
  const list = page.getByRole('dialog', { name: 'Tabs' });
  await list.getByRole('button', { name, exact: typeof name === 'string' }).click();
  await expect(list).toHaveCount(0);
}

// The first tab's elements as the api has them, once autosave has caught up with `ready`.
export async function savedTabElements<T extends { id: string }>(
  page: Page,
  ready: (els: T[]) => boolean,
): Promise<T[]> {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
  const headers = await pageOwnerHeaders(page);
  let last: T[] = [];
  await expect
    .poll(
      async () => {
        last = await page.evaluate(
          async ({ base, headers }) => {
            const id = location.pathname.split('/').filter(Boolean).pop()!;
            const doc = (await (await fetch(`${base}/documents/${id}`, { headers })).json()) as {
              document?: { tabs?: { id: string }[] };
            };
            const tabId = doc.document?.tabs?.[0]?.id;
            const got = (await (
              await fetch(`${base}/documents/${id}/tabs/${tabId}`, { headers })
            ).json()) as { tab?: { elements?: never[] } };
            return got.tab?.elements ?? [];
          },
          { base, headers },
        );
        return ready(last);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return last;
}
