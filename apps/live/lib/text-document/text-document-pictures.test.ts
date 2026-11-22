// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "In the editor": a picture in line drawn at its size, its crop cutting its
// media; its alternative text read, a decorative one read as nothing; one without media a grey box reading so.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';
import { pictureBox, pictureView } from './text-document-pictures';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const picture = (attrs: Record<string, unknown>) =>
  textDocumentSchema.nodes[PICTURE]!.create({ media: 'k', width: 60, height: 40, ...attrs });

describe('pictureBox', () => {
  it('draws the whole picture at its size without a crop', () => {
    expect(pictureBox(picture({}).attrs)).toEqual({
      width: 60,
      height: 40,
      image: { width: 60, height: 40, left: 0, top: 0 },
    });
  });

  it('draws the picture larger, moved by the crop, so only what is left shows', () => {
    const crop = { top: 0.2, right: 0.1, bottom: 0.0, left: 0.1 };
    expect(pictureBox(picture({ crop }).attrs)).toEqual({
      width: 60,
      height: 40,
      image: { width: 75, height: 50, left: -7.5, top: -10 },
    });
  });

  it('reads a size it cannot draw as none', () => {
    expect(pictureBox(picture({ width: 'x', height: -1 }).attrs)).toMatchObject({
      width: 0,
      height: 0,
    });
  });
});

describe('a picture drawn', () => {
  // jsdom has no object URLs; a browser makes one per picture drawn.
  beforeAll(() => {
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:picture', revokeObjectURL: () => {} }),
    );
  });

  const draw = (attrs: Record<string, unknown>, media = true) => {
    const node = picture(attrs);
    const view = pictureView(() => (media ? { mediaType: 'image/png', bytes: PNG } : undefined))(
      node,
      {} as EditorView,
      () => 0,
      [],
      undefined as never,
    );
    return view.dom;
  };

  it('shows its media at its size, read by its alternative text', () => {
    const dom = draw({ alt: 'A green field' });
    expect(dom.style.width).toBe('60pt');
    expect(dom.style.height).toBe('40pt');
    const img = dom.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('A green field');
    expect(img.getAttribute('src')).toMatch(/^blob:/);
  });

  it('reads a decorative picture as nothing', () => {
    expect(
      draw({ alt: 'Ignored', decorative: true }).querySelector('img')!.getAttribute('alt'),
    ).toBe('');
  });

  it('shows a grey box reading so when its media is missing', () => {
    const dom = draw({}, false);
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.textContent).toBe('Picture, not loaded');
    expect(dom.classList.contains('text-document-picture-missing')).toBe(true);
  });

  it('is one atom of the paragraph, read as no text', () => {
    const state = EditorState.create({
      doc: textDocumentSchema.node('doc', null, [
        textDocumentSchema.node('paragraph', null, [textDocumentSchema.text('a'), picture({})]),
      ]),
    });
    expect(state.doc.textContent).toBe('a');
    expect(state.doc.firstChild!.childCount).toBe(2);
  });
});
