// A text document's conversion in this browser (docs/specs/034-text-documents/standard-mapping.md "Conversion"): the
// live state converted in one transaction, then the tab's format changed. One undo takes it back and one redo makes
// it again: the body's undo manager holds the step (the writing, styles, lists and page), a conversion's own manager
// the parts the body's never tracks (headers, footers, notes, kept parts, pictures' media), and when the body's step is
// undone or redone the other follows with the format.
import * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState, type ConversionLoss } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';

/** The origin a conversion is written with: the body's undo manager tracks it. */
export const TEXT_DOCUMENT_CONVERSION_ORIGIN = Symbol('text-document-conversion');

/** The meta key a conversion's undo step carries its formats under. */
const CONVERSION_META = 'conversion';

type Formats = { readonly from: TextDocumentFormat; readonly to: TextDocumentFormat };

/** Root types a conversion writes that the body's undo manager does not hold: every story, the kept parts, media. */
function otherScope(doc: Y.Doc): (Y.XmlFragment | Y.Map<unknown>)[] {
  return [...doc.share.keys()].flatMap((name): (Y.XmlFragment | Y.Map<unknown>)[] =>
    name.startsWith('story:')
      ? [doc.getXmlFragment(name)]
      : name === 'source' || name === 'media'
        ? [doc.getMap(name)]
        : [],
  );
}

export type TextDocumentConversion = {
  /** Converts the live state from `from` to `to`, then changes the tab's format; answers the losses. */
  readonly convert: (from: TextDocumentFormat, to: TextDocumentFormat) => ConversionLoss[];
  /** Stops listening to the body's undo manager. */
  readonly destroy: () => void;
};

/**
 * Converts `doc` under the body's undo manager `body`, `setFormat` naming the tab's format after each conversion, undo
 * and redo.
 */
export function textDocumentConversion(
  doc: Y.Doc,
  body: Y.UndoManager,
  setFormat: (format: TextDocumentFormat) => void,
): TextDocumentConversion {
  const others = new Y.UndoManager(otherScope(doc), {
    doc,
    trackedOrigins: new Set([TEXT_DOCUMENT_CONVERSION_ORIGIN]),
    captureTimeout: 0,
  });
  body.addTrackedOrigin(TEXT_DOCUMENT_CONVERSION_ORIGIN);
  let converting: Formats | null = null;
  // The step a conversion makes carries its formats, and so does the step undoing or redoing it adds to the other
  // stack (the one being popped is the manager's current item while it runs).
  const added = ({
    stackItem,
    origin,
  }: {
    stackItem: { meta: Map<unknown, unknown> };
    origin: unknown;
  }) => {
    const formats =
      origin === TEXT_DOCUMENT_CONVERSION_ORIGIN
        ? converting
        : origin === body
          ? (body.currStackItem?.meta.get(CONVERSION_META) as Formats | undefined)
          : undefined;
    if (formats) stackItem.meta.set(CONVERSION_META, formats);
  };
  const popped = ({
    stackItem,
    type,
  }: {
    stackItem: { meta: Map<unknown, unknown> };
    type: 'undo' | 'redo';
  }) => {
    const formats = stackItem.meta.get(CONVERSION_META) as Formats | undefined;
    if (!formats) return;
    if (type === 'undo') others.undo();
    else others.redo();
    setFormat(type === 'undo' ? formats.from : formats.to);
    debugLog('[text-document] conversion', { [type]: true, ...formats });
  };
  body.on('stack-item-added', added);
  body.on('stack-item-popped', popped);
  return {
    convert: (from, to) => {
      for (const type of otherScope(doc)) others.addToScope(type);
      // The conversion is a step of its own, apart from typing before and after it.
      body.stopCapturing();
      others.stopCapturing();
      converting = { from, to };
      const steps = body.undoStack.length;
      try {
        const losses = TextDocumentState.convert(doc, from, to, TEXT_DOCUMENT_CONVERSION_ORIGIN);
        // A conversion that changed nothing the body tracks leaves no step there: its other parts stay converted.
        if (body.undoStack.length === steps)
          debugLog('[text-document] conversion left no undo step', { from, to });
        setFormat(to);
        return losses;
      } finally {
        converting = null;
        body.stopCapturing();
      }
    },
    destroy: () => {
      body.off('stack-item-added', added);
      body.off('stack-item-popped', popped);
      others.destroy();
    },
  };
}
