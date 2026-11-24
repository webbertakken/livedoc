// A table of contents on the open writing, for an Editor (docs/specs/034-text-documents/links-and-navigation.md "Table
// of contents"): Insert puts one of three looks in at the caret in the body; Update rebuilds the selected one; its
// options panel changes its look or levels. Each builds from the headings, each gaining an id, its entries in the
// Contents styles (made when first needed); once the pages are laid out again its page numbers are read again, all one
// undo step (continued past the redraws outside undo between them). Insert is dimmed while the caret is in a table.
// While one is selected, its bar (Update, options) is drawn into the block.
import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
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
  type ContentsChange,
} from '@/lib/text-document/text-document-contents-build';
import { CONTENTS_BAR_HOST } from '@/lib/text-document/text-document-contents';
import { shownPageOfBlock } from '@/lib/text-document/pagination/pagination-plugin';
import {
  TEXT_DOCUMENT_STYLES_ORIGIN,
  continueUndoStep,
  startUndoStep,
} from '@/lib/text-document/text-document-undo';
import { ContentsLookPicture } from './ContentsLookPicture';
import { TextDocumentContentsBar } from './TextDocumentContentsBar';

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
  // Table of contents options: opens its panel.
  openOptions: () => void;
};

/** The table of contents the caret selects: where it starts, its look and levels, and its bar's host. */
export type SelectedContents = {
  readonly pos: number;
  readonly look: ContentsLook;
  readonly levels: number;
  readonly host: HTMLElement | null;
};

export type TextDocumentContents = {
  actions: OfficeActions;
  selected: SelectedContents | null;
  // The options panel's change to the selected one.
  change: (change: ContentsChange) => void;
  // Its bar, drawn into the selected block.
  bar: ReactNode;
};

// Only where it goes asked: whether one may go in at the caret.
const PROBE: ContentsBuild = {
  styles: [],
  pages: { kind: 'pageless' },
  textWidth: 0,
  styleOf: () => null,
};

function selectedIn(view: EditorView): SelectedContents | null {
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== CONTENTS) return null;
  const attrs = selection.node.attrs as { look: ContentsLook; levels: number };
  const dom = view.nodeDOM(selection.from);
  return {
    pos: selection.from,
    look: attrs.look,
    levels: Contents.levelsOf(attrs.levels),
    host: dom instanceof HTMLElement ? dom.querySelector<HTMLElement>(CONTENTS_BAR_HOST) : null,
  };
}

const same = (a: SelectedContents | null, b: SelectedContents | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.pos === b.pos &&
    a.look === b.look &&
    a.levels === b.levels &&
    a.host === b.host);

export function useTextDocumentContents(deps: TextDocumentContentsDeps): TextDocumentContents {
  const { view, writes, liveDoc, format, pageless, textWidth, subscribe, openOptions } = deps;
  const [placeable, setPlaceable] = useState(true);
  const [selected, setSelected] = useState<SelectedContents | null>(null);

  useEffect(() => {
    if (!view) return;
    const update = () => {
      if (view.isDestroyed) return;
      setPlaceable(insertContents('plain', PROBE)(view.state));
      const now = selectedIn(view);
      setSelected((was) => (same(was, now) ? was : now));
    };
    update();
    return subscribe(update);
  }, [view, subscribe]);

  const engine = useMemo(() => {
    if (!view || !writes) return null;
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
    // The pages are laid out again a microtask after a change: the selected block's page numbers as they are now,
    // in the same undo step; then the step ends and `done` tells of it.
    const renumberThen = (done: (renumbered: boolean) => void) => {
      queueMicrotask(() => {
        if (view.isDestroyed) return;
        const now = selectedIn(view);
        const renumbered = now !== null && now.look !== 'links' && !pageless;
        if (now && renumbered) {
          // The pages' drawing came between, outside undo: the renumbering joins the step.
          continueUndoStep(view);
          rebuildContents(now.pos, buildNow(now.levels))(view.state, view.dispatch);
        }
        startUndoStep(view);
        done(renumbered);
      });
    };
    const insert = (look: ContentsLook) => {
      if (view.isDestroyed || !insertContents(look, PROBE)(view.state)) {
        debugLog('[text-document] table of contents refused', { look });
        return;
      }
      // A step of its own: the writing before it and after it undo apart.
      startUndoStep(view);
      insertContents(look, buildNow(CONTENTS_LEVELS_MAX))(view.state, view.dispatch);
      renumberThen((renumbered) => {
        track('Element', 'Added', 'TextDocumentTableOfContents');
        debugLog('[text-document] table of contents', { look, renumbered });
      });
      view.focus();
    };
    // Update (no change) or the options panel's change, on the selected one.
    const rebuild = (change: ContentsChange) => {
      const now = view.isDestroyed ? null : selectedIn(view);
      if (!now) {
        debugLog('[text-document] table of contents change refused', change);
        return;
      }
      startUndoStep(view);
      const levels = Contents.levelsOf(change.levels ?? now.levels);
      rebuildContents(now.pos, buildNow(levels), change)(view.state, view.dispatch);
      renumberThen((renumbered) => {
        track('Element', 'Changed', 'TextDocumentTableOfContents');
        debugLog('[text-document] table of contents changed', { ...change, renumbered });
      });
    };
    return { insert, rebuild };
  }, [view, writes, liveDoc, format, pageless, textWidth]);

  const actions = useMemo<OfficeActions>(
    () =>
      engine
        ? Object.fromEntries(
            Object.entries(CONTENTS_LOOK_ITEMS).map(([item, look]) => [
              item,
              {
                run: () => engine.insert(look),
                disabled: !placeable,
                picture: <ContentsLookPicture look={look} />,
              },
            ]),
          )
        : {},
    [engine, placeable],
  );

  const bar =
    engine && selected?.host
      ? createPortal(
          <TextDocumentContentsBar
            onUpdate={() => engine.rebuild({})}
            onOptions={openOptions}
            onBack={() => view?.focus()}
          />,
          selected.host,
        )
      : null;

  return {
    actions,
    selected: engine ? selected : null,
    change: (change) => engine?.rebuild(change),
    bar,
  };
}
