import { beforeEach, describe, expect, it } from 'vitest';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';

// docs/specs/006-document/document-storage.md "The content summary": a spreadsheet's sheet tab counts its sheet's
// filled cells, and a cell write pushes the summary again (the write marks the document saved).

let kit: WorkbookKit;
let r0: string, c0: string, c1: string;

beforeEach(() => {
  kit = workbookKit();
  [r0] = kit.layout.rows as [string];
  [c0, c1] = kit.layout.cols as [string, string];
});

async function summaryOf(id: string): Promise<Record<string, unknown>> {
  // Any D1 call drains the room's outbox first (test-sqlite-d1.ts).
  await kit.call({ method: 'GET', path: `/${id}/sheets` });
  const row = kit.sql.sql.prepare('SELECT content_summary FROM documents WHERE id = ?').get(id) as {
    content_summary: string;
  };
  return JSON.parse(row.content_summary) as Record<string, unknown>;
}

describe("a spreadsheet's content summary", () => {
  it('reads an empty spreadsheet as empty, and its first cells as content', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    expect(await summaryOf('book')).toMatchObject({ firstTabCount: 0, hasContent: false });

    const res = await kit.write('book', {
      kind: 'cells',
      cells: [
        { r: r0, c: c0, i: { n: 1 } },
        { r: r0, c: c1, i: { s: 'Rent' } },
      ],
    });
    expect(res.status).toBe(200);
    expect(await summaryOf('book')).toMatchObject({
      firstTabCount: 2,
      tabCounts: { bookt: 2 },
      hasContent: true,
    });
  });

  it("keeps a Plan Sheet's tab counted by its elements", async () => {
    await kit.call({
      path: '',
      body: kit.document('plan', false, [{ r: r0, c: c0, i: { n: 1 } }]),
    });
    expect(await summaryOf('plan')).toMatchObject({ firstTabCount: 0, hasContent: false });
  });
});
