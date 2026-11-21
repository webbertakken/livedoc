// The writing's clipboard (docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard"). Copy and Cut put the
// selection on it as HTML for other editors, as plain text, and as LiveDoc's model fragment carried in the HTML.
// Paste reads the fragment first, placed in this document's terms; else the HTML, made plain and read by its rules;
// else the text, a paragraph per line in the formatting at the caret. A paste is one undo step, its new lists
// included. The Edit menu's items ask the browser for the clipboard, and say so when it refuses.
import { Fragment, Slice, type Node as PmNode } from 'prosemirror-model';
import { Plugin, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { ListDefinition, Styles, type ListPlace, type StyleRole } from '@livedoc/text-documents';
import { parseInert } from '@livedoc/ui/trusted-types';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  FRAGMENT_ATTRIBUTE,
  makeFragment,
  placeFragment,
  readFragment,
  type FragmentContext,
  type NodeJson,
} from './text-document-clipboard-fragment';
import type { ClipboardNotes } from './text-document-footnote-clipboard';
import { noteNumbersOf } from './text-document-footnotes-edit';
import { clipboardSerializer } from './text-document-clipboard-html';
import { plainTextOf, plainTextSlice, selectionMarkers } from './text-document-clipboard-text';
import type { ListsAccess } from './text-document-lists';
import {
  normalisePastedHtml,
  PASTE_HEADING_PREFIX,
  PASTE_LIST_PREFIX,
  pastedHtmlParser,
  type PastedLists,
} from './text-document-paste-html';
import { textDocumentSchema } from './text-document-schema';
import { startUndoStep } from './text-document-undo';
import { looksLikeMarkdown } from './text-document-markdown';
import { markdownSlice } from './text-document-markdown-slice';
import { lastStretch, StretchSelection } from './text-document-stretches';

/** What a paste read: a fragment, HTML or plain text. */
export type PasteSource = 'Document' | 'Html' | 'Markdown' | 'Plain';

export type ClipboardOptions = {
  /** The document the writing is: its place, styles, defaults and lists; null before it is bound. */
  read: () => FragmentContext | null;
  /** Where a paste's new lists are written. */
  lists: ListsAccess;
  /** Content kept from another file was left out of a paste: how many items. */
  onLeftOut: (count: number) => void;
  /** Whether Markdown text pasted is read as Markdown (Preferences > Automatically detect Markdown). */
  markdown?: () => boolean;
  /** Footnotes' writing copied with their marks, and a note of its own for each mark pasted (page-layout.md "Footnotes"). */
  notes?: ClipboardNotes;
};

// What the paste being read found, from its parse to its insertion.
type Reading = {
  source: PasteSource;
  slice?: Slice;
  pasted?: PastedLists;
  lists: Record<string, ListDefinition>;
  left: number;
  /** The footnotes' writing a fragment brought, placed, by its story. */
  notes?: Readonly<Record<string, NodeJson[]>>;
};

/** A pasted list's definition: its first level's kind for every level, each level read drawn as it was. */
function pastedDefinition(
  levels: Map<number, { kind: ListDefinition['levels'][number]['kind']; format?: string }>,
) {
  const first = levels.get(Math.min(...levels.keys()))!;
  const base = ListDefinition.of(first.kind);
  return {
    ...base,
    levels: base.levels.map((level, at) => {
      const read = levels.get(at);
      if (!read) return level;
      const drawn = ListDefinition.of(read.kind).levels[at]!;
      return drawn.kind === 'number' && read.format
        ? { ...drawn, format: read.format as typeof drawn.format }
        : drawn;
    }),
  };
}

function mapParagraphs(fragment: Fragment, map: (node: PmNode) => PmNode): Fragment {
  const out: PmNode[] = [];
  fragment.forEach((node) => {
    if (node.type.name === 'paragraph') out.push(map(node));
    else out.push(node.copy(mapParagraphs(node.content, map)));
  });
  return Fragment.from(out);
}

/** The placeholders pasted HTML names (`@heading<n>`, `@paste:<key>`) placed in the document, and its new lists. */
function placePasted(slice: Slice, reading: Reading, context: FragmentContext | null): Slice {
  const styles = context?.styles ?? [];
  const taken = new Set(Object.keys(context?.lists ?? {}));
  const ids = new Map<string, string>();
  const content = mapParagraphs(slice.content, (node) => {
    const { style, list } = node.attrs as { style: string | null; list: ListPlace | null };
    const heading = style?.startsWith(PASTE_HEADING_PREFIX)
      ? (Styles.idOfRole(
          styles,
          `heading${style.slice(PASTE_HEADING_PREFIX.length)}` as StyleRole,
        ) ?? null)
      : style;
    let place = list;
    if (list?.id.startsWith(PASTE_LIST_PREFIX)) {
      const key = list.id.slice(PASTE_LIST_PREFIX.length);
      let id = ids.get(key);
      if (!id) {
        id = ListDefinition.newId(taken);
        taken.add(id);
        ids.set(key, id);
        const levels = reading.pasted?.get(key);
        reading.lists[id] = levels ? pastedDefinition(levels) : ListDefinition.of('bullet');
      }
      place = { ...list, id };
    }
    return heading === style && place === list
      ? node
      : node.type.create({ ...node.attrs, style: heading, list: place }, node.content, node.marks);
  });
  return new Slice(content, slice.openStart, slice.openEnd);
}

const countParagraphs = (slice: Slice) => {
  let n = 0;
  slice.content.descendants((node) => {
    if (node.type.name === 'paragraph') n += 1;
    return node.type.name !== 'paragraph';
  });
  return n;
};

export function clipboardPlugin({
  read,
  lists,
  onLeftOut,
  markdown = () => false,
  notes,
}: ClipboardOptions): Plugin {
  let reading: Reading | null = null;
  // The writing copied from, so the copy numbers its footnotes as the document does.
  let editor: EditorView | null = null;
  const contextOrEmpty = () => ({
    ...(read() ?? { styles: [], defaults: { paragraph: {}, text: {} }, lists: {} }),
    noteNumbers: editor ? noteNumbersOf(editor.state.doc) : new Map<string, number>(),
  });

  // A paste's new lists are written first, on the paste's own undo step.
  const begin = (view: EditorView) => {
    startUndoStep(view);
    for (const [id, list] of Object.entries(reading?.lists ?? {})) lists.set(id, list);
  };

  const copyOut = (view: EditorView, event: ClipboardEvent, cut: boolean): boolean => {
    const data = event.clipboardData;
    if (!data || view.state.selection.empty) return false;
    const slice = view.state.selection.content();
    const { dom, text } = view.serializeForClipboard(slice);
    const context = read();
    if (context)
      dom.firstElementChild?.setAttribute(
        FRAGMENT_ATTRIBUTE,
        JSON.stringify(
          makeFragment(slice, { ...context, ...(notes ? { readNote: notes.read } : {}) }),
        ),
      );
    event.preventDefault();
    data.clearData();
    data.setData('text/html', dom.innerHTML);
    data.setData('text/plain', text);
    debugLog('[text-document] copy', { cut, paragraphs: countParagraphs(slice) });
    if (cut && view.editable)
      view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'));
    return true;
  };

  return new Plugin({
    view: (view) => {
      editor = view;
      return {
        destroy: () => {
          editor = null;
        },
      };
    },
    props: {
      clipboardSerializer: clipboardSerializer(contextOrEmpty),
      clipboardTextSerializer: (slice, view) =>
        plainTextOf(
          slice,
          selectionMarkers(view.state, lists.read()),
          noteNumbersOf(view.state.doc),
        ),
      clipboardParser: pastedHtmlParser(textDocumentSchema),
      handleDOMEvents: {
        copy: (view, event) => copyOut(view, event, false),
        cut: (view, event) => copyOut(view, event, true),
      },
      transformPastedHTML: (html) => {
        reading = { source: 'Html', lists: {}, left: 0 };
        const context = read();
        if (context && html.includes(FRAGMENT_ATTRIBUTE)) {
          const holder = parseInert(html, 'text/html').querySelector(`[${FRAGMENT_ATTRIBUTE}]`);
          const fragment = readFragment(holder?.getAttribute(FRAGMENT_ATTRIBUTE) ?? '');
          if (fragment.ok) {
            const placed = placeFragment(fragment.fragment, context);
            try {
              const slice = Slice.fromJSON(
                textDocumentSchema,
                placed.slice as Parameters<typeof Slice.fromJSON>[1],
              );
              reading = {
                source: 'Document',
                slice,
                lists: { ...placed.lists },
                left: placed.left,
                notes: placed.notes,
              };
              // Nothing more to parse: the fragment is the paste.
              return '';
            } catch (error) {
              debugLog('[text-document] paste fragment refused', {
                reason: 'schema',
                error: String(error),
              });
            }
          } else debugLog('[text-document] paste fragment refused', { reason: fragment.reason });
        }
        const normalised = normalisePastedHtml(html);
        reading.pasted = normalised.lists;
        if (normalised.pictures > 0)
          debugLog('[text-document] paste left out', { pictures: normalised.pictures });
        return normalised.html;
      },
      clipboardTextParser: (text, $context, plain) => {
        // Markdown, when the person reads it so; never for Paste without formatting.
        if (!plain && markdown() && looksLikeMarkdown(text)) {
          const parsed = markdownSlice(text, textDocumentSchema);
          reading = { source: 'Markdown', pasted: parsed.lists, lists: {}, left: 0 };
          return parsed.slice;
        }
        reading = { source: 'Plain', lists: {}, left: 0 };
        return plainTextSlice(text, $context);
      },
      transformPasted: (slice) => {
        const pasted = (): Slice => {
          if (!reading) return slice;
          if (reading.slice) return reading.slice;
          return reading.source === 'Html' || reading.source === 'Markdown'
            ? placePasted(slice, reading, read())
            : slice;
        };
        // Each footnote's mark pasted or dropped names a note of its own.
        return notes ? notes.place(pasted(), reading?.notes ?? {}) : pasted();
      },
      handlePaste: (view, _event, slice) => {
        if (!reading) return false;
        const { source, left } = reading;
        begin(view);
        debugLog('[text-document] paste', {
          source,
          paragraphs: countParagraphs(slice),
          lists: Object.keys(reading.lists).length,
          left,
        });
        track('Element', 'Changed', `TextDocumentPaste${source}`);
        reading = null;
        // As ProseMirror pastes: one node replaces the selection whole, else the slice fits around it.
        const single =
          slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1
            ? slice.content.firstChild
            : null;
        const tr: Transaction = view.state.tr;
        // Over several stretches, the paste goes to the last alone (text-and-paragraphs.md "Selection").
        if (tr.selection instanceof StretchSelection) tr.setSelection(lastStretch(tr.selection));
        // Pasted over a paragraph's whole text (or into an empty one), the first paragraph pasted keeps its own style,
        // as Google's paste does; into part of one, the paste joins it.
        const { $from, $to } = tr.selection;
        const first = slice.content.firstChild;
        if (
          first?.type.name === 'paragraph' &&
          $from.parent.type.name === 'paragraph' &&
          $from.parentOffset === 0 &&
          $to.parentOffset === $to.parent.content.size
        )
          tr.setNodeMarkup($from.before(), undefined, first.attrs);
        if (single) tr.replaceSelectionWith(single, source === 'Plain');
        else tr.replaceSelection(slice);
        view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'));
        startUndoStep(view);
        if (left > 0) onLeftOut(left);
        return true;
      },
      handleDrop: (view, _event, _slice, moved) => {
        if (!moved && reading) {
          begin(view);
          if (reading.left > 0) onLeftOut(reading.left);
        }
        reading = null;
        return false;
      },
    },
  });
}

/** Text the browser holds, for the Edit menu: its HTML when it has some, else its plain text. */
async function readClipboard(plain: boolean): Promise<{ html: string | null; text: string }> {
  if (plain) return { html: null, text: await navigator.clipboard.readText() };
  const items = await navigator.clipboard.read();
  for (const item of items)
    if (item.types.includes('text/html'))
      return { html: await (await item.getType('text/html')).text(), text: '' };
  for (const item of items)
    if (item.types.includes('text/plain'))
      return { html: null, text: await (await item.getType('text/plain')).text() };
  return { html: null, text: '' };
}

/**
 * Text pasted from the Edit menu as the keys paste it, so Markdown is read as it would be (ProseMirror's pasteText is
 * always without formatting); where the browser cannot make the event, as plain text.
 */
function pasteTextAsKeys(view: EditorView, text: string): void {
  if (typeof DataTransfer === 'undefined') {
    view.pasteText(text);
    return;
  }
  const data = new DataTransfer();
  data.setData('text/plain', text);
  view.dom.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  );
}

/** Edit > Cut, Copy, Paste and Paste without formatting; `onRefused` when the browser keeps the clipboard. */
export function clipboardActions(
  view: EditorView | null,
  { canEdit, onRefused }: { canEdit: boolean; onRefused: () => void },
): OfficeActions {
  const refused = (action: string, error?: unknown) => {
    debugLog('[text-document] clipboard refused', {
      action,
      error:
        error instanceof Error
          ? error.message
          : error === undefined
            ? undefined
            : JSON.stringify(error),
    });
    onRefused();
  };
  const command = (action: 'copy' | 'cut') => () => {
    if (!view) return;
    view.focus();
    if (!view.dom.ownerDocument.execCommand(action)) refused(action);
  };
  const paste = (plain: boolean) => () => {
    if (!view) return;
    const action = plain ? 'paste-without-formatting' : 'paste';
    if (!navigator.clipboard) return refused(action);
    readClipboard(plain).then(
      ({ html, text }) => {
        if (view.isDestroyed) return;
        view.focus();
        if (html) view.pasteHTML(html);
        else if (text && plain) view.pasteText(text);
        else if (text) pasteTextAsKeys(view, text);
      },
      (error: unknown) => refused(action, error),
    );
  };
  // Read as the menu draws, so they follow the selection.
  const nothingSelected = () => !view || view.state.selection.empty;
  return {
    copy: {
      run: command('copy'),
      get disabled() {
        return nothingSelected();
      },
    },
    ...(canEdit
      ? {
          cut: {
            run: command('cut'),
            get disabled() {
              return nothingSelected();
            },
          },
          paste: { run: paste(false) },
          'paste-without-formatting': { run: paste(true) },
        }
      : {}),
  };
}
