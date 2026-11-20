import type { Page } from '@playwright/test';
import {
  expect,
  expectNoPageErrors,
  guestSigFor,
  mintSignedGuest,
  ownerHeaders,
  test,
} from './fixtures';

// Presentation mode (docs/specs/012-collaboration/presentation-mode.md): Present frames the first slide,
// the arrow keys move the camera between slides, and leaving puts the editor's view back exactly where it
// was (docs/specs/003-system-architecture/react-state-and-effects.md: captured and restored on the
// transition, in the same commit).

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const CANVAS = '[data-canvas-a11y-root]';

// A two-slide deck in a document of its own, and the page signed in as its owner.
async function openDeck(page: Page, baseURL: string) {
  const owner = await mintSignedGuest(page.request);
  const id = crypto.randomUUID();
  const tabId = crypto.randomUUID();
  const box = (bid: string, x: number, y: number) => ({
    id: bid,
    type: 'shape',
    shape: 'square',
    x,
    y,
    width: 120,
    height: 80,
    label: bid,
  });
  const deck = {
    decks: [
      {
        slides: [
          { id: 's1', tabId, elementIds: ['a'] },
          { id: 's2', tabId, elementIds: ['b'] },
        ],
      },
    ],
  };
  const seeded = await page.request.post(`${apiBase}/documents`, {
    headers: ownerHeaders(owner, { Origin: new URL(baseURL).origin }),
    data: {
      id,
      name: 'Deck',
      tabs: [{ id: tabId, name: 'Slides', elements: [box('a', 0, 0), box('b', 2000, 1500)] }],
      presentation: JSON.stringify(deck),
    },
  });
  expect(seeded.ok()).toBe(true);
  await page.addInitScript(
    ({ o, sig }) => {
      localStorage.setItem('livedoc:v2:self-id', o);
      if (sig) localStorage.setItem('livedoc:v2:self-sig', sig);
      localStorage.setItem('livedoc:v2:name-confirmed', '1');
    },
    { o: owner, sig: guestSigFor(owner) },
  );
  await page.goto(`/document/${id}`);
  await page.locator(CANVAS).waitFor();
}

async function present(page: Page) {
  await page.getByRole('button', { name: 'Selection mode' }).click();
  await page.getByText('Slide Deck', { exact: true }).first().click();
  await page.getByRole('button', { name: /^Present \d+$/ }).click();
}

test('a deck presents slide by slide and leaves the view as it was', async ({
  page,
  pageErrors,
  baseURL,
}) => {
  await openDeck(page, baseURL!);

  // The canvas camera, as its transform.
  const camera = () =>
    page.evaluate(
      () =>
        document
          .querySelector('[data-canvas-a11y-root] [style*="transform"]')
          ?.getAttribute('style')
          ?.match(/transform:[^;]+/)?.[0] ?? null,
    );
  await expect.poll(camera).not.toBeNull();
  const before = await camera();

  await present(page);
  await expect.poll(camera).not.toBe(before);
  const slideOne = await camera();

  await page.keyboard.press('ArrowRight');
  await expect.poll(camera).not.toBe(slideOne);

  await page.keyboard.press('Escape');
  await expect.poll(camera).toBe(before);
  expectNoPageErrors(pageErrors);
});

// A slide move animates as a View Transition of the canvas (docs/specs/012-collaboration/presentation-mode.md
// "Motion"): the move lands in the transition's own commit, so the browser draws the canvas's old and new pictures.
test('a slide move animates the canvas', async ({ page, pageErrors, baseURL }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: { calls: number; pictures: string[] } };
    w.__vt = { calls: 0, pictures: [] };
    const start = Document.prototype.startViewTransition;
    if (!start) return;
    Document.prototype.startViewTransition = function (this: Document, ...args) {
      w.__vt.calls++;
      const transition = start.apply(this, args as never);
      void transition.ready
        .then(() => {
          for (const a of document.getAnimations()) {
            const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? '';
            if (/^::view-transition-(old|new)\(/.test(pseudo)) w.__vt.pictures.push(pseudo);
          }
        })
        .catch(() => {});
      return transition;
    } as typeof start;
  });
  await openDeck(page, baseURL!);
  await present(page);
  // The deck has opened on its first slide; the move to the next is what is measured.
  await page.waitForTimeout(1000);
  const before = await page.evaluate(
    () => (window as unknown as { __vt: { calls: number } }).__vt.calls,
  );
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __vt: { calls: number } }).__vt.calls))
    .toBeGreaterThan(before);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __vt: { pictures: string[] } }).__vt.pictures.filter(
          (p) => !p.includes('(root)'),
        ),
      ),
    )
    .not.toEqual([]);
  expectNoPageErrors(pageErrors);
});
