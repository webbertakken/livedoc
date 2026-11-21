import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type FrameLocator,
  type Page,
} from '@playwright/test';
import { defaultCatalogue, presetSetup } from '@livedoc/items';
import { WorkbookRecord, emptyLayout } from '@livedoc/sheets';
import {
  apiJson,
  mintTicket,
  mintWorkspaceTicket,
  newPerson,
  received,
  serveFakeWorkbench,
  type FakeWorkbench,
  type Person,
  type Seeded,
} from './workbench-support';

// Every tab kind in a workbench embed (docs/specs/013-workspace/workbench-embeds.md "What a workbench session may
// do"): each opens in a sandboxed frame, as a host that sandboxes its frames frames it, at a phone's width, and loads
// its content with no request refused by the frame's confinement. A Sheet works there too, in both scopes.
// Opt-in like workbench-embed.spec.ts.

test.use({
  colorScheme: 'dark',
  viewport: { width: 613, height: 996 },
  deviceScaleFactor: 1.25,
  screenshot: 'only-on-failure',
  launchOptions: { args: ['--mute-audio'] },
});

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';
const CANVAS = '[data-canvas-a11y-root]';
const SHEET_ID = 'wbsheet001';

let workbench: FakeWorkbench;

test.beforeAll(async () => {
  workbench = await serveFakeWorkbench();
});

test.afterAll(async () => {
  await workbench.close();
});

let n = 7;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;

const sheetRecord = (tabId: string, title: string, owner: string) => {
  const now = Date.now();
  return {
    id: SHEET_ID,
    tabId,
    title,
    layout: emptyLayout(rand, 20, 6),
    cells: [],
    rev: 0,
    createdAt: now,
    updatedAt: now,
    updatedBy: { id: owner, name: 'Webber', color: '#0ea5e9' },
  };
};

type Kind = {
  name: string;
  // The document to seed, its first tab the kind's.
  body: (tabId: string, owner: string) => Record<string, unknown>;
  // The kind's content, loaded.
  loaded: (frame: FrameLocator) => Promise<void>;
};

const visible = (frame: FrameLocator, selector: string) =>
  expect(frame.locator(selector).first()).toBeVisible({ timeout: 30_000 });

const KINDS: Kind[] = [
  {
    name: 'diagram',
    body: (tabId) => ({
      tabs: [
        {
          id: tabId,
          name: 'Wireframe',
          kind: 'diagram',
          elements: [
            {
              id: 'el-1',
              type: 'shape',
              shape: 'square',
              x: 80,
              y: 200,
              width: 140,
              height: 80,
              label: 'Play',
            },
          ],
        },
      ],
    }),
    loaded: (frame) => visible(frame, '[data-element-id="el-1"]'),
  },
  {
    name: 'event-storming',
    body: (tabId) => ({
      tabs: [
        {
          id: tabId,
          name: 'Checkout',
          kind: 'event-storming',
          elements: [
            {
              id: 'ev-1',
              type: 'shape',
              shape: 'square',
              x: 80,
              y: 200,
              width: 140,
              height: 80,
              label: 'Paid',
            },
          ],
        },
      ],
    }),
    loaded: (frame) => visible(frame, '[data-element-id="ev-1"]'),
  },
  {
    name: 'board',
    body: (tabId) => ({
      itemTypes: defaultCatalogue(),
      tabs: [
        {
          id: tabId,
          name: 'Reports',
          kind: 'board',
          opensIn: 'plan',
          elements: [
            {
              id: 'board',
              type: 'shape',
              shape: 'plan-board',
              x: 40,
              y: 120,
              width: 1100,
              height: 560,
              planBoard: presetSetup('kanban'),
            },
          ],
        },
      ],
    }),
    loaded: (frame) => visible(frame, '[data-element-id="board"]'),
  },
  {
    name: 'sheet',
    body: (tabId, owner) => ({
      tabs: [
        {
          id: tabId,
          name: 'Budget',
          kind: 'sheet',
          opensIn: 'plan',
          elements: [
            {
              id: 'sheet',
              type: 'shape',
              shape: 'plan-sheet',
              x: 40,
              y: 160,
              width: 960,
              height: 560,
              planSheet: { sheetId: SHEET_ID },
            },
          ],
        },
      ],
      sheets: [sheetRecord(tabId, 'Budget', owner)],
    }),
    loaded: (frame) =>
      expect(frame.getByRole('grid', { name: 'Budget grid' })).toBeVisible({ timeout: 30_000 }),
  },
  {
    name: 'dashboard',
    body: (tabId) => ({
      tabs: [{ id: tabId, name: 'Overview', kind: 'dashboard', opensIn: 'plan', elements: [] }],
    }),
    // An empty Dashboard opens on its start panel.
    loaded: (frame) =>
      expect(frame.getByText('Start Planning', { exact: true })).toBeVisible({ timeout: 30_000 }),
  },
  {
    name: 'form',
    body: (tabId) => ({
      tabs: [
        {
          id: tabId,
          name: 'Feedback',
          kind: 'form',
          opensIn: 'plan',
          elements: [],
          form: {
            v: 1,
            heading: 'Feedback',
            sections: [
              {
                id: 's-1',
                title: '',
                questions: [{ id: 'q-1', type: 'short', prompt: 'Your name' }],
              },
            ],
          },
        },
      ],
    }),
    loaded: (frame) =>
      expect(frame.getByText('Your name').first()).toBeVisible({ timeout: 30_000 }),
  },
  {
    name: 'text-document',
    body: (tabId) => ({
      tabs: [{ id: tabId, name: 'Notes', kind: 'text-document', format: 'odf', elements: [] }],
    }),
    loaded: (frame) => visible(frame, '[data-text-document-surface="ready"]'),
  },
  {
    name: 'spreadsheet',
    body: (tabId, owner) => ({
      tabs: [{ id: tabId, name: 'Sheet1', kind: 'sheet', elements: [] }],
      sheets: [sheetRecord(tabId, 'Sheet1', owner)],
      workbook: WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' }),
    }),
    loaded: (frame) => visible(frame, '[data-spreadsheet-surface="ready"]'),
  },
];

// A document of the person's holding `body`, and the CLI's token.
async function seed(request: APIRequestContext, person: Person, kind: Kind): Promise<Seeded> {
  const documentId = `wb-doc-${randomUUID()}`;
  const tabId = `wb-tab-${randomUUID()}`;
  const created = await apiJson(request, 'POST', '/documents', person.jwt, {
    id: documentId,
    name: `A ${kind.name}`,
    ...kind.body(tabId, person.userId),
  });
  if (created.status >= 300) throw new Error(`creating the ${kind.name} failed: ${created.status}`);
  const token = await apiJson<{ token: string }>(request, 'POST', '/tokens', person.jwt, {
    name: 'LiveDoc CLI',
  });
  if (token.status >= 300) throw new Error(`creating the token failed: ${token.status}`);
  return { documentId, tabId, token: token.body.token };
}

// The person allows the workbench in their own browser (one pairing per scope asked).
async function pair(page: Page, pairingUrl: string) {
  await page.goto(pairingUrl);
  await page.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workbench allowed' })).toBeVisible();
}

// Every request the frame refused unsent (the `[workbench] request-confined` warning) and every load that failed.
function watchRefusals(page: Page): string[] {
  const refused: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('request-confined') || text.includes('load.failed')) refused.push(text);
  });
  return refused;
}

async function openDocumentFrame(
  page: Page,
  request: APIRequestContext,
  seeded: Seeded,
): Promise<FrameLocator> {
  const unpaired = await mintTicket(request, seeded, workbench.origin);
  expect(unpaired.status).toBe(428);
  await pair(page, unpaired.body.pairingUrl!);
  const minted = await mintTicket(request, seeded, workbench.origin);
  expect(minted.status).toBe(201);
  await workbench.open(page, minted.body.url!, { sandbox: SANDBOX });
  const frame = page.frameLocator('#frame');
  await expect
    .poll(async () => (await received(page)).map((m) => m.type), { timeout: 30_000 })
    .toContain('livedoc:ready');
  return frame;
}

for (const kind of KINDS) {
  test(`a ${kind.name} tab loads in a sandboxed document frame at a phone's width`, async ({
    page,
    context,
    request,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    const refused = watchRefusals(page);
    const person = await newPerson(context, baseURL!, 'Webber');
    const seeded = await seed(request, person, kind);

    const frame = await openDocumentFrame(page, request, seeded);

    await kind.loaded(frame);
    await expect(frame.getByText(/Couldn.t load/)).toHaveCount(0);
    expect(refused).toEqual([]);
    // The frame as it loaded, kept with the run's results.
    const shot = testInfo.outputPath(`${kind.name}.png`);
    await page.screenshot({ path: shot });
    await testInfo.attach(kind.name, { path: shot, contentType: 'image/png' });
  });
}

// A formula typed into the Sheet reaches the sheet store through the session.
async function typeFormula(page: Page, frame: FrameLocator) {
  const grid = frame.getByRole('grid', { name: 'Budget grid' });
  await expect(grid).toBeVisible({ timeout: 30_000 });
  const box = (await grid.boundingBox())!;
  // Past the row and column headers, on A1.
  await page.mouse.click(box.x + 66, box.y + 30);
  await page.keyboard.type('=6*7');
  await page.keyboard.press('Enter');
  await expect(grid).toContainText('42');
}

// How many formulas the sheet store keeps for the document.
async function storedFormulas(request: APIRequestContext, person: Person, documentId: string) {
  const sheets = await apiJson<{ sheets: { cells: { i?: { f?: unknown } }[] }[] }>(
    request,
    'GET',
    `/documents/${documentId}/sheets`,
    person.jwt,
  );
  return sheets.body.sheets.flatMap((s) => s.cells).filter((c) => c.i?.f !== undefined).length;
}

const SHEET = KINDS.find((k) => k.name === 'sheet')!;

test('a Sheet works in a document frame: a formula is worked out and kept', async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const refused = watchRefusals(page);
  const person = await newPerson(context, baseURL!, 'Webber');
  const seeded = await seed(request, person, SHEET);
  const frame = await openDocumentFrame(page, request, seeded);

  await typeFormula(page, frame);

  await expect.poll(() => storedFormulas(request, person, seeded.documentId)).toBe(1);
  expect(refused).toEqual([]);
});

test('a Sheet works in a workspace frame: opened in place, a formula is worked out and kept', async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const refused = watchRefusals(page);
  const person = await newPerson(context, baseURL!, 'Webber');
  const seeded = await seed(request, person, SHEET);
  const unpaired = await mintWorkspaceTicket(request, seeded, workbench.origin);
  expect(unpaired.status).toBe(428);
  await pair(page, unpaired.body.pairingUrl!);
  const minted = await mintWorkspaceTicket(request, seeded, workbench.origin);
  expect(minted.status).toBe(201);
  await workbench.open(page, minted.body.url!, { sandbox: SANDBOX });
  await expect
    .poll(async () => (await received(page)).map((m) => m.type), { timeout: 30_000 })
    .toContain('livedoc:ready');

  await page.evaluate(
    (to) =>
      (window as unknown as { post: (m: unknown) => void }).post({
        type: 'livedoc:open',
        v: 1,
        to,
      }),
    { documentId: seeded.documentId },
  );
  const frame = page.frameLocator('#frame');
  await frame.locator(CANVAS).waitFor({ timeout: 30_000 });
  await typeFormula(page, frame);

  await expect.poll(() => storedFormulas(request, person, seeded.documentId)).toBe(1);
  expect(refused).toEqual([]);
});
