// A suggestion's marks in the editor's schema (docs/specs/034-text-documents/review.md "How a suggestion is kept"): an
// insertion, a deletion and a format change, each holding the live state's mark whole, so binding a state that holds
// them drops nothing. Never inclusive: typing at a suggestion's edge never stretches it. An insertion is underlined and
// a deletion struck through in its author's colour.
import type { Mark, MarkSpec } from 'prosemirror-model';
import { DELETION_MARK, FORMAT_CHANGE_MARK, INSERTION_MARK } from '@livedoc/text-documents';
import { paperInk } from './text-document-paper';

const HEX = /^#[0-9a-f]{6}$/i;

/** The author's colour drawn for the page's paper; none for a colour that is not one. */
function authorInk(mark: Mark): string | undefined {
  const colour = (mark.attrs as { author?: { colour?: unknown } }).author?.colour;
  return typeof colour === 'string' && HEX.test(colour) ? paperInk(colour) : undefined;
}

function suggestionMark(className: string, line: string | null, extra: string[] = []): MarkSpec {
  return {
    attrs: Object.fromEntries(['id', 'at', 'author', ...extra].map((name) => [name, {}])),
    inclusive: false,
    toDOM: (mark) => {
      const ink = authorInk(mark);
      const style = [ink && `color: ${ink}`, line && `text-decoration-line: ${line}`]
        .filter(Boolean)
        .join('; ');
      const id = (mark.attrs as { id?: unknown }).id;
      return [
        'span',
        { class: className, 'data-suggestion': typeof id === 'string' ? id : '', style },
        0,
      ];
    },
  };
}

export const SUGGESTION_MARK_SPECS: Record<string, MarkSpec> = {
  [INSERTION_MARK]: suggestionMark('text-document-insertion', 'underline'),
  [DELETION_MARK]: suggestionMark('text-document-deletion', 'line-through'),
  [FORMAT_CHANGE_MARK]: suggestionMark('text-document-format-change', null, ['before']),
};
