// A drawing's picture in the writing (docs/specs/034-text-documents/objects.md "Drawn"): over the
// PNG last saved, a layer the drawing is drawn into live, cropped and turned as the picture is. The drawing is React's,
// portalled into its host by the surface (`attach`); the layer is made only for a picture whose `drawing` names a tab.

/** Told of a drawing's host when made or changed; gives back a release. */
export type AttachDrawing = (hosts: DrawingHosts) => () => void;

export type DrawingHosts = {
  readonly drawingTabId: string;
  // Where the drawing is drawn: laid out as the picture's image, inside a layer clipped to the picture's box.
  readonly drawing: HTMLElement;
};

/** Set on the drawing host once the drawing is drawn: the PNG under it is hidden. */
export const DRAWING_DRAWN_ATTRIBUTE = 'data-drawing-drawn';
export const PICTURE_DRAWING_LAYER_CLASS = 'text-document-picture-drawing';
/** A control drawn on a drawing (its Retry): the picture's own, never the editor's press. */
export const DRAWING_CONTROL = '[data-drawing-control]';

/** Where the picture's image sits in its box, in points. */
export type DrawingLayout = { width: number; height: number; left: number; top: number };

export function pictureDrawingLayer(clip: HTMLElement, attach?: AttachDrawing) {
  let shown: { tabId: string; layer: HTMLElement; release: () => void } | null = null;
  let layout: DrawingLayout | null = null;

  const place = () => {
    if (!shown || !layout) return;
    const host = shown.layer.firstElementChild as HTMLElement;
    Object.assign(host.style, {
      left: `${layout.left}pt`,
      top: `${layout.top}pt`,
      width: `${layout.width}pt`,
      height: `${layout.height}pt`,
    });
  };

  const hide = () => {
    if (!shown) return;
    shown.release();
    shown.layer.remove();
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
      const release = attach({ drawingTabId, drawing });
      shown = { tabId: drawingTabId, layer, release };
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
