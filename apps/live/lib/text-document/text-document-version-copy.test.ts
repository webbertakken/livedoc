// docs/specs/034-text-documents/review.md "Version history" (Make a copy): a new text document holding the version as
// it reads, with no comments or history, in this one's format, filed beside it; a failure makes nothing.
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { TextDocumentState, THREADS_MAP, base64OfBytes } from '@livedoc/text-documents';
import { ApiError } from '@/lib/api/core';
import {
  makeVersionCopy,
  versionCopyName,
  versionCopyState,
  type VersionCopyApi,
} from './text-document-version-copy';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

/** A document written, its version taken, then written on, with a comment thread kept beside it. */
function versioned() {
  const doc = TextDocumentState.load();
  TextDocumentState.replaceBody(doc, [{ text: 'As it was.' }]);
  doc.getMap(THREADS_MAP).set('t1', new Y.Map());
  const snapshot = Y.encodeSnapshot(Y.snapshot(doc));
  TextDocumentState.replaceBody(doc, [{ text: 'As it is now.' }]);
  return { state: Y.encodeStateAsUpdate(doc), snapshot };
}

const bodyText = (state: Uint8Array) =>
  String(TextDocumentState.body(TextDocumentState.load([state])).toJSON()).replace(/<[^>]+>/g, '');

function fakeApi(create: VersionCopyApi['create'] = vi.fn().mockResolvedValue({})) {
  return {
    loadDocument: vi.fn().mockResolvedValue({ teamId: 'team', folderId: 'folder' }),
    create,
  } as unknown as VersionCopyApi & { create: ReturnType<typeof vi.fn> };
}

describe('version copies', () => {
  it('names a copy as Google does', () => {
    expect(versionCopyName('Plan')).toBe('Copy of Plan');
  });

  it('holds the version as it reads, with no comment threads', () => {
    const { state, snapshot } = versioned();
    const copy = versionCopyState(state, snapshot, 'odf');
    expect(bodyText(copy)).toBe('As it was.');
    expect(TextDocumentState.load([copy]).getMap(THREADS_MAP).size).toBe(0);
  });

  it('stores the copy beside the document, in its format, and answers its id', async () => {
    const { state, snapshot } = versioned();
    const api = fakeApi();
    const id = await makeVersionCopy(
      {
        ownerId: 'me',
        documentId: 'D',
        format: 'ooxml',
        state,
        snapshot: base64OfBytes(snapshot),
        name: '  Copy of Plan ',
      },
      api,
    );
    expect(id).toEqual(expect.any(String));
    const request = api.create.mock.calls[0]![1] as {
      id: string;
      name: string;
      teamId: string;
      folderId: string;
      tabs: { format: string }[];
      textDocuments: { state: string }[];
    };
    expect(request).toMatchObject({ id, name: 'Copy of Plan', teamId: 'team', folderId: 'folder' });
    expect(request.tabs[0]!.format).toBe('ooxml');
    expect(api.loadDocument).toHaveBeenCalledWith('me', 'D');
  });

  it('makes nothing from a snapshot it cannot read, or when storing fails', async () => {
    const { state, snapshot } = versioned();
    expect(
      await makeVersionCopy(
        { ownerId: 'me', documentId: 'D', format: 'odf', state, snapshot: '%%%', name: 'x' },
        fakeApi(),
      ),
    ).toBeNull();
    const failing = fakeApi(vi.fn().mockRejectedValue(new ApiError('create', 500, null)));
    expect(
      await makeVersionCopy(
        {
          ownerId: 'me',
          documentId: 'D',
          format: 'odf',
          state,
          snapshot: base64OfBytes(snapshot),
          name: 'x',
        },
        failing,
      ),
    ).toBeNull();
  });
});
