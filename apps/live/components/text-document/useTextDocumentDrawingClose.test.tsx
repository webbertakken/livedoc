// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Inserting and editing", "Its picture": Save and close makes the drawing's
// picture, stores it and goes back to its text document; an empty drawing is removed and places nothing; a picture
// that cannot be stored keeps the drawing open and says why; anyone who cannot edit only closes it.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShape, type Tab } from '@livedoc/document';

const { drawingPicture, addImageFileForDocument } = vi.hoisted(() => ({
  drawingPicture: vi.fn(),
  addImageFileForDocument: vi.fn(),
}));
vi.mock('@/lib/text-document/text-document-drawing-picture', () => ({ drawingPicture }));
vi.mock('@/lib/upload-image', async (actual) => ({
  ...(await actual<typeof import('@/lib/upload-image')>()),
  addImageFileForDocument,
}));

const { ImageUploadError } = await import('@/lib/upload-image');
const { useTextDocumentDrawingClose } = await import('./useTextDocumentDrawingClose');
const { drawingPending, putDrawingPending, readyDrawingFor, takeDrawing } =
  await import('@/lib/text-document/text-document-drawing-pending');

const drawn: Tab & { drawingOf: string } = {
  id: 'd1',
  name: 'Drawing 1',
  drawingOf: 'w',
  elements: [{ ...createShape('square', 0, 0), id: 's' }],
};

function setup(tab: Tab & { drawingOf: string } = drawn, canEdit = true) {
  const deleteTab = vi.fn();
  const selectTab = vi.fn();
  const hook = renderHook(() =>
    useTextDocumentDrawingClose({
      tab,
      canEdit,
      ownerId: 'me',
      documentId: 'D',
      imageContext: null,
      deleteTab,
      selectTab,
    }),
  );
  return { hook, deleteTab, selectTab };
}

beforeEach(() => {
  sessionStorage.clear();
  takeDrawing('d1');
  drawingPicture.mockReset();
  drawingPicture.mockResolvedValue(new Uint8Array([1, 2, 3]));
  addImageFileForDocument.mockReset();
  addImageFileForDocument.mockResolvedValue({ image: { id: 'img-1' } });
});

describe('useTextDocumentDrawingClose', () => {
  it('stores the picture, readies it where it goes, and goes back to its text document', async () => {
    putDrawingPending('d1', { textDocumentTabId: 'w', documentTab: 't.0', anchor: 'A' });
    const { hook, selectTab } = setup();
    await act(() => hook.result.current.saveAndClose());
    expect(readyDrawingFor('w')).toMatchObject({
      drawingTabId: 'd1',
      stored: 'img-1',
      where: { documentTab: 't.0', anchor: 'A' },
    });
    expect(selectTab).toHaveBeenCalledWith('w');
  });

  it('places it at the end of the shown body when its place was lost', async () => {
    const { hook } = setup();
    await act(() => hook.result.current.saveAndClose());
    expect(drawingPending('d1')).toEqual({ textDocumentTabId: 'w', documentTab: '', anchor: null });
  });

  it('removes an empty drawing and places nothing', async () => {
    putDrawingPending('d1', { textDocumentTabId: 'w', documentTab: 't.0', anchor: null });
    const { hook, deleteTab } = setup({ ...drawn, elements: [] });
    await act(() => hook.result.current.saveAndClose());
    expect(deleteTab).toHaveBeenCalledWith('d1');
    expect(drawingPicture).not.toHaveBeenCalled();
    expect(drawingPending('d1')).toBeNull();
  });

  it('stays open and says why when the picture cannot be stored', async () => {
    addImageFileForDocument.mockRejectedValue(new ImageUploadError('Too big.', 'too_large'));
    const { hook, selectTab } = setup();
    await act(() => hook.result.current.saveAndClose());
    expect(hook.result.current.refused).toBe('Too big.');
    expect(selectTab).not.toHaveBeenCalled();
    expect(readyDrawingFor('w')).toBeNull();
  });

  it('only closes for anyone who cannot edit', async () => {
    const { hook, selectTab } = setup(drawn, false);
    await act(() => hook.result.current.saveAndClose());
    expect(drawingPicture).not.toHaveBeenCalled();
    expect(selectTab).toHaveBeenCalledWith('w');
  });
});
