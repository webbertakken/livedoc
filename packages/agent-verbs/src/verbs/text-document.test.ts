import { describe, expect, it } from 'vitest';
import { VerbRefusal } from '../define';
import { contextOf, DOC_A, fakeApi, library } from '../testing/fake-api';
import { openTextDocument, textDocumentFileTooLarge } from '../text-documents/open-text-document';
import {
  textDocumentDownload,
  textDocumentEdit,
  textDocumentImport,
  textDocumentTabOf,
  textDocumentView,
} from './text-document';

// docs/specs/034-text-documents/agents-and-sync.md "Verbs", "CLI".

const doc = (tabs: { id: string; name: string; orderIndex: number; kind?: string }[]) => ({
  [`/documents/${DOC_A}`]: { document: { id: DOC_A, name: 'Auth flow', tabs } },
});
const TABS = doc([
  { id: 'canvas-0000', name: 'Canvas', orderIndex: 0 },
  { id: 'notes-0000', name: 'Notes', orderIndex: 2, kind: 'text-document' },
  { id: 'words-0000', name: 'Words', orderIndex: 1, kind: 'text-document' },
]);
const CHANGESETS = `/documents/${DOC_A}/tabs/words-0000/changesets`;

const refusalOf = async (run: Promise<unknown>) => {
  const error = await run.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(VerbRefusal);
  return error as VerbRefusal;
};

describe('textDocumentTabOf', () => {
  it('finds the first text document tab, or one by id, name or id prefix', async () => {
    const ctx = contextOf(fakeApi({ ...library, ...TABS }));
    expect((await textDocumentTabOf(ctx, 'Auth flow', undefined)).tab.id).toBe('words-0000');
    expect((await textDocumentTabOf(ctx, 'Auth flow', 'notes-0000')).tab.id).toBe('notes-0000');
    expect((await textDocumentTabOf(ctx, 'Auth flow', 'NOTES')).tab.id).toBe('notes-0000');
    expect((await textDocumentTabOf(ctx, 'Auth flow', 'note')).tab.id).toBe('notes-0000');
  });

  it('refuses a document with none, and a tab it lacks, naming its text document tabs', async () => {
    const none = contextOf(
      fakeApi({ ...library, ...doc([{ id: 'c', name: 'C', orderIndex: 0 }]) }),
    );
    expect((await refusalOf(textDocumentTabOf(none, 'Auth flow', undefined))).message).toBe(
      'Auth flow holds no text document',
    );
    const ctx = contextOf(fakeApi({ ...library, ...TABS }));
    const named = await refusalOf(textDocumentTabOf(ctx, 'Auth flow', 'Canvas'));
    expect(named.message).toBe('Auth flow holds no text document tab "Canvas"');
    expect(named.lines).toEqual(['tab "Words" words-00', 'tab "Notes" notes-00']);
  });
});

describe('text-document.view', () => {
  it('reads the outline by default, the view and its options when asked', async () => {
    const api = fakeApi({
      ...library,
      ...TABS,
      [`/documents/${DOC_A}/tabs/words-0000`]: { text: 'the view' },
    });
    const ctx = contextOf(api);
    expect(await textDocumentView.run!(ctx, { doc: 'Auth flow' })).toEqual({ text: 'the view' });
    await textDocumentView.run!(ctx, {
      doc: 'Auth flow',
      as: 'text',
      only: 'T',
      range: '1..2',
      lines: true,
    });
    expect(api.calls.filter((c) => c.includes('view='))).toEqual([
      `/documents/${DOC_A}/tabs/words-0000?view=outline`,
      `/documents/${DOC_A}/tabs/words-0000?view=text&only=T&range=1..2&lines=1`,
    ]);
    expect(textDocumentView.text!({ text: 'x' })).toEqual(['x']);
  });
});

describe('text-document.edit', () => {
  const answering = (status: number, body: unknown, seen: unknown[] = []) =>
    fakeApi({
      ...library,
      ...TABS,
      [CHANGESETS]: async (r: Request) => {
        seen.push({ url: new URL(r.url).search, body: await r.json() });
        return typeof body === 'string'
          ? new Response(body, { status })
          : Response.json(body, { status });
      },
      [`${CHANGESETS}?dryRun=1`]: async (r: Request) => {
        seen.push({ url: new URL(r.url).search, body: await r.json() });
        return Response.json({ dryRun: true, changeset: null, results: ['appended ¶3'], text: '' });
      },
    });
  const written = {
    dryRun: false,
    changeset: {
      id: 'tc_1',
      tabId: 'w',
      documentTab: 't.0',
      counts: { added: 1, changed: 0, removed: 0 },
    },
    results: ['appended ¶3'],
    text: 'appended ¶3',
  };

  it('sends the words as one operation, or a file’s lines, with its options', async () => {
    const seen: unknown[] = [];
    const ctx = contextOf(answering(200, written, seen), [], [], {
      readInput: async () => 'append "x"\n',
    });
    const out = await textDocumentEdit.run!(ctx, { doc: 'Auth flow', ops: ['append', '"x"'] });
    expect(out).toEqual({
      dryRun: false,
      changeset: { id: 'tc_1', counts: written.changeset.counts },
      results: ['appended ¶3'],
    });
    await textDocumentEdit.run!(ctx, {
      doc: 'Auth flow',
      file: '-',
      documentTab: 'T',
      summary: 'S',
      base: 'B',
      dryRun: true,
    });
    expect(seen).toEqual([
      { url: '', body: { ops: 'append "x"' } },
      {
        url: '?dryRun=1',
        body: { ops: 'append "x"\n', documentTab: 'T', summary: 'S', base: 'B' },
      },
    ]);
  });

  it('prints the results and the changeset, a dry run, or nothing changed', () => {
    const text = textDocumentEdit.text!;
    expect(
      text({
        dryRun: false,
        changeset: { id: 'tc_1', counts: { added: 1, changed: 2, removed: 0 } },
        results: ['a'],
      }),
    ).toEqual([
      'a',
      '~ text changeset tc_1 · 1 added, 2 changed · revert: livedoc changeset revert <doc> tc_1',
    ]);
    expect(text({ dryRun: true, changeset: null, results: [] })).toEqual([
      'dry run, nothing written',
    ]);
    expect(text({ dryRun: false, changeset: null, results: [] })).toEqual(['nothing changed']);
    expect(
      textDocumentEdit.quiet!({
        dryRun: false,
        changeset: { id: 'tc_1', counts: { added: 0, changed: 0, removed: 0 } },
        results: [],
      }),
    ).toEqual(['tc_1']);
    expect(textDocumentEdit.quiet!({ dryRun: true, changeset: null, results: [] })).toEqual([]);
  });

  it('refuses no operation, and both words and a file', async () => {
    const ctx = contextOf(answering(200, written));
    for (const input of [{ doc: 'Auth flow' }, { doc: 'Auth flow', ops: ['x'], file: 'f' }])
      expect((await refusalOf(textDocumentEdit.run!(ctx, input))).code).toBe('invalid_operation');
  });

  it('names the refused line, and points a missing text at the text view', async () => {
    const missing = contextOf(
      answering(422, { error: 'text_not_found', line: 2, operation: 2, message: 'not there' }),
    );
    const refused = await refusalOf(
      textDocumentEdit.run!(missing, { doc: 'Auth flow', ops: ['x'] }),
    );
    expect(refused).toMatchObject({
      status: 422,
      code: 'text_not_found',
      message: 'line 2: not there',
    });
    expect(refused.hint).toBe('read it as it stands: livedoc text view <doc> --as text --lines');
    const whole = contextOf(
      answering(413, { error: 'document_too_large', line: 0, message: 'big' }),
    );
    const big = await refusalOf(textDocumentEdit.run!(whole, { doc: 'Auth flow', ops: ['x'] }));
    expect(big).toMatchObject({ message: 'big', hint: 'the operations: livedoc guide text' });
    const raw = contextOf(answering(400, 'plain'));
    expect(
      await refusalOf(textDocumentEdit.run!(raw, { doc: 'Auth flow', ops: ['x'] })),
    ).toMatchObject({
      code: 'refused',
      message: 'api 400: plain',
    });
  });

  it('lets an error that is no refusal through', async () => {
    const ctx = contextOf(
      fakeApi({
        ...library,
        ...TABS,
        [CHANGESETS]: () => Promise.reject(new TypeError('offline')),
      }),
    );
    await expect(textDocumentEdit.run!(ctx, { doc: 'Auth flow', ops: ['x'] })).rejects.toThrow(
      'offline',
    );
  });
});

describe('openTextDocument', () => {
  const opening = (answer: (body: Record<string, unknown>) => Response) => {
    const bodies: Record<string, unknown>[] = [];
    const api = fakeApi({
      '/documents': async (r: Request) => {
        const body = (await r.json()) as Record<string, unknown>;
        bodies.push(body);
        return answer(body);
      },
    });
    return { api, bodies };
  };
  let n = 0;
  const newId = () => `id-${(n += 1)}`;

  it('opens a Word file in OOXML, another kind as an ODF import, named after the file or as asked', async () => {
    const { api, bodies } = opening(() => Response.json({}));
    const bytes = new Uint8Array([1, 2]);
    expect(await openTextDocument(api, { fileName: 'Q3.docx', bytes, newId }, 'cli')).toMatchObject(
      {
        ok: true,
        name: 'Q3',
        format: 'ooxml',
      },
    );
    expect(bodies[0]).toMatchObject({
      tabs: [{ kind: 'text-document', format: 'ooxml', name: 'Q3' }],
      textDocuments: [{ file: 'AQI=' }],
    });
    expect(
      await openTextDocument(api, { fileName: 'n.md', bytes, name: ' Notes ', newId }, 'mcp'),
    ).toMatchObject({
      name: 'Notes',
      format: 'odf',
    });
    expect(bodies[1]).toMatchObject({ textDocuments: [{ type: 'md' }] });
    expect(await openTextDocument(api, { fileName: '.odt', bytes, newId }, 'cli')).toMatchObject({
      name: '.odt',
    });
  });

  it('words a named rejection and an unnamed one, and lets a server failure through', async () => {
    const named = opening(() => Response.json({ error: 'package_encrypted' }, { status: 400 }));
    expect(
      await openTextDocument(
        named.api,
        { fileName: 'a.odt', bytes: new Uint8Array(), newId },
        'cli',
      ),
    ).toEqual({
      ok: false,
      code: 'package_encrypted',
      message: 'This file is protected by a password. Remove the password, then open it again.',
    });
    const other = opening(() => new Response('x', { status: 403 }));
    expect(
      await openTextDocument(
        other.api,
        { fileName: 'a.odt', bytes: new Uint8Array(), newId },
        'cli',
      ),
    ).toEqual({
      ok: false,
      code: 'http_403',
      message: 'The api refused the file (http_403).',
    });
    const down = opening(() => new Response('x', { status: 503 }));
    await expect(
      openTextDocument(down.api, { fileName: 'a.odt', bytes: new Uint8Array(), newId }, 'cli'),
    ).rejects.toThrow('api 503');
  });
});

describe('the verbs the CLI runs', () => {
  it('print the lines the CLI answers, and a file too large is refused in the editor’s words', () => {
    expect(textDocumentDownload.text!({ lines: ['a.odt  1 KB'] })).toEqual(['a.odt  1 KB']);
    expect(textDocumentImport.text!({ lines: ['+ text-document'] })).toEqual(['+ text-document']);
    expect(textDocumentFileTooLarge()).toEqual({
      code: 'package_too_large',
      message: 'This file is too large to open.',
    });
  });
});
