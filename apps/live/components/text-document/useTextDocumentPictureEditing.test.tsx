// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Working with a picture": Alt text and Replace image are an Editor's, dimmed
// while no picture is selected; Alt text's dialog writes its description or decorative mark; a replacement goes in the
// picture's place.
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const { useTextDocumentPictureEditing } = await import('./useTextDocumentPictureEditing');

function setup({ pictureSelected = true, canEdit = true } = {}) {
  const picture = schema.nodes[PICTURE]!.create({
    media: 'old',
    width: 100,
    height: 50,
    alt: 'Sky',
  });
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, [picture])]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      selection: pictureSelected ? NodeSelection.create(doc, 1) : TextSelection.create(doc, 1),
    }),
  });
  const bring = { chooseFile: vi.fn(), openPicker: vi.fn() };
  const hook = renderHook(() =>
    useTextDocumentPictureEditing({ view, canEdit, subscribe: () => () => {}, bring }),
  );
  return { hook, view, bring };
}

beforeEach(() => track.mockReset());

describe('useTextDocumentPictureEditing', () => {
  it('dims its items while no picture is selected', () => {
    const { hook } = setup({ pictureSelected: false });
    expect(hook.result.current.actions['image-alt-text']?.disabled).toBe(true);
    expect(hook.result.current.actions['image-replace-gallery']?.disabled).toBe(true);
  });

  it('binds nothing for anyone who may not edit', () => {
    expect(setup({ canEdit: false }).hook.result.current.actions).toEqual({});
  });

  it("writes Alt text's description to the picture, counted", () => {
    const { hook, view } = setup();
    act(() => hook.result.current.actions['image-alt-text']!.run());
    const { unmount } = render(<>{hook.result.current.dialog}</>);
    const field = screen.getByLabelText('Description') as HTMLTextAreaElement;
    expect(field.value).toBe('Sky');
    fireEvent.change(field, { target: { value: 'A clear sky' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(view.state.doc.nodeAt(1)!.attrs.alt).toBe('A clear sky');
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentImageAltText');
    unmount();
  });

  it('marks a picture decorative, emptying and disabling its description', () => {
    const { hook, view } = setup();
    act(() => hook.result.current.actions['image-alt-text']!.run());
    const { unmount } = render(<>{hook.result.current.dialog}</>);
    fireEvent.click(screen.getByLabelText('Mark as decorative'));
    const field = screen.getByLabelText('Description') as HTMLTextAreaElement;
    expect(field.disabled).toBe(true);
    expect(field.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(view.state.doc.nodeAt(1)!.attrs).toMatchObject({ alt: null, decorative: true });
    unmount();
  });

  it("brings a replacement into the picture's place, one file at a time", () => {
    const { hook, view, bring } = setup();
    act(() => hook.result.current.actions['image-replace-upload']!.run());
    const bringing = bring.chooseFile.mock.calls[0]![0];
    expect(bringing.most).toBe(1);
    const put = bringing.put({
      key: 'new',
      pixels: { width: 200, height: 200 },
      size: { width: 150, height: 150 },
    });
    expect(put(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc.nodeAt(1)!.attrs).toMatchObject({
      media: 'new',
      width: 100,
      height: 100,
      alt: 'Sky',
    });
    bringing.placed('Upload');
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentImageReplace');
    act(() => hook.result.current.actions['image-replace-search']!.run());
    expect(bring.openPicker).toHaveBeenCalledWith('search', expect.objectContaining({ most: 1 }));
  });
});
