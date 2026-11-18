import type { Page } from '@playwright/test';
import { test, expect, expectNoPageErrors, mintSignedGuest, ownerHeaders } from './fixtures';

// docs/specs/016-platform/web-performance.md "The open path asks in parallel": on a page load at a document's
// address, the open path's reads are asked while the editor's code downloads, and the editor takes their answers.
// The editor's own code is held back here (as a slow link does), so the early reads run first: each read is asked
// once, the board opens, and the password gate behaves as it always did.

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const EDITOR_CODE_DELAY_MS = 2_000;

// The scripts only the document page names (not every route's base): the editor's code.
async function holdBackEditorCode(page: Page, path: string): Promise<void> {
  const names = async (url: string) =>
    new Set(
      [...(await (await page.request.get(url)).text()).matchAll(/src="([^"]+\.js)"/g)].map(
        (m) => m[1]!,
      ),
    );
  const base = await names('/404');
  const editor = [...(await names(path))].filter((src) => !base.has(src));
  expect(editor.length).toBeGreaterThan(0);
  await page.route(
    (url) => editor.includes(url.pathname),
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, EDITOR_CODE_DELAY_MS));
      await route.continue();
    },
  );
}

// Every api read the page asks, by method and path, and the early reads' trace lines.
function watch(page: Page) {
  const asked: string[] = [];
  const early: string[] = [];
  page.on('request', (req) => {
    const { pathname } = new URL(req.url());
    if (pathname.startsWith(apiBase)) asked.push(`${req.method()} ${pathname}`);
  });
  page.on('console', (msg) => {
    if (msg.text().startsWith('[early-reads]')) early.push(msg.text());
  });
  return { asked, early, count: (line: string) => asked.filter((a) => a === line).length };
}

async function seedSharedBoard(
  page: Page,
  baseURL: string,
  opts: { password?: string } = {},
): Promise<{ id: string; tab: string; code: string }> {
  const owner = await mintSignedGuest(page.request);
  const headers = ownerHeaders(owner, { Origin: new URL(baseURL).origin });
  const id = crypto.randomUUID();
  const tab = crypto.randomUUID();
  const seeded = await page.request.post(`${apiBase}/documents`, {
    headers,
    data: {
      id,
      name: 'Early reads',
      tabs: [
        {
          id: tab,
          name: 'Board',
          elements: [
            {
              id: 'b1',
              type: 'shape',
              shape: 'rectangle',
              x: 200,
              y: 160,
              width: 220,
              height: 110,
              label: 'Ready',
            },
          ],
        },
        { id: crypto.randomUUID(), name: 'Later', elements: [] },
      ],
    },
  });
  expect(seeded.ok()).toBe(true);
  if (opts.password) {
    const set = await page.request.put(`${apiBase}/documents/${id}/share-password`, {
      headers,
      data: { password: opts.password },
    });
    expect(set.ok()).toBe(true);
  }
  const link = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'edit' },
  });
  const code = ((await link.json()) as { link: { code: string } }).link.code;
  return { id, tab, code };
}

test('a first-time guest’s share link is read early, in one read', async ({
  page,
  pageErrors,
  baseURL,
}) => {
  const { id, tab, code } = await seedSharedBoard(page, baseURL!);
  await page.addInitScript(() => localStorage.setItem('livedoc:v2:name-confirmed', '1'));
  const path = `/document/${id}?s=${code}`;
  await holdBackEditorCode(page, path);
  const seen = watch(page);

  await page.goto(path);
  await expect(page.locator('[data-element-id="b1"]')).toBeVisible();

  // The open is one read (web-performance.md): the link's read carries its first tab and the visitor's own row.
  expect(seen.early).toEqual(expect.arrayContaining(['[early-reads] taken share']));
  expect(seen.count('POST /api/guest-id')).toBe(1);
  expect(seen.count(`GET /api/share/${code}`)).toBe(1);
  // The api minted the guest's id for this page: its row is written, never read first (web-performance.md).
  expect(seen.asked.filter((a) => a.startsWith('GET /api/participants/'))).toHaveLength(0);
  expect(seen.asked.filter((a) => a.startsWith('PUT /api/participants/'))).toHaveLength(1);
  expect(seen.count(`GET /api/documents/${id}/tabs/${tab}`)).toBe(0);
  expectNoPageErrors(pageErrors);
});

test('a password-protected link still shows the gate, and opens on the password', async ({
  page,
  pageErrors,
  baseURL,
}) => {
  const { id, tab, code } = await seedSharedBoard(page, baseURL!, { password: 'hunter2' });
  await page.addInitScript(() => localStorage.setItem('livedoc:v2:name-confirmed', '1'));
  const path = `/document/${id}?s=${code}`;
  await holdBackEditorCode(page, path);
  const seen = watch(page);

  await page.goto(path);
  const password = page.getByRole('textbox', { name: 'Document password' });
  await expect(password).toBeVisible();
  // Nothing behind the gate was asked early.
  expect(seen.count(`GET /api/documents/${id}/tabs/${tab}`)).toBe(0);

  await password.fill('hunter2');
  await page.getByRole('button', { name: 'Open document' }).click();
  await expect(page.locator('[data-element-id="b1"]')).toBeVisible();
  // The early answer (no password) went to the gate; the typed password asked again, as itself, and its answer
  // carried the first tab.
  expect(seen.count(`GET /api/share/${code}`)).toBe(2);
  expect(seen.count(`GET /api/documents/${id}/tabs/${tab}`)).toBe(0);
  expectNoPageErrors(pageErrors);
});

test('an owner’s own document is read early, as its owner, in one read', async ({
  page,
  pageErrors,
  baseURL,
}) => {
  const owner = await mintSignedGuest(page.request);
  const id = crypto.randomUUID();
  const tab = crypto.randomUUID();
  const seeded = await page.request.post(`${apiBase}/documents`, {
    headers: ownerHeaders(owner, { Origin: new URL(baseURL!).origin }),
    data: {
      id,
      name: 'Mine',
      tabs: [
        {
          id: tab,
          name: 'Board',
          elements: [
            {
              id: 'b1',
              type: 'shape',
              shape: 'rectangle',
              x: 200,
              y: 160,
              width: 220,
              height: 110,
              label: 'Mine',
            },
          ],
        },
      ],
    },
  });
  expect(seeded.ok()).toBe(true);
  const sig = ownerHeaders(owner)['X-Owner-Sig'] ?? null;
  await page.addInitScript(
    ({ owner, sig }) => {
      localStorage.setItem('livedoc:v2:self-id', owner);
      if (sig) localStorage.setItem('livedoc:v2:self-sig', sig);
      localStorage.setItem('livedoc:v2:name-confirmed', '1');
    },
    { owner, sig },
  );
  const path = `/document/${id}`;
  await holdBackEditorCode(page, path);
  const seen = watch(page);

  await page.goto(path);
  await expect(page.locator('[data-element-id="b1"]')).toBeVisible();

  // The open is one read (web-performance.md): the document's read carries its first tab and the owner's own row.
  expect(seen.early).toEqual(expect.arrayContaining(['[early-reads] taken document']));
  expect(seen.count('POST /api/guest-id')).toBe(0);
  expect(seen.count(`GET /api/documents/${id}`)).toBe(1);
  expect(seen.count(`GET /api/documents/${id}/tabs/${tab}`)).toBe(0);
  expect(seen.asked.filter((a) => a.startsWith('GET /api/participants/'))).toHaveLength(0);
  expectNoPageErrors(pageErrors);
});
