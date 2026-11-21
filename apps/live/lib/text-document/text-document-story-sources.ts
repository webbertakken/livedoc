// A header's or footer's writing laid out once for every page that draws it (docs/specs/034-text-documents/
// page-layout.md "Headers and footers"): a read-only editor bound to the story's fragment in the live state, in a
// hidden place at the width it is drawn at, so its paragraph styles, lists and tab stops lay out as the body's. Each
// page draws a copy of it, painted again when it changes; its height tells the layout how far it pushes the body. To
// edit it ("Editing headers and footers") the source itself moves into the page's editing box and takes edits there.
import { EditorState, Plugin, Selection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { storyFragment, TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { documentTextStyle } from '@/lib/document-fonts/document-text-style';
import type { TextFormatting } from './text-document-formatting';
import { listMarkersPlugin } from './text-document-list-markers';
import { subscribeLists } from './text-document-live-lists';
import { paragraphBoxesPlugin } from './text-document-paragraph-boxes';
import { textDocumentSchema } from './text-document-schema';
import { FIELD_NODE_VIEWS, fieldNumbersPlugin } from './text-document-fields';
import { tabStopsPlugin } from './text-document-tab-layout';

/** A drawn story's class, on its source and every copy. */
export const STORY_CLASS = 'text-document-story';

export type StorySourceInput = {
  readonly doc: Y.Doc;
  readonly format: TextDocumentFormat;
  readonly story: string;
  /** Its key: the story at its width (`storyKey`). */
  readonly key: string;
  /** The text width it is laid out at, in CSS pixels. */
  readonly width: number;
  /** Where the hidden source lies: inside the pages, so it takes their type and zoom. */
  readonly container: HTMLElement;
  readonly readFormatting: () => TextFormatting;
  /** The body's style sheet scope, so the story's paragraphs take the document's styles. */
  readonly stylesScope: string | null;
  /** Its height or emptiness changed. */
  readonly onLaid: (source: StorySource) => void;
  /** What it takes edits with, while it is edited: keys, undo, the caret's changes. */
  readonly plugins?: readonly Plugin[];
  /** What a screen reader calls it while it is edited: "Header" or "Footer". */
  readonly label: string;
  /** Drawn even when it holds nothing: a footnote, whose empty line carries its number (page-layout.md "Footnotes"). */
  readonly drawsEmpty?: boolean;
};

/** Draws nothing: one paragraph with no content, or none. */
const isEmpty = (state: EditorState): boolean =>
  state.doc.childCount === 0 ||
  (state.doc.childCount === 1 &&
    state.doc.firstChild!.type.name === 'paragraph' &&
    state.doc.firstChild!.content.size === 0);

export class StorySource {
  readonly key: string;
  readonly view: EditorView;
  /** Draws nothing: no copy is drawn and it pushes nothing. */
  empty = true;
  /** Its height in CSS pixels, at its width. */
  height = 0;
  readonly #host: HTMLElement;
  readonly #painters = new Set<() => void>();
  readonly #input: StorySourceInput;
  readonly #resize: ResizeObserver | null;
  #scheduled = false;
  #editing = false;

  constructor(input: StorySourceInput) {
    this.#input = input;
    this.key = input.key;
    const { doc, format } = input;
    this.#host = document.createElement('div');
    this.#host.dataset.storySource = input.key;
    this.#host.style.width = `${input.width}px`;
    input.container.append(this.#host);
    const changed = new Plugin({ view: () => ({ update: () => this.#schedule() }) });
    this.view = new EditorView(this.#host, {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [
          ySyncPlugin(storyFragment(doc, input.story)),
          paragraphBoxesPlugin(input.readFormatting),
          tabStopsPlugin(input.readFormatting),
          listMarkersPlugin(
            () => TextDocumentState.lists(doc),
            (listener) => subscribeLists(doc, listener),
          ),
          // Its fields show its page's numbers while it is edited (page-layout.md "Page numbers").
          fieldNumbersPlugin(),
          ...(input.plugins ?? []),
          changed,
        ],
      }),
      nodeViews: FIELD_NODE_VIEWS,
      editable: () => this.#editing,
      attributes: () => ({
        class: `${STORY_CLASS} whitespace-pre-wrap break-words outline-none`,
        ...(this.#editing
          ? { role: 'textbox', 'aria-multiline': 'true', 'aria-label': input.label }
          : {}),
        style: documentTextStyle(TextDocumentState.defaults(doc, format).text),
        ...(input.stylesScope ? { 'data-text-document-styles': input.stylesScope } : {}),
      }),
    });
    // Its type loaded, the styles changed: its height may change though its writing did not.
    this.#resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.#measure());
    this.#resize?.observe(this.#host);
    this.#schedule();
  }

  /** A copy of its writing, to draw on a page: never editable, never read, never focused. */
  copy(): HTMLElement {
    const copy = this.view.dom.cloneNode(true) as HTMLElement;
    copy.removeAttribute('contenteditable');
    copy.removeAttribute('translate');
    copy.removeAttribute('tabindex');
    return copy;
  }

  /** Whether it is being edited, in a page's editing box. */
  get editing(): boolean {
    return this.#editing;
  }

  /** Moves into `box` and takes edits there, the caret at its end; already edited, it only moves. */
  edit(box: HTMLElement): void {
    if (box.firstChild !== this.#host) box.replaceChildren(this.#host);
    if (this.#editing) return;
    this.#editing = true;
    this.view.setProps({});
    this.view.dispatch(this.view.state.tr.setSelection(Selection.atEnd(this.view.state.doc)));
    this.view.focus();
    // Into sight below what stands over the pages (the ruler: the pages' scroll padding).
    this.#host.scrollIntoView?.({ block: 'nearest' });
  }

  /** Back to its hidden place, read only. */
  stopEditing(): void {
    if (!this.#editing) return;
    this.#editing = false;
    this.#input.container.append(this.#host);
    this.view.setProps({});
  }

  /** Calls `paint` after each change of its writing; gives back the call that stops it. */
  subscribe(paint: () => void): () => void {
    this.#painters.add(paint);
    return () => this.#painters.delete(paint);
  }

  destroy(): void {
    this.#resize?.disconnect();
    this.#painters.clear();
    this.view.destroy();
    this.#host.remove();
  }

  // After the change and the tab stops it moved, at most once a task.
  #schedule(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      if (this.view.isDestroyed) return;
      for (const paint of this.#painters) paint();
      this.#measure();
    });
  }

  #measure(): void {
    if (this.view.isDestroyed) return;
    const empty = !this.#input.drawsEmpty && isEmpty(this.view.state);
    const height = empty ? 0 : this.#host.offsetHeight;
    if (empty === this.empty && height === this.height) return;
    this.empty = empty;
    this.height = height;
    debugLog('[text-document] header footer laid', {
      story: this.#input.story,
      width: this.#input.width,
      height,
      empty,
    });
    this.#input.onLaid(this);
  }
}
