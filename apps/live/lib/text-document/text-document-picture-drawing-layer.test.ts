// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Drawn", "The picture's bar": a drawing's picture gets a layer its drawing is
// drawn into, laid out as the picture's image, and a host for its bar under its bounds; none for a plain picture.
import { describe, expect, it, vi } from 'vitest';
import {
  PICTURE_BAR_CLASS,
  PICTURE_DRAWING_LAYER_CLASS,
  pictureDrawingLayer,
  type DrawingHosts,
} from './text-document-picture-drawing-layer';

function setUp() {
  const dom = document.createElement('span');
  const turn = document.createElement('span');
  const clip = document.createElement('span');
  const handles = document.createElement('span');
  turn.append(clip, handles);
  dom.append(turn);
  const release = vi.fn();
  const attached: DrawingHosts[] = [];
  const attach = vi.fn((hosts: DrawingHosts) => {
    attached.push(hosts);
    return release;
  });
  return { dom, turn, clip, handles, attach, attached, release };
}

const LAYOUT = {
  image: { width: 75, height: 50, left: -7.5, top: -10 },
  bounds: { left: -5, top: 2, width: 60, height: 40 },
};

describe('pictureDrawingLayer', () => {
  it('makes a layer over the picture and a bar host under it, told to the surface', () => {
    const { dom, turn, clip, handles, attach, attached } = setUp();
    const layer = pictureDrawingLayer(clip, dom, attach);
    layer.fit(LAYOUT);
    layer.show('drawing-1');
    expect(attach).toHaveBeenCalledTimes(1);
    const [hosts] = attached;
    expect(hosts!.drawingTabId).toBe('drawing-1');
    const drawn = turn.querySelector(`.${PICTURE_DRAWING_LAYER_CLASS}`)!;
    expect([...turn.children]).toEqual([clip, drawn, handles]);
    expect(drawn.getAttribute('aria-hidden')).toBe('true');
    expect(drawn.firstElementChild).toBe(hosts!.drawing);
    expect(hosts!.drawing.style.cssText).toBe(
      'left: -7.5pt; top: -10pt; width: 75pt; height: 50pt;',
    );
    expect(hosts!.bar.parentElement).toBe(dom);
    expect(hosts!.bar.classList.contains(PICTURE_BAR_CLASS)).toBe(true);
    expect([hosts!.bar.style.left, hosts!.bar.style.top]).toEqual(['-5pt', '42pt']);
  });

  it('follows the picture as it is sized, cropped or turned', () => {
    const { dom, clip, attach, attached } = setUp();
    const layer = pictureDrawingLayer(clip, dom, attach);
    layer.show('drawing-1');
    layer.fit({
      image: { width: 10, height: 20, left: 0, top: 0 },
      bounds: { left: 0, top: 0, width: 10, height: 20 },
    });
    expect(attached[0]!.drawing.style.width).toBe('10pt');
    expect(attached[0]!.bar.style.top).toBe('20pt');
  });

  it('gives the hosts back when the picture names another drawing, none, or is gone', () => {
    const { dom, turn, clip, attach, release } = setUp();
    const layer = pictureDrawingLayer(clip, dom, attach);
    layer.show('drawing-1');
    layer.show('drawing-1');
    expect(attach).toHaveBeenCalledTimes(1);
    layer.show('drawing-2');
    expect(release).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(2);
    layer.show(null);
    expect(release).toHaveBeenCalledTimes(2);
    expect(turn.querySelector(`.${PICTURE_DRAWING_LAYER_CLASS}`)).toBeNull();
    expect(dom.querySelector(`.${PICTURE_BAR_CLASS}`)).toBeNull();
    layer.show('drawing-3');
    layer.destroy();
    expect(release).toHaveBeenCalledTimes(3);
  });

  it('makes nothing for a plain picture, or where nothing draws drawings', () => {
    const { dom, turn, clip, attach } = setUp();
    pictureDrawingLayer(clip, dom, attach).show(null);
    pictureDrawingLayer(clip, dom).show('drawing-1');
    expect(attach).not.toHaveBeenCalled();
    expect(turn.children).toHaveLength(2);
  });
});
