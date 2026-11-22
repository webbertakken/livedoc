// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Inserting": Insert > Image's items and the toolbar's list are an Editor's;
// a picture file pasted is stored, placed and counted by where it came from; a refusal is said under the toolbar.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';

const { addImageFileForDocument, track } = vi.hoisted(() => ({
  addImageFileForDocument: vi.fn(),
  track: vi.fn(),
}));
vi.mock('@/lib/upload-image', async (actual) => ({
  ...(await actual<typeof import('@/lib/upload-image')>()),
  addImageFileForDocument,
}));
vi.mock('@/lib/telemetry', () => ({ track }));

const { ImageUploadError } = await import('@/lib/upload-image');
const { useTextDocumentPictures, INSERT_IMAGE_CONTROL, PICTURE_NOTICE_MS } =
  await import('./useTextDocumentPictures');

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 4,
  0, 0, 0, 4, 8, 2, 0, 0, 0,
]);
const png = () => new File([PNG.slice()], 'p.png', { type: 'image/png' });

function setup(canEdit = true) {
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, [schema.text('a')])]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 2) }),
  });
  const liveDoc = { current: TextDocumentState.load() };
  const hook = renderHook(() =>
    useTextDocumentPictures({
      view,
      liveDoc,
      ownerId: 'me',
      documentId: 'D',
      canEdit,
      room: { width: 468, height: 648 },
    }),
  );
  return { hook, view };
}

beforeEach(() => {
  addImageFileForDocument.mockReset();
  track.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useTextDocumentPictures', () => {
  it("binds Insert > Image's built items and the toolbar's list for an Editor", () => {
    const { hook } = setup();
    expect(Object.keys(hook.result.current.actions).sort()).toEqual([
      'image-gallery',
      'image-search',
      'image-upload',
    ]);
    const list = hook.result.current.choices[INSERT_IMAGE_CONTROL]!;
    expect(list.entries.map((e) => ('id' in e ? e.id : ''))).toEqual([
      'image-upload',
      'image-search',
      'image-gallery',
      'image-by-url',
    ]);
  });

  it('binds nothing, and takes no files, for anyone who may not edit', () => {
    const { hook } = setup(false);
    expect(hook.result.current.actions).toEqual({});
    expect(hook.result.current.take([png()], 'Paste')).toBe(false);
  });

  it('stores a pasted picture, places it and counts it', async () => {
    addImageFileForDocument.mockResolvedValue({ image: { id: 'img-1' }, deduped: false });
    const { hook, view } = setup();
    let taken = false;
    act(() => {
      taken = hook.result.current.take([png()], 'Paste');
    });
    expect(taken).toBe(true);
    // Stored, read and hashed in turn: waited for, never timed.
    await waitFor(() => expect(track).toHaveBeenCalled());
    expect(addImageFileForDocument).toHaveBeenCalledWith('me', 'D', expect.any(File));
    expect(view.state.doc.firstChild!.childCount).toBe(2);
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentImagePaste');
  });

  it('says why a picture was not placed, for a while', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    addImageFileForDocument.mockRejectedValue(
      new ImageUploadError('Your image gallery is full.', 'gallery_full'),
    );
    const { hook } = setup();
    act(() => {
      hook.result.current.take([png()], 'Drop');
    });
    await waitFor(() => expect(hook.result.current.notice).not.toBeNull());
    expect(track).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(PICTURE_NOTICE_MS);
    });
    expect(hook.result.current.notice).toBeNull();
  });
});
