import { describe, expect, it } from 'vitest';
import { creationIntentOf } from '@livedoc/api-schema';
import { DOC_A, fakeApi } from '../testing/fake-api';
import { createTextDocument } from './open-text-document';
import { editTextDocument, readTextDocumentView, textDocumentTabIn } from './text-document-calls';

// docs/specs/034-text-documents/agents-and-sync.md "Verbs"; docs/specs/015-api/mcp-server.md §4.9g.

const TAB = `/documents/${DOC_A}/tabs/words-0000`;

describe('textDocumentTabIn', () => {
  const document = {
    name: 'Plan',
    tabs: [
      { id: 'canvas-0000', name: 'Canvas', orderIndex: 0 },
      { id: 'notes-0000', name: 'Notes', orderIndex: 2, kind: 'text-document' },
      { id: 'words-0000', name: 'Words', orderIndex: 1, kind: 'text-document' },
    ],
  };

  it('finds the first text document tab, or the one named', () => {
    expect(textDocumentTabIn(document, undefined)).toMatchObject({ tab: { id: 'words-0000' } });
    expect(textDocumentTabIn(document, 'notes')).toMatchObject({ tab: { id: 'notes-0000' } });
  });

  it('says why not, with the text document tabs there are', () => {
    expect(textDocumentTabIn(document, 'Canvas')).toEqual({
      ok: false,
      message: 'Plan holds no text document tab "Canvas"',
      tabs: [document.tabs[2], document.tabs[1]],
    });
    expect(textDocumentTabIn({ name: 'Bare', tabs: [] }, undefined)).toEqual({
      ok: false,
      message: 'Bare holds no text document',
      tabs: [],
    });
  });
});

describe('readTextDocumentView', () => {
  it('answers the view and the state vector it was read at', async () => {
    const api = fakeApi({
      [TAB]: () => new Response('# Plan', { headers: { 'X-State-Vector': 'AQID' } }),
    });
    expect(await readTextDocumentView(api, DOC_A, 'words-0000', {})).toEqual({
      text: '# Plan',
      stateVector: 'AQID',
    });
    expect(api.calls).toEqual([`${TAB}?view=outline`]);
  });

  it('passes the view and its options, and answers no state vector when none came', async () => {
    const api = fakeApi({ [TAB]: { text: 'x' } });
    const read = await readTextDocumentView(api, DOC_A, 'words-0000', {
      view: 'structure',
      only: 'T',
      range: '2..4',
      lines: true,
    });
    expect(read.stateVector).toBeNull();
    expect(api.calls).toEqual([`${TAB}?view=structure&only=T&range=2..4&lines=1`]);
  });
});

describe('editTextDocument', () => {
  it('answers the result lines and the changeset', async () => {
    const api = fakeApi({
      [`${TAB}/changesets`]: () =>
        Response.json({
          dryRun: false,
          changeset: {
            id: 'tc_1',
            tabId: 'words-0000',
            documentTab: 't.0',
            counts: { added: 1, changed: 0, removed: 0 },
          },
          results: ['appended ¶3'],
          text: 'appended ¶3',
        }),
    });
    expect(await editTextDocument(api, DOC_A, 'words-0000', { ops: 'append "x"' })).toEqual({
      ok: true,
      dryRun: false,
      changeset: { id: 'tc_1', counts: { added: 1, changed: 0, removed: 0 } },
      results: ['appended ¶3'],
    });
  });

  it('answers a refusal with its line, or for the changeset as a whole', async () => {
    const refusing = (status: number, body: string) =>
      fakeApi({ [`${TAB}/changesets`]: () => new Response(body, { status }) });
    const line = JSON.stringify({
      error: 'text_not_found',
      line: 2,
      operation: 2,
      message: 'gone',
    });
    expect(await editTextDocument(refusing(422, line), DOC_A, 'words-0000', { ops: 'x' })).toEqual({
      ok: false,
      status: 422,
      code: 'text_not_found',
      line: 2,
      message: 'gone',
    });
    const whole = JSON.stringify({ error: 'stale_tab', line: 0, operation: 0, message: 'moved' });
    expect(
      await editTextDocument(refusing(409, whole), DOC_A, 'words-0000', { ops: 'x' }),
    ).toMatchObject({ code: 'stale_tab', line: null });
    expect(
      await editTextDocument(refusing(403, '{"error":"forbidden"}'), DOC_A, 'words-0000', {
        ops: 'x',
      }),
    ).toMatchObject({ status: 403, code: 'forbidden', line: null });
  });
});

describe('createTextDocument', () => {
  const making = (answer: () => Response) => {
    const bodies: { tabs: { kind: string }[] }[] = [];
    const api = fakeApi({
      '/documents': async (r: Request) => {
        const body: unknown = await r.json();
        bodies.push(body as { tabs: { kind: string }[] });
        return answer();
      },
    });
    return { api, bodies };
  };
  let n = 0;
  const newId = () => `id-${(n += 1)}`;

  it('makes a blank one born in ODF, tagged with its maker, and answers the document stored', async () => {
    const { api, bodies } = making(() => Response.json({ document: { id: 'stored' } }));
    expect(await createTextDocument(api, { name: 'Notes', newId }, 'mcp')).toEqual({
      ok: true,
      documentId: 'id-1',
      tabId: 'id-2',
      name: 'Notes',
      format: 'odf',
      document: { id: 'stored' },
    });
    expect(bodies[0]).toEqual({
      id: 'id-1',
      name: 'Notes',
      tabs: [{ id: 'id-2', name: 'Notes', kind: 'text-document', format: 'odf', elements: [] }],
      source: 'mcp',
      intent: creationIntentOf(bodies[0]!.tabs.at(0)),
    });
  });

  it('opens its body from Markdown, and passes markUsed', async () => {
    const { api, bodies } = making(() => Response.json({}));
    await createTextDocument(
      api,
      { name: 'Plan', markdown: '# Plan', markUsed: false, newId },
      'mcp',
    );
    expect(bodies[0]).toMatchObject({
      markUsed: false,
      textDocuments: [{ tabId: 'id-4', file: 'IyBQbGFu', type: 'md' }],
    });
  });

  it('words a refusal of the body', async () => {
    const { api } = making(() =>
      Response.json({ error: 'text_document_seed_invalid' }, { status: 400 }),
    );
    expect(await createTextDocument(api, { name: 'X', markdown: '', newId }, 'mcp')).toMatchObject({
      ok: false,
      code: 'text_document_seed_invalid',
    });
  });
});
