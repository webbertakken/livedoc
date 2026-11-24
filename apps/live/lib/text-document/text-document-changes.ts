// Signals from the writing, for parts of the surface that read it without the surface itself drawing again on every
// keystroke: `subscribe` when the body changed (anyone's edit, a catch-up, an undo; the outline), and `subscribeCaret`
// when the body, the selection, the formatting at the caret, the paint roller or the lists drawn changed (the toolbar's
// pressed states and font size). Both are told after the frame that paints the change, once however many changes came
// in it (performance.md "A keystroke's frame").
import { Plugin } from 'prosemirror-state';
import { afterNextPaint } from '@/lib/after-next-paint';
import { paintFormatKey } from './text-document-paint-format';
import { listMarkersKey } from './text-document-list-markers';

export type TextDocumentChanges = {
  plugin: Plugin;
  subscribe: (listener: () => void) => () => void;
  subscribeCaret: (listener: () => void) => () => void;
  /** Tells every listener, as when the editor is given another state whose plugin views see no update. */
  touch: () => void;
};

// Listeners told once after the next paint, however often they are notified before it.
function listenerSet() {
  const listeners = new Set<() => void>();
  let waiting: (() => void) | null = null;
  return {
    notify: () => {
      waiting ??= afterNextPaint(() => {
        waiting = null;
        for (const listener of listeners) listener();
      });
    },
    cancel: () => {
      waiting?.();
      waiting = null;
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
  return {
    plugin: new Plugin({
      view: () => ({
        update: (view, previous) => {
          const { state } = view;
          if (state.doc !== previous.doc) body.notify();
          if (
            state.doc !== previous.doc ||
            !state.selection.eq(previous.selection) ||
            state.storedMarks !== previous.storedMarks ||
            paintFormatKey.getState(state) !== paintFormatKey.getState(previous) ||
            listMarkersKey.getState(state) !== listMarkersKey.getState(previous)
          )
            caret.notify();
        },
        destroy: () => {
          body.cancel();
          caret.cancel();
        },
      }),
    }),
    subscribe: body.subscribe,
    subscribeCaret: caret.subscribe,
    touch: () => {
      body.notify();
      caret.notify();
    },
  };
}
