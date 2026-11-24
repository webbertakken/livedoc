// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Drawings": the editor's drawing tabs as a text document works them: one is
// opened only when it is here and shared; copied, listed, someone in it, dropped through the editor.
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const select = vi.fn();
const picture = vi.hoisted(() => vi.fn(async () => new Uint8Array([1, 2])));
vi.mock('@/lib/text-document/text-document-drawing-picture', () => ({ drawingPicture: picture }));
const ctx = {
  tabs: [
    { id: 'w', name: 'Notes', elements: [] },
    { id: 'd1', name: 'Drawing 1', drawingOf: 'w', elements: [] },
    { id: 'd2', name: 'Drawing 2', drawingOf: 'w', elements: [] },
  ],
  isOutOfScope: (id: string) => id === 'd2',
  loadedTabIds: new Set(['w', 'd1', 'd2']),
  imageContext: { ownerId: 'me', documentId: 'D', shareCode: null },
  copyDrawingTab: vi.fn(() => 'copy'),
  removeDrawingTabs: vi.fn(),
  remoteTabFocus: new Map([['peer', 'd1']]),
};
vi.mock('@/app/document/[id]/EditorContext', () => ({ useEditorContext: () => ctx }));
vi.mock('@/app/document/[id]/useSelectTab', () => ({ useSelectTab: () => select }));

const { useEditorDrawingTabs } = await import('./useEditorDrawingTabs');

describe('useEditorDrawingTabs', () => {
  const tabs = () => renderHook(() => useEditorDrawingTabs()).result.current;

  it('opens a drawing tab here and shared, and nothing else', () => {
    const drawing = tabs();
    expect(drawing.opens('d1')).toBe(true);
    expect(drawing.opens('d2')).toBe(false);
    expect(drawing.opens('w')).toBe(false);
    expect(drawing.opens('none')).toBe(false);
    drawing.open('d1');
    expect(select).toHaveBeenCalledWith('d1');
  });

  it('names what a drawing belongs to and a text document tab’s drawings', () => {
    const drawing = tabs();
    expect(drawing.drawingOf('d1')).toBe('w');
    expect(drawing.drawingOf('w')).toBeNull();
    expect(drawing.ids('w')).toEqual(['d1', 'd2']);
  });

  it('knows who is in one, and copies and drops through the editor', () => {
    const drawing = tabs();
    expect(drawing.someoneIn('d1')).toBe(true);
    expect(drawing.someoneIn('d2')).toBe(false);
    expect(drawing.copy('d1', 'w')).toBe('copy');
    expect(ctx.copyDrawingTab).toHaveBeenCalledWith('d1', 'w');
    drawing.remove(['d2']);
    expect(ctx.removeDrawingTabs).toHaveBeenCalledWith(['d2']);
  });

  // "In the file": a download draws each drawing it can reach afresh.
  it('draws a loaded drawing shared with this person, and nothing else', async () => {
    const drawing = tabs();
    expect(await drawing.draw('d1')).toEqual(new Uint8Array([1, 2]));
    expect(picture).toHaveBeenCalledWith(ctx.tabs[1], ctx.imageContext);
    expect(await drawing.draw('d2')).toBeNull();
    expect(await drawing.draw('w')).toBeNull();
    ctx.loadedTabIds.delete('d1');
    expect(await drawing.draw('d1')).toBeNull();
    ctx.loadedTabIds.add('d1');
  });
});
