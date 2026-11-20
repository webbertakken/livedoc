// Signals from the writing, for parts of the surface that read it without the surface itself drawing again on every
// keystroke: `subscribe` when the body changed (anyone's edit, a catch-up, an undo; the outline), and `subscribeCaret`
// when the body, the selection or the formatting at the caret changed (the toolbar's pressed states and font size),
// at most once a frame.
import { Plugin } from 'prosemirror-state';

export type TextDocumentChanges = {
  plugin: Plugin;
  subscribe: (listener: () => void) => () => void;
  subscribeCaret: (listener: () => void) => () => void;
};

function listenerSet() {
  const listeners = new Set<() => void>();
  return {
    notify: () => {
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createTextDocumentChanges(): TextDocumentChanges {
  const body = listenerSet();
  const caret = listenerSet();
  let frame: number | null = null;
  const caretChanged = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      caret.notify();
    });
  };
  return {
    plugin: new Plugin({
      view: () => ({
        update: (view, previous) => {
          const { state } = view;
          if (state.doc !== previous.doc) body.notify();
          if (
            state.doc !== previous.doc ||
            !state.selection.eq(previous.selection) ||
            state.storedMarks !== previous.storedMarks
          )
            caretChanged();
        },
        destroy: () => {
          if (frame !== null) cancelAnimationFrame(frame);
          frame = null;
        },
      }),
    }),
    subscribe: body.subscribe,
    subscribeCaret: caret.subscribe,
  };
}
