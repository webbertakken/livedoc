// Where a changeset's operation lands (docs/specs/034-text-documents/agents-and-sync.md "The grammar"): a document tab's
// paragraphs numbered as the views number them (`ParagraphRefs`: reading order, a table's row by row), and a quoted
// text's one occurrence, exact and within one run of text.
import * as Y from 'yjs';
import { paragraphElementsOf } from '../live/live-tables';
import { ParagraphRefs } from '../model/paragraph-refs';
import type { TextOpRejection, TextTarget } from './text-ops';

/** An occurrence: the paragraph's number, its element, and where in which run of text. */
export type TextPlace = {
  readonly n: number;
  readonly paragraph: Y.XmlElement;
  readonly run: Y.XmlText;
  readonly offset: number;
};

/** An object between words in a run of text, as one character no text holds. */
const OBJECT = '\uFFFC';

/** A run's text, an embedded object as one character, so offsets are the run's own. */
export function runText(run: Y.XmlText): string {
  return (run.toDelta() as { insert?: unknown }[])
    .map((op) => (typeof op.insert === 'string' ? op.insert : OBJECT))
    .join('');
}

const runsOf = (paragraph: Y.XmlElement): Y.XmlText[] =>
  paragraph.toArray().filter((node): node is Y.XmlText => node instanceof Y.XmlText);

/** Every start of `needle` in `text`, overlapping ones too. */
function startsOf(text: string, needle: string): number[] {
  const starts: number[] = [];
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) starts.push(at);
  return starts;
}

type Refused = { refused: Omit<TextOpRejection, 'line' | 'operation'> };

/** A document tab's paragraphs, numbered from 1. */
export class TabParagraphs {
  readonly fragment: Y.XmlFragment;
  readonly list: readonly Y.XmlElement[];

  private constructor(fragment: Y.XmlFragment, list: readonly Y.XmlElement[]) {
    this.fragment = fragment;
    this.list = list;
  }

  static of(fragment: Y.XmlFragment): TabParagraphs {
    return new TabParagraphs(fragment, paragraphElementsOf(fragment));
  }

  /** Every occurrence of `text` within one run of text, paragraph by paragraph. */
  occurrences(text: string): TextPlace[] {
    return this.list.flatMap((paragraph, i) =>
      runsOf(paragraph).flatMap((run) =>
        startsOf(runText(run), text).map((offset) => ({ n: i + 1, paragraph, run, offset })),
      ),
    );
  }

  /** The one occurrence of `text`, or why there is none. */
  find(text: string): TextPlace | Refused {
    const found = this.occurrences(text);
    if (found.length === 1) return found[0]!;
    if (found.length === 0)
      return {
        refused: {
          error: 'text_not_found',
          message: `${JSON.stringify(text)} is not in the document tab as written (case and all, within one paragraph)`,
        },
      };
    const paragraphs = [...new Set(found.map((f) => f.n))];
    return {
      refused: {
        error: 'text_ambiguous',
        message: `${JSON.stringify(text)} occurs ${found.length} times: in ${paragraphs.map(ParagraphRefs.text).join(', ')}; quote more of it`,
        paragraphs,
      },
    };
  }

  /** The paragraph a target names, with its number, or why there is none. */
  paragraph(target: TextTarget): { n: number; paragraph: Y.XmlElement } | Refused {
    if (target.kind === 'text') {
      const found = this.find(target.text);
      return 'refused' in found ? found : { n: found.n, paragraph: found.paragraph };
    }
    const paragraph = this.list[target.n - 1];
    if (paragraph) return { n: target.n, paragraph };
    const held =
      this.list.length === 0
        ? 'it holds no paragraphs'
        : `it holds ${ParagraphRefs.text(1)}..${ParagraphRefs.text(this.list.length)}`;
    return {
      refused: {
        error: 'ref_not_found',
        message: `${ParagraphRefs.text(target.n)} is past the document tab: ${held}`,
      },
    };
  }
}
