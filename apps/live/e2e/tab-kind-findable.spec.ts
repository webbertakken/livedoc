import type { Page } from '@playwright/test';
import { defaultCatalogue, presetSetup } from '@livedoc/items';
import {
  expect,
  expectNoPageErrors,
  guestSigFor,
  mintSignedGuest,
  ownerHeaders,
  test,
} from './fixtures';

// A tab's kind is always findable (docs/specs/007-editor/editor-modes.md "A tab's kind is always findable"): the active
// tab's glyph names it in its hover card and to a screen reader, the tab list describes each row by it, and the tab
// menu opens with it as its heading, on a phone too.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const CANVAS = '[data-canvas-a11y-root]';
const segment = (page: Page) => page.locator('[data-document-group] [data-active-tab-segment]');

async function openBoardTab(page: Page, baseURL: string) {
  const owner = await mintSignedGuest(page.request);
  const id = crypto.randomUUID();
  const headers = ownerHeaders(owner, { Origin: new URL(baseURL).origin });
  const seeded = await page.request.post(`${apiBase}/documents`, {
    headers,
    data: {
      id,
      name: 'Tracker',
      itemTypes: defaultCatalogue(),
      tabs: [
        {
          id: crypto.randomUUID(),
          name: 'Reports',
          kind: 'board',
          opensIn: 'plan',
          elements: [
            {
              id: 'board',
              type: 'shape',
              shape: 'plan-board',
              x: 100,
              y: 100,
              width: 1100,
              height: 560,
              planBoard: presetSetup('kanban'),
            },
          ],
        },
        {
          id: crypto.randomUUID(),
          name: 'Sketches',
          kind: 'diagram',
          opensIn: 'draw',
          elements: [],
        },
      ],
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

test('the active tab, the tab list and the tab menu each name the tab’s kind', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBoardTab(page, baseURL!);

  const rename = segment(page).getByRole('button', { name: 'Rename Board tab' });
  await rename.hover();
  const card = page.getByRole('tooltip').filter({ hasText: 'Board tab' });
  await expect(card).toContainText('Click to rename it.');
  await page.screenshot({ path: test.info().outputPath('kind-hover.png'), animations: 'disabled' });

  await segment(page).getByRole('button', { name: 'Tab menu' }).click();
  const menu = page.locator('[data-tour-id="tab-menu"]');
  await expect(menu.locator('[data-tab-menu-kind]')).toHaveText('Board tab');
  await page.screenshot({ path: test.info().outputPath('kind-menu.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');

  await segment(page)
    .getByRole('button', { name: /all tabs \(2\)$/ })
    .click();
  const list = page.getByRole('dialog', { name: 'Tabs' });
  await expect(list.getByRole('button', { name: 'Sketches' })).toHaveAccessibleDescription(
    'Diagram tab, in Sketch mode',
  );
  await expect(list.getByRole('button', { name: 'Reports' })).toHaveAccessibleDescription(
    'Board tab',
  );
  expectNoPageErrors(pageErrors);
});

test('on a phone, the tab menu names the tab’s kind', async ({ page, baseURL, pageErrors }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoardTab(page, baseURL!);
  await segment(page).getByRole('button', { name: 'Tab menu' }).click();
  const sheet = page.locator('[data-tour-id="tab-menu"]');
  await expect(sheet.locator('[data-tab-menu-kind]')).toHaveText('Board tab');
  await page.screenshot({
    path: test.info().outputPath('kind-menu-phone.png'),
    animations: 'disabled',
  });
  expectNoPageErrors(pageErrors);
});
