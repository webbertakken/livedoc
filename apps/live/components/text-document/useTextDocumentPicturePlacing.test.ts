// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "In the editor": Text wrapping and Position for the selected picture, each
// one undo step and counted; a picture leaving In line stays where it is drawn; switching between moving with text
// and fixed on the page keeps it in place; what cannot be measured changes nothing.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE, PicturePlacements, type PicturePlacement } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';

const { track, spot, onPage } = vi.hoisted(() => ({
  track: vi.fn(),
  spot: vi.fn<() => { x: number; y: number } | null>(),
  onPage: vi.fn<() => { x: number; y: number } | null>(),
}));
vi.mock('@/lib/telemetry', () => ({ track }));
vi.mock('@/lib/text-document/text-document-picture-placed-plugin', () => ({
  pictureSpot: spot,
  paragraphOnPage: onPage,
}));

const { useTextDocumentPicturePlacing } = await import('./useTextDocumentPicturePlacing');

const wrapPlacement = {
  wrap: 'wrap',
  margin: PicturePlacements.margin(9),
  moves: 'with-text',
  x: 10,
  y: 20,
} as const;

function setup({
  selected = true,
  canEdit = true,
  placement = null as PicturePlacement | null,
} = {}) {
  const picture = schema.nodes[PICTURE]!.create({ media: 'm', width: 60, height: 30, placement });
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, [picture])]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      selection: selected ? NodeSelection.create(doc, 1) : TextSelection.create(doc, 2),
    }),
  });
  const hook = renderHook(() =>
    useTextDocumentPicturePlacing({ view, canEdit, subscribe: () => () => {}, paged: true }),
  );
  return { hook, view };
}
const placementOf = (view: EditorView) =>
  view.state.doc.nodeAt(1)!.attrs.placement as PicturePlacement | null;

beforeEach(() => {
  track.mockReset();
  spot.mockReset();
  onPage.mockReset();
});

describe('useTextDocumentPicturePlacing', () => {
  it('reads the selected picture, or none', () => {
    expect(setup().hook.result.current.placing).toEqual({ placement: undefined, paged: true });
    expect(setup({ placement: wrapPlacement }).hook.result.current.placing?.placement).toEqual(
      wrapPlacement,
    );
    expect(setup({ selected: false }).hook.result.current.placing).toBeNull();
  });

  it('places a picture leaving In line where it is drawn, as one counted step', () => {
    spot.mockReturnValue({ x: 5, y: -3 });
    const { hook, view } = setup();
    act(() => hook.result.current.wrap('break'));
    expect(placementOf(view)).toEqual({ ...wrapPlacement, wrap: 'break', x: 5, y: -3 });
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentImageWrap');
  });

  it('changes nothing when the picture is not drawn to be measured', () => {
    spot.mockReturnValue(null);
    const { hook, view } = setup();
    act(() => hook.result.current.wrap('wrap'));
    expect(placementOf(view)).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it('puts a picture back in line, and sets its margin', () => {
    const { hook, view } = setup({ placement: wrapPlacement });
    act(() => hook.result.current.margin(36));
    expect(placementOf(view)?.margin).toEqual(PicturePlacements.margin(36));
    act(() => hook.result.current.wrap('inline'));
    expect(placementOf(view)).toBeNull();
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('Element', 'Changed', 'TextDocumentImageWrap');
  });

  it('fixes it on the page where it stands, and moves its offsets, each counted as Position', () => {
    onPage.mockReturnValue({ x: 72, y: 100 });
    const { hook, view } = setup({ placement: wrapPlacement });
    act(() => hook.result.current.moves('page'));
    expect(placementOf(view)).toMatchObject({ moves: 'page', x: 82, y: 120 });
    act(() => hook.result.current.offset('y', 300));
    expect(placementOf(view)?.y).toBe(300);
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('Element', 'Changed', 'TextDocumentImagePosition');
  });

  it('cannot fix it on a page it cannot measure', () => {
    onPage.mockReturnValue(null);
    const { hook, view } = setup({ placement: wrapPlacement });
    act(() => hook.result.current.moves('page'));
    expect(placementOf(view)).toEqual(wrapPlacement);
  });

  it('changes nothing for a reader', () => {
    spot.mockReturnValue({ x: 5, y: -3 });
    const { hook, view } = setup({ canEdit: false });
    act(() => hook.result.current.wrap('wrap'));
    expect(placementOf(view)).toBeNull();
  });
});
