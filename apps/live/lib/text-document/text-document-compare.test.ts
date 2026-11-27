// docs/specs/034-text-documents/review.md "Compare documents" ("The dialog", "What is compared"): both documents read
// as the person, each with its own suggestions left out, the comparison stored as their own new document beside the
// primary, every refusal named.
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { Tab } from '@livedoc/document';
import type { LiveDoc } from '@livedoc/api-schema';
import {
  LiveSuggestions,
  Paragraph,
  TextDocument,
  TextDocumentState,
  base64OfBytes,
  bytesOfBase64,
  type Block,
} from '@livedoc/text-documents';
import { ApiError } from '@/lib/api/core';
import {
  COMPARE_REFUSAL_COPY,
  attribution,
  comparisonName,
  makeComparison,
  type CompareApi,
} from './text-document-compare';

const blank = TextDocument.blank();
const normal = (blank.body[0] as { style: string }).style;
const stateOf = (...texts: string[]): Uint8Array =>
  TextDocumentState.fromDocument({ ...blank, body: texts.map((t) => Paragraph.of(t, normal)) });
const docOf = (...texts: string[]): Y.Doc => TextDocumentState.load([stateOf(...texts)]);

const textTab: Tab = { id: 'tab-s', name: 'Other', kind: 'text-document' } as Tab;
const selectedDoc = {
  id: 'sel',
  name: 'Other',
  teamId: null,
  folderId: null,
  tabs: [textTab],
} as unknown as LiveDoc;
const primaryDoc = {
  id: 'pri',
  name: 'Mine',
  teamId: 'team',
  folderId: 'f',
  tabs: [],
} as unknown as LiveDoc;

function api(overrides: Partial<CompareApi> = {}): CompareApi & { created: unknown[] } {
  const created: unknown[] = [];
  return {
    created,
    loadDocument: vi.fn(async (_owner: string, id: string) =>
      id === 'sel' ? selectedDoc : primaryDoc,
    ),
    loadState: vi.fn(async () => stateOf('The slow fox.')),
    create: vi.fn(async (_owner: string, request: unknown) => {
      created.push(request);
    }),
    readVersion: vi.fn().mockRejectedValue(new Error('no versions here')),
    ...overrides,
  };
}

const request = (doc = docOf('The quick fox.')) => ({
  ownerId: 'me',
  primary: { documentId: 'pri', tabId: 'tab-p', name: 'Mine', format: 'odf' as const, doc },
  selected: { id: 'sel', name: 'Other' },
  name: 'Ada',
  comments: false,
  at: 1,
});

/** What the created document's state reads as, every suggestion settled one way. */
function createdReading(made: unknown, accept: boolean): string {
  const { textDocuments } = made as { textDocuments: { state: string }[] };
  const live = TextDocumentState.load([bytesOfBase64(textDocuments[0]!.state)!]);
  const body: readonly Block[] = TextDocumentState.document(
    LiveSuggestions.settledCopy(live, accept),
    'odf',
  ).body;
  return body.map((b) => (b.type === 'paragraph' ? Paragraph.text(b) : b.type)).join('¶');
}

describe('makeComparison', () => {
  it('stores the comparison beside the primary, named for both', async () => {
    const fake = api();
    const outcome = await makeComparison(request(), fake);
    expect(outcome).toMatchObject({ ok: true, suggestions: 1, leftOut: 0 });
    const made = fake.created[0] as { name: string; teamId: string; folderId: string; tabs: Tab[] };
    expect(made.name).toBe('Comparison of Mine and Other');
    expect([made.teamId, made.folderId]).toEqual(['team', 'f']);
    expect(made.tabs[0]).toMatchObject({
      kind: 'text-document',
      name: 'Comparison of Mine and Other',
    });
    expect(createdReading(made, false)).toBe('The quick fox.');
    expect(createdReading(made, true)).toBe('The slow fox.');
    const { textDocuments } = made as unknown as { textDocuments: { state: string }[] };
    const live = TextDocumentState.load([bytesOfBase64(textDocuments[0]!.state)!]);
    expect(LiveSuggestions.read(live)[0]?.author).toMatchObject({
      name: 'Ada',
      fromComparison: true,
    });
  });

  it('files the comparison at the root when the primary’s place cannot be read', async () => {
    const fake = api({
      loadDocument: vi.fn(async (_o: string, id: string) => {
        if (id === 'sel') return selectedDoc;
        throw new ApiError('load', 403, null);
      }),
    });
    await makeComparison(request(), fake);
    expect(fake.created[0]).toMatchObject({ teamId: null, folderId: null });
  });

  it('leaves out the suggestions either document holds', async () => {
    const doc = docOf('The quick fox.');
    // A suggestion in the primary: its text marked as inserted by someone.
    const text = (TextDocumentState.body(doc).get(0) as Y.XmlElement).get(0) as Y.XmlText;
    text.insert(0, 'Not ', {
      insertion: { id: 's1', at: 1, author: { key: 'k', name: 'Ben', colour: '#000' } },
    });
    const fake = api();
    await makeComparison(request(doc), fake);
    expect(createdReading(fake.created[0], false)).toBe('The quick fox.');
  });

  it('refuses a document the person may not read as one they may not copy', async () => {
    const fake = api({ loadState: vi.fn().mockRejectedValue(new ApiError('state', 403, null)) });
    await expect(makeComparison(request(), fake)).resolves.toEqual({
      ok: false,
      refusal: 'not-copyable',
    });
    expect(fake.created).toEqual([]);
    expect(COMPARE_REFUSAL_COPY['not-copyable']('Other')).toBe(
      "You can't copy Other, so it can't be compared.",
    );
  });

  it('refuses a document it cannot read, or that holds no text document', async () => {
    const failing = api({ loadState: vi.fn().mockRejectedValue(new ApiError('state', 500, null)) });
    await expect(makeComparison(request(), failing)).resolves.toEqual({
      ok: false,
      refusal: 'unreadable',
    });
    const noText = api({
      loadDocument: vi.fn(async () => ({ ...selectedDoc, tabs: [] })),
    });
    await expect(makeComparison(request(), noText)).resolves.toEqual({
      ok: false,
      refusal: 'unreadable',
    });
    const gone = api({ loadDocument: vi.fn(async () => null) });
    await expect(makeComparison(request(), gone)).resolves.toEqual({
      ok: false,
      refusal: 'not-copyable',
    });
  });

  it('refuses two documents that differ in too many places', async () => {
    const many = (word: string) => Array.from({ length: 5_001 }, (_, k) => `kept ${k} ${word}`);
    const fake = api({ loadState: vi.fn(async () => stateOf(...many('new'))) });
    await expect(makeComparison(request(docOf(...many('old'))), fake)).resolves.toEqual({
      ok: false,
      refusal: 'too-many',
    });
  });

  it('says so when the comparison cannot be stored', async () => {
    const fake = api({ create: vi.fn().mockRejectedValue(new ApiError('create', 500, null)) });
    await expect(makeComparison(request(), fake)).resolves.toEqual({
      ok: false,
      refusal: 'not-stored',
    });
  });
});

describe('comparison names', () => {
  it('names the comparison for both documents', () => {
    expect(comparisonName('A', 'B')).toBe('Comparison of A and B');
  });

  it('attributes a blank field to a guest and keeps a name within its limit', () => {
    expect(attribution('  ')).toBe('Guest');
    expect(attribution(' Ada ')).toBe('Ada');
    expect(attribution('x'.repeat(150))).toHaveLength(100);
  });
});

// review.md "The dialog" (Versions): one of the primary's versions as the selected side.
describe('makeComparison against a version', () => {
  /** The room's state of the primary, with a snapshot of it when it read `then`. */
  function versioned(then: string, now: string) {
    const doc = TextDocumentState.load();
    TextDocumentState.replaceBody(doc, [{ text: then }]);
    const snapshot = base64OfBytes(Y.encodeSnapshot(Y.snapshot(doc)));
    TextDocumentState.replaceBody(doc, [{ text: now }]);
    return { state: Y.encodeStateAsUpdate(doc), snapshot };
  }

  it('compares the writing now with the version as it read, named for it', async () => {
    const { state, snapshot } = versioned('The old fox.', 'The quick fox.');
    const fake = api({
      loadState: vi.fn(async () => state),
      readVersion: vi.fn(async () => ({ snapshot }) as never),
    });
    const outcome = await makeComparison(
      { ...request(), selected: { id: 'v1', name: 'Draft', version: true } },
      fake,
    );
    expect(outcome).toMatchObject({ ok: true });
    expect(fake.readVersion).toHaveBeenCalledWith(
      { ownerId: 'me', documentId: 'pri', tabId: 'tab-p', shareCode: null },
      'v1',
    );
    const made = fake.created[0] as { name: string };
    expect(made.name).toBe('Comparison of Mine and Draft');
    expect(createdReading(made, true)).toBe('The old fox.');
    expect(createdReading(made, false)).toBe('The quick fox.');
  });

  it('says a version it cannot read is unreadable', async () => {
    const versionOf = {
      ...request(),
      selected: { id: 'v1', name: 'Draft', version: true as const },
    };
    expect(await makeComparison(versionOf, api())).toEqual({ ok: false, refusal: 'unreadable' });
    const bad = api({ readVersion: vi.fn(async () => ({ snapshot: '%%%' }) as never) });
    expect(await makeComparison(versionOf, bad)).toEqual({ ok: false, refusal: 'unreadable' });
  });
});
