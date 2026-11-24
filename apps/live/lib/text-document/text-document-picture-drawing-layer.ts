// A drawing's picture in the writing (docs/specs/034-text-documents/objects.md "Drawn", "The picture's bar"): over the
// PNG last saved, a layer the drawing is drawn into live, cropped and turned as the picture is; and under the picture
// a host for its bar. The drawing and the bar are React's, portalled into these hosts by the surface (`attach`); the
// layer is made only for a picture whose `drawing` names a tab.

/** Told of a drawing's hosts when made or changed: its drawing host and its bar host; gives back a release. */
export type AttachDrawing = (hosts: DrawingHosts) => () => void;

export type DrawingHosts = {
  readonly drawingTabId: string;
  // Where the drawing is drawn: laid out as the picture's image, inside a layer clipped to the picture's box.
  readonly drawing: HTMLElement;
  // Where the picture's bar goes: under the picture's bounds, unturned.
  readonly bar: HTMLElement;
};

/** Set on the drawing host once the drawing is drawn: the PNG under it is hidden. */
export const DRAWING_DRAWN_ATTRIBUTE = 'data-drawing-drawn';
export const PICTURE_DRAWING_LAYER_CLASS = 'text-document-picture-drawing';
export const PICTURE_BAR_CLASS = 'text-document-picture-bar';
/** A control drawn on a drawing (its Retry): the picture's own, never the editor's press. */
export const DRAWING_CONTROL = '[data-drawing-control]';

/** Where the picture's image sits in its box (points), and its bounds' top left and size (points) in the picture. */
export type DrawingLayout = {
  readonly image: { width: number; height: number; left: number; top: number };
  readonly bounds: { left: number; top: number; width: number; height: number };
};

export function pictureDrawingLayer(clip: HTMLElement, dom: HTMLElement, attach?: AttachDrawing) {
  let shown: { tabId: string; layer: HTMLElement; bar: HTMLElement; release: () => void } | null =
    null;
  let layout: DrawingLayout | null = null;

  const place = () => {
    if (!shown || !layout) return;
    const host = shown.layer.firstElementChild as HTMLElement;
    const { image, bounds } = layout;
    Object.assign(host.style, {
      left: `${image.left}pt`,
      top: `${image.top}pt`,
      width: `${image.width}pt`,
      height: `${image.height}pt`,
    });
    Object.assign(shown.bar.style, {
      left: `${bounds.left}pt`,
      top: `${bounds.top + bounds.height}pt`,
    });
  };

  const hide = () => {
    if (!shown) return;
    shown.release();
    shown.layer.remove();
    shown.bar.remove();
    shown = null;
  };

  return {
    /** Shows the drawing a picture names, or none. */
    show(drawingTabId: string | null) {
      if (!attach || drawingTabId === (shown?.tabId ?? null)) return;
      hide();
      if (!drawingTabId) return;
      const layer = document.createElement('span');
      layer.className = PICTURE_DRAWING_LAYER_CLASS;
      layer.setAttribute('aria-hidden', 'true');
      const drawing = document.createElement('span');
      layer.append(drawing);
      // Over the PNG, under the handles.
      clip.after(layer);
      const bar = document.createElement('span');
      bar.className = PICTURE_BAR_CLASS;
      bar.dataset.pictureBar = '';
      dom.append(bar);
      const release = attach({ drawingTabId, drawing, bar });
      shown = { tabId: drawingTabId, layer, bar, release };
      place();
    },
    /** Lays the drawing out as the picture is now (its size, crop and turn). */
    fit(next: DrawingLayout) {
      layout = next;
      place();
    },
    destroy: hide,
  };
}
