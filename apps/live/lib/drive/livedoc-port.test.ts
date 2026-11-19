import { DOCUMENT_ENVELOPE_KIND, type DocumentEnvelope } from '@livedoc/document';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentJson } from '@livedoc/vitest-config/sent-request';
import { createApiLivedocPort } from './livedoc-port';

// The Drive port's copy into the account (docs/specs/013-workspace/default-folders.md "Creation
// intent"): Import a copy is an import, so it carries the first tab's intent and lands in the
// person's default folder; a copy placed by the mirror keeps the mirror's place and carries none.

let createBodies: Record<string, unknown>[];

beforeEach(() => {
  createBodies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') createBodies.push(sentJson(init) as Record<string, unknown>);
      return new Response(JSON.stringify({ document: { id: 'new' } }), { status: 201 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const envelope = (kind?: string): DocumentEnvelope => ({
  kind: DOCUMENT_ENVELOPE_KIND,
  schemaVersion: 1,
  exportedAt: 0,
  document: {
    id: 'src',
    name: 'Board',
    presentation: null,
    tabs: [{ id: 't1', name: 'Tab 1', elements: [], ...(kind ? { kind } : {}) }],
  } as DocumentEnvelope['document'],
});

describe('importDocumentCopy', () => {
  it("sends Import a copy with its first tab's intent", async () => {
    await createApiLivedocPort('owner-1').importDocumentCopy(envelope('whiteboard'));
    expect(createBodies[0]).toMatchObject({ intent: { mode: 'draw', tabKind: 'diagram' } });
    expect(createBodies[0]).not.toHaveProperty('folderId');
  });

  it("sends a mirror-placed copy with no intent, keeping the mirror's place", async () => {
    await createApiLivedocPort('owner-1').importDocumentCopy(envelope(), {
      id: 'copy',
      name: 'Board',
      folderId: null,
    });
    expect(createBodies[0]).not.toHaveProperty('intent');
    expect(createBodies[0]).toHaveProperty('folderId', null);
  });
});

// docs/specs/029-sheets/sheet-store.md "Copies and exports": a copy of a spreadsheet's file is a spreadsheet.
describe("a spreadsheet's file copied in", () => {
  it('sends its workbook row, and none for another document', async () => {
    const workbook = { format: 'ods', settings: { locale: 'en-GB' } };
    const book = envelope('sheet');
    book.document.workbook = workbook;
    await createApiLivedocPort('owner-1').importDocumentCopy(book);
    expect(createBodies[0]).toMatchObject({ workbook });
    await createApiLivedocPort('owner-1').importDocumentCopy(envelope());
    expect(createBodies[1]).not.toHaveProperty('workbook');
  });
});
