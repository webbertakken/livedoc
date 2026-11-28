// A spreadsheet's sheet tab drawn (docs/specs/029-sheets/sheet-store.md "Agents in a spreadsheet", Previews): its
// cells and charts through render.svg, the whole sheet or a range, on a real SQLite.
import { beforeEach, describe, expect, it } from 'vitest';
import type { SheetWrite } from '@livedoc/sheets';
import { workbookKit, type WorkbookKit } from './routes/workbook-test-kit';

let kit: WorkbookKit;
const R = (i: number) => kit.layout.rows[i]!;
const C = (i: number) => kit.layout.cols[i]!;
const render = (id: string, query = '') =>
  kit.call({ method: 'GET', path: `/${id}/tabs/${id}t/render.svg${query}` });

beforeEach(async () => {
  kit = workbookKit();
  const cells = [
    { r: R(0), c: C(0), i: { s: 'Cost' } },
    { r: R(0), c: C(1), i: { s: 'Score' } },
    { r: R(1), c: C(0), i: { n: 3 } },
    { r: R(1), c: C(1), i: { n: 7 } },
    { r: R(5), c: C(3), i: { s: 'Far away' } },
  ];
  expect((await kit.call({ path: '', body: kit.document('book1', true, cells) })).status).toBe(201);
  expect((await kit.call({ path: '', body: kit.document('plan1', false) })).status).toBe(201);
  const chart: SheetWrite = {
    kind: 'layout',
    changes: [
      {
        k: 'object',
        id: 'chart01',
        object: {
          id: 'chart01',
          kind: 'chart',
          type: 'scatter',
          at: { r: R(0), c: C(2), dx: 0, dy: 0 },
          width: 420,
          height: 280,
          range: { r1: R(0), c1: C(0), r2: R(1), c2: C(1) },
          title: 'Value',
        },
      },
    ],
  };
  expect((await kit.write('book1', chart)).status).toBe(200);
});

describe('a spreadsheet tab’s render', () => {
  it('draws the whole sheet with its chart', async () => {
    const res = await render('book1');
    expect(res.status).toBe(200);
    const svg = await res.text();
    expect(svg).toContain('Cost');
    expect(svg).toContain('Far away');
    expect(svg).toContain('Value');
  });

  it('draws a range from its top-left, leaving the rest and charts before it out', async () => {
    const svg = await (await render('book1', '?range=D6:E7')).text();
    expect(svg).toContain('Far away');
    expect(svg).not.toContain('Cost');
    expect(svg).not.toContain('Value');
  });

  // inserted-objects.md "Agents" (D627): an image over cells drawn from its bytes when the document may serve it.
  it('draws its images over cells, their bytes inlined for the images the document may serve', async () => {
    kit.sql.sql.exec(
      "INSERT INTO images (id, owner_id, content_type, byte_size, width, height, sha256, created_at) VALUES ('g-logo', 'owner', 'image/png', 3, 1, 1, 'x', 0);",
    );
    const image: SheetWrite = {
      kind: 'layout',
      changes: [
        {
          k: 'object',
          id: 'img01',
          object: {
            id: 'img01',
            kind: 'image',
            at: { r: R(3), c: C(0), dx: 0, dy: 0 },
            width: 40,
            height: 20,
            imageId: 'g-logo',
          },
        },
      ],
    };
    expect((await kit.write('book1', image)).status).toBe(200);
    const bare = await (await render('book1')).text();
    expect(bare).not.toContain('data:image/png;base64,AQID');
    (kit.sql.env as unknown as { IMAGES: unknown }).IMAGES = {
      get: async () => ({
        httpMetadata: { contentType: 'image/png' },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }),
    };
    const drawn = await (await render('book1')).text();
    expect(drawn).toContain('data:image/png;base64,AQID');
  });

  // inserted-objects.md "Images in a cell": a cell's picture drawn in its cell, its bytes inlined as an image's are.
  it('draws the pictures held in its cells', async () => {
    kit.sql.sql.exec(
      "INSERT INTO images (id, owner_id, content_type, byte_size, width, height, sha256, created_at) VALUES ('g-cow', 'owner', 'image/png', 3, 1, 1, 'x', 0);",
    );
    const cells: SheetWrite = {
      kind: 'cells',
      cells: [{ r: R(3), c: C(1), i: { img: { id: 'g-cow', alt: 'A cow' } } }],
    };
    expect((await kit.write('book1', cells)).status).toBe(200);
    expect(await (await render('book1')).text()).toContain('A cow');
    (kit.sql.env as unknown as { IMAGES: unknown }).IMAGES = {
      get: async () => ({
        httpMetadata: { contentType: 'image/png' },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }),
    };
    expect(await (await render('book1')).text()).toContain('data:image/png;base64,AQID');
  });

  it('refuses a range it cannot read, and one on a tab that is no spreadsheet’s', async () => {
    expect((await render('book1', '?range=nope')).status).toBe(400);
    expect((await render('plan1', '?range=A1')).status).toBe(400);
    expect((await render('plan1')).status).toBe(200);
  });
});
