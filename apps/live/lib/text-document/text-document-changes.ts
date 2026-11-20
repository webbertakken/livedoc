// A signal that the writing changed (anyone's edit, a catch-up, an undo), for a part of the surface that reads the
// whole body (the outline) without the surface itself drawing again on every keystroke.
import { Plugin } from 'prosemirror-state';

export type TextDocumentChanges = {
  plugin: Plugin;
  subscribe: (listener: () => void) => () => void;
};

export function createTextDocumentChanges(): TextDocumentChanges {
  const listeners = new Set<() => void>();
  return {
    plugin: new Plugin({
      view: () => ({
        update: (view, previous) => {
          if (view.state.doc !== previous.doc) for (const listener of listeners) listener();
        },
      }),
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
