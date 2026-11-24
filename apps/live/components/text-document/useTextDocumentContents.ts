// Insert > Table of contents on the open writing, for an Editor (docs/specs/034-text-documents/links-and-navigation.md
// "Table of contents"): one of three looks put in at the caret in the body, built from the headings, each gaining an id,
// its entries in the Contents styles (made when first needed); once the pages are laid out with it in, its page
// numbers are read again, all one undo step (continued past the redraws outside undo between them). Dimmed while the caret is in a table.
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import { NodeSelection } from 'prosemirror-state';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  CONTENTS,
  CONTENTS_LEVELS_MAX,
  Contents,
  TextDocument,
  TextDocumentState,
  type ContentsLook,
  type Style,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  CONTENTS_LOOK_ITEMS,
  contentsHeadings,
  insertContents,
  rebuildContents,
  type ContentsBuild,
} from '@/lib/text-document/text-document-contents-build';
import { shownPageOfBlock } from '@/lib/text-document/pagination/pagination-plugin';
import {
  TEXT_DOCUMENT_STYLES_ORIGIN,
  continueUndoStep,
  startUndoStep,
} from '@/lib/text-document/text-document-undo';

export type TextDocumentContentsDeps = {
  view: EditorView | null;
  // Whoever may write the body, and is writing in it (not a header, footer or note).
  writes: boolean;
  liveDoc: RefObject<Y.Doc | null>;
  format: TextDocumentFormat;
  pageless: boolean;
  // Points: where an entry's page number goes, the caret section's text width.
  textWidth: number;
  // Told when the caret moves or the writing changes.
  subscribe: (listener: () => void) => () => void;
};

// Only where it goes asked: whether one may go in at the caret.
const PROBE: ContentsBuild = {
  styles: [],
  pages: { kind: 'pageless' },
  textWidth: 0,
  styleOf: () => null,
};

export function useTextDocumentContents(deps: TextDocumentContentsDeps): OfficeActions {
  const { view, writes, liveDoc, format, pageless, textWidth, subscribe } = deps;
  const [placeable, setPlaceable] = useState(true);

  useEffect(() => {
    if (!view) return;
    const update = () => {
      if (!view.isDestroyed) setPlaceable(insertContents('plain', PROBE)(view.state));
    };
    update();
    return subscribe(update);
  }, [view, subscribe]);

  return useMemo(() => {
    if (!view || !writes) return {};
    const readStyles = (): readonly Style[] =>
      liveDoc.current
        ? TextDocumentState.styles(liveDoc.current, format)
        : TextDocument.blank({ format }).styles;
    // The pages as drawn: none pageless; not drawn on this screen (a phone), or laid out.
    const pagesNow = (): ContentsBuild['pages'] => {
      if (pageless) return { kind: 'pageless' };
      const shown = shownPageOfBlock(view);
      return shown ? { kind: 'laid', pageOfBlock: shown } : { kind: 'unseen' };
    };
    // The Contents style of each level its entries take, a file's own or made now on the undo timeline.
    const buildNow = (levels: number): ContentsBuild => {
      const styles = readStyles();
      const wanted = new Set(contentsHeadings(view.state.doc, styles, levels).map((h) => h.level));
      const made: Style[] = [];
      const ids = new Map<number, string>();
      for (const level of wanted) {
        const held = Contents.heldStyle([...styles, ...made], level);
        const style = held ?? Contents.entryStyle(format, level, [...styles, ...made]);
        if (!held) made.push(style);
        ids.set(level, style.id);
      }
      if (made.length > 0 && liveDoc.current) {
        TextDocumentState.setStyles(liveDoc.current, format, made, TEXT_DOCUMENT_STYLES_ORIGIN);
        // The styles made redraw the writing outside undo, which ends the step: what follows goes on with them.
        continueUndoStep(view);
      }
      return {
        styles: [...styles, ...made],
        pages: pagesNow(),
        textWidth,
        styleOf: (level) => ids.get(level) ?? null,
      };
    };
    const insert = (look: ContentsLook) => {
      if (view.isDestroyed || !insertContents(look, PROBE)(view.state)) {
        debugLog('[text-document] table of contents refused', { look });
        return;
      }
      // A step of its own: the writing before it and after it undo apart.
      startUndoStep(view);
      insertContents(look, buildNow(CONTENTS_LEVELS_MAX))(view.state, view.dispatch);
      // The pages are laid out with it in a microtask after the change: its page numbers as they are now.
      queueMicrotask(() => {
        if (view.isDestroyed) return;
        const { selection } = view.state;
        const placed =
          selection instanceof NodeSelection && selection.node.type.name === CONTENTS
            ? selection.from
            : null;
        if (placed !== null && look !== 'links' && !pageless) {
          // The pages' drawing came between, outside undo: the renumbering joins the insert's step.
          continueUndoStep(view);
          rebuildContents(placed, buildNow(CONTENTS_LEVELS_MAX))(view.state, view.dispatch);
        }
        startUndoStep(view);
        track('Element', 'Added', 'TextDocumentTableOfContents');
        debugLog('[text-document] table of contents', { look, renumbered: placed !== null });
      });
      view.focus();
    };
    return Object.fromEntries(
      Object.entries(CONTENTS_LOOK_ITEMS).map(([item, look]) => [
        item,
        { run: () => insert(look), disabled: !placeable },
      ]),
    );
  }, [view, writes, liveDoc, format, pageless, textWidth, placeable]);
}
