// The typing aids in the writing (docs/specs/034-text-documents/text-and-paragraphs.md "Typing aids"): what a person
// types goes in first, then each aid's change follows as an undo step of its own, so ⌘Z takes the aid back and leaves
// the typing. Aids act only on typing: a paste, a drop, an agent's or a collaborator's change never reaches them.
import type { Mark, Node as PmNode } from 'prosemirror-model';
import { Plugin, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  ListDefinition,
  Styles,
  type ListLevel,
  type ListPlace,
  type Style,
  type StyleRole,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { ListsAccess } from './text-document-lists';
import { TypingAids } from './text-document-typing-aids';
import {
  capitalFor,
  lastWord,
  linkFor,
  listMarkerFor,
  markdownHeadingFor,
  markdownSpanFor,
  smartQuote,
  substitutionFor,
  WORD_ENDS,
  type ListMarker,
} from './text-document-typing-aid-rules';
import { startUndoStep } from './text-document-undo';

/** A stand-in for each atom in the paragraph's text, so text offsets are positions. */
const ATOM = '\ufffc';

/** The paragraph's text before `pos`, and where the paragraph's text starts. */
function textBefore(state: EditorState, pos: number): { before: string; start: number } | null {
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.isTextblock) return null;
  const start = $pos.start();
  return { before: state.doc.textBetween(start, pos, undefined, ATOM), start };
}

const marksAt = (doc: PmNode, pos: number): readonly Mark[] => doc.nodeAt(pos)?.marks ?? [];

/** The word aids (substitution, link, capital) on the word ending at `pos`, as one transaction; none when none acts. */
function wordAids(state: EditorState, pos: number, aids: TypingAids): Transaction | null {
  const read = textBefore(state, pos);
  if (!read) return null;
  const tr = state.tr;
  let { before } = read;
  const { start } = read;
  const acted: string[] = [];
  const pair = substitutionFor(lastWord(before).word, TypingAids.active(aids));
  if (pair) {
    const from = start + lastWord(before).start;
    tr.replaceWith(
      from,
      from + pair.replace.length,
      state.schema.text(pair.with, marksAt(state.doc, from)),
    );
    before = before.slice(0, before.length - pair.replace.length) + pair.with;
    acted.push('substitution');
  }
  if (aids.links) {
    const { word, start: at } = lastWord(before);
    const link = linkFor(word);
    const from = start + at;
    const linkType = state.schema.marks.link!;
    if (link && !tr.doc.rangeHasMark(from, from + link.length, linkType)) {
      tr.addMark(from, from + link.length, linkType.create({ href: link.href }));
      acted.push('link');
    }
  }
  if (aids.capitalise) {
    const capital = capitalFor(before);
    if (capital) {
      const at = start + capital.at;
      tr.replaceWith(at, at + 1, state.schema.text(capital.letter, marksAt(tr.doc, at)));
      acted.push('capital');
    }
  }
  if (acted.length === 0) return null;
  debugLog('[text-document] typing aid', { aids: acted });
  return tr;
}

/** Automatically detect lists: the paragraph made a list of the marker's kind, the marker and its space gone. */
function listAid(
  state: EditorState,
  pos: number,
  marker: ListMarker,
  lists: ListsAccess,
): Transaction | null {
  const $pos = state.doc.resolve(pos);
  const paragraph = $pos.parent;
  if ((paragraph.attrs as { list: ListPlace | null }).list) return null;
  const id = ListDefinition.newId(Object.keys(lists.read()));
  const base = ListDefinition.of(marker.kind);
  const levels = base.levels.map((level, i): ListLevel =>
    i === 0 && level.kind === 'number' && marker.kind === 'number'
      ? { ...level, format: marker.format }
      : level,
  );
  lists.set(id, { ...base, levels });
  const start = $pos.start();
  const place: ListPlace = {
    id,
    level: 0,
    ...(marker.kind === 'number' && marker.start !== 1 ? { restart: marker.start } : {}),
  };
  debugLog('[text-document] typing aid', { aids: ['list'] });
  return state.tr
    .delete(start, pos)
    .setNodeMarkup($pos.before(), undefined, { ...paragraph.attrs, list: place });
}

/** Applies an aid's transaction as an undo step of its own. */
function asOwnStep(view: EditorView, tr: Transaction | null): void {
  if (!tr) return;
  startUndoStep(view);
  view.dispatch(tr.scrollIntoView());
  startUndoStep(view);
}

/** Enable Markdown: `#` to `######` and a space make the paragraph that heading, the marker gone. */
function headingAid(state: EditorState, pos: number, level: number, styles: readonly Style[]) {
  const id = Styles.idOfRole(styles, `heading${level}` as StyleRole);
  if (!id) return null;
  const $pos = state.doc.resolve(pos);
  debugLog('[text-document] typing aid', { aids: ['markdown-heading'] });
  return state.tr
    .delete($pos.start(), pos)
    .setNodeMarkup($pos.before(), undefined, { ...$pos.parent.attrs, style: id });
}

/** Enable Markdown: a span the typing just closed, formatted, its delimiters gone. */
function spanAid(state: EditorState, pos: number): Transaction | null {
  const read = textBefore(state, pos);
  const span = read ? markdownSpanFor(read.before) : undefined;
  if (!read || !span) return null;
  const at = (offset: number) => read.start + offset;
  const { schema } = state;
  const mark =
    'link' in span.makes
      ? schema.marks.link!.create({ href: span.makes.link })
      : schema.marks[span.makes.mark]!.create({ value: true });
  debugLog('[text-document] typing aid', { aids: ['markdown-span'] });
  return (
    state.tr
      .delete(at(span.innerEnd), pos)
      .addMark(at(span.innerStart), at(span.innerEnd), mark)
      .delete(at(span.start), at(span.innerStart))
      // What is typed next is outside the span, as the closing delimiter left it.
      .removeStoredMark(mark)
  );
}

/** The characters that may close a Markdown span. */
const SPAN_ENDS = new Set(['*', '_', '~', ')']);

export function typingAidsPlugin({
  read,
  lists,
  readStyles = () => [],
}: {
  /** The person's typing aids, read as each character is typed. */
  read: () => TypingAids;
  lists: ListsAccess;
  /** The document's paragraph styles, for the heading Markdown makes. */
  readStyles?: () => readonly Style[];
}): Plugin {
  return new Plugin({
    props: {
      handleTextInput: (view, from, to, text) => {
        // One character typed: a replacement the browser or an input method made is left alone.
        if (text.length !== 1) return false;
        const aids = read();
        const quote = (text === '"' || text === "'") && aids.smartQuotes;
        const ends = WORD_ENDS.has(text);
        const span = aids.markdown && SPAN_ENDS.has(text);
        if (!quote && !ends && !span) return false;
        const read0 = textBefore(view.state, from);
        if (!read0) return false;
        // What was typed goes in first, as typing, the caret after it: the editor's selection may not yet know where the
        // browser's caret moved (it learns on the next selectionchange).
        const typed = view.state.tr.insertText(text, from, to);
        view.dispatch(typed.setSelection(TextSelection.create(typed.doc, from + text.length)));
        const at = from + 1;
        if (quote) {
          const curly = smartQuote(read0.before, text);
          const tr = view.state.tr.replaceWith(
            from,
            at,
            view.state.schema.text(curly, marksAt(view.state.doc, from)),
          );
          asOwnStep(view, tr);
          return true;
        }
        if (span) {
          asOwnStep(view, spanAid(view.state, at));
          return true;
        }
        const heading =
          text === ' ' && aids.markdown ? markdownHeadingFor(read0.before) : undefined;
        if (heading !== undefined) {
          asOwnStep(view, headingAid(view.state, at, heading, readStyles()));
          return true;
        }
        const marker = text === ' ' && aids.lists ? listMarkerFor(read0.before) : undefined;
        if (marker && read0.before.length === marker.length)
          asOwnStep(view, listAid(view.state, at, marker, lists));
        else asOwnStep(view, wordAids(view.state, from, aids));
        return true;
      },
      // Enter ends a word too: its aids act before the paragraph splits.
      handleKeyDown: (view, event) => {
        if (
          event.key !== 'Enter' ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return false;
        if (!view.state.selection.empty) return false;
        asOwnStep(view, wordAids(view.state, view.state.selection.from, read()));
        return false;
      },
    },
  });
}
