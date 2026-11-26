// The model's suggestions as the live state's marks and back (docs/specs/034-text-documents/review.md "How a suggestion
// is kept"): a run's insertion, deletion and format change as its text's formatting attributes, an object's insertion
// and deletion as its attributes, a paragraph's break, join and paragraph format as its own, a whole block's insertion
// and deletion as its own. A file's author has no key
// and reads "From the file" in the neutral colour, as a file's comment's.
import type {
  BlockSuggested,
  FileSuggestionMark,
  InlineSuggested,
  ParagraphSuggested,
} from '../model/suggestions';
import type { TextProps } from '../model/props';
import type { Paragraph } from '../model/blocks';
import {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  PARAGRAPH_FORMAT_CHANGE,
  TEXT_PROPERTY_MARK_OF,
  TEXT_STYLE_MARK,
} from './live-names';
import { isSuggestionMark, type SuggestionMark } from './live-suggestions';
import { FILE_AUTHOR_COLOUR } from './live-thread-files';

type Attributes = Record<string, unknown>;

const PROPERTY_OF_MARK = new Map<string, keyof TextProps>(
  (Object.entries(TEXT_PROPERTY_MARK_OF) as [keyof TextProps, string][]).map(([p, m]) => [m, p]),
);
const FORMATTING_MARKS = [...PROPERTY_OF_MARK.keys(), TEXT_STYLE_MARK];

/** A model mark as the live state's: a file's author keyless, in the neutral colour, from the file. */
export function liveMarkOf(mark: FileSuggestionMark): SuggestionMark {
  const { name, initials, key, colour } = mark.author;
  return {
    id: mark.id,
    at: mark.at ?? 0,
    author:
      key === undefined
        ? { name, colour: FILE_AUTHOR_COLOUR, fromFile: true, ...(initials ? { initials } : {}) }
        : { key, name, colour: colour ?? FILE_AUTHOR_COLOUR, ...(initials ? { initials } : {}) },
  };
}

/** A live mark as the model's; undefined for what does not read as a mark. */
export function fileMarkOf(value: unknown): FileSuggestionMark | undefined {
  if (!isSuggestionMark(value)) return undefined;
  const { key, name, colour, initials } = value.author;
  return {
    id: value.id,
    ...(value.at === 0 ? {} : { at: value.at }),
    author: {
      name,
      ...(initials ? { initials } : {}),
      ...(key === undefined ? {} : { key, ...(colour ? { colour } : {}) }),
    },
  };
}

/** Text formatting as the live attributes of its properties and style. */
function formatting(style: string | undefined, props: TextProps): Attributes {
  const out: Attributes = {};
  for (const [key, value] of Object.entries(props) as [keyof TextProps, unknown][])
    if (value !== undefined) out[TEXT_PROPERTY_MARK_OF[key]] = { value };
  if (style !== undefined) out[TEXT_STYLE_MARK] = { id: style };
  return out;
}

/** An inline's suggestions as live attributes; a run's format change with each changed mark's value before. */
export function inlineSuggestionAttributes(inline: {
  style?: string;
  props: TextProps;
  suggested?: InlineSuggested;
}): Attributes {
  const { insertion, deletion, format } = inline.suggested ?? {};
  const out: Attributes = {};
  if (insertion) out[INSERTION_MARK] = liveMarkOf(insertion);
  if (deletion) out[DELETION_MARK] = liveMarkOf(deletion);
  if (format) {
    const now = formatting(inline.style, inline.props);
    const was = formatting(format.before.style, format.before.props);
    const before: Attributes = {};
    for (const name of FORMATTING_MARKS)
      if (JSON.stringify(now[name]) !== JSON.stringify(was[name])) before[name] = was[name] ?? null;
    out[FORMAT_CHANGE_MARK] = { ...liveMarkOf(format), before };
  }
  return out;
}

/** A run's or object's suggestions from its live attributes; a run's format change's formatting before. */
export function readInlineSuggested(attributes: Attributes): InlineSuggested | undefined {
  const insertion = fileMarkOf(attributes[INSERTION_MARK]);
  const deletion = fileMarkOf(attributes[DELETION_MARK]);
  const change = attributes[FORMAT_CHANGE_MARK];
  const formatMark = fileMarkOf(change);
  let format: InlineSuggested['format'];
  if (formatMark) {
    const was: Attributes = Object.fromEntries(
      FORMATTING_MARKS.filter((m) => attributes[m] !== undefined).map((m) => [m, attributes[m]]),
    );
    for (const [name, value] of Object.entries((change as { before?: Attributes }).before ?? {}))
      if (value === null) delete was[name];
      else was[name] = value;
    const props: TextProps = {};
    for (const [mark, value] of Object.entries(was)) {
      const property = PROPERTY_OF_MARK.get(mark);
      if (property)
        (props as Record<string, unknown>)[property] = (value as { value: unknown }).value;
    }
    const style = (was[TEXT_STYLE_MARK] as { id?: string } | undefined)?.id;
    format = { ...formatMark, before: { ...(style ? { style } : {}), props } };
  }
  const out = {
    ...(insertion ? { insertion } : {}),
    ...(deletion ? { deletion } : {}),
    ...(format ? { format } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A paragraph's suggestions as its live attributes. */
export function paragraphSuggestionAttributes(paragraph: Paragraph): Attributes {
  const { break: inserted, join, format } = paragraph.suggested ?? {};
  return {
    [INSERTION_MARK]: inserted && liveMarkOf(inserted),
    [DELETION_MARK]: join && liveMarkOf(join),
    [PARAGRAPH_FORMAT_CHANGE]: format && {
      ...liveMarkOf(format),
      before: {
        style: format.before.style,
        props: format.before.props,
        list: format.before.list ?? null,
      },
    },
  };
}

/** A paragraph's suggestions from its live attributes; a paragraph format's before as the model holds it. */
export function readParagraphSuggested(
  attributes: Attributes,
  normal: string,
): ParagraphSuggested | undefined {
  const inserted = fileMarkOf(attributes[INSERTION_MARK]);
  const join = fileMarkOf(attributes[DELETION_MARK]);
  const change = attributes[PARAGRAPH_FORMAT_CHANGE];
  const formatMark = fileMarkOf(change);
  const before = (change as { before?: Attributes } | undefined)?.before ?? {};
  const format = formatMark && {
    ...formatMark,
    before: {
      style: typeof before.style === 'string' ? before.style : normal,
      props: (before.props ?? {}) as Paragraph['props'],
      ...(before.list ? { list: before.list as NonNullable<Paragraph['list']> } : {}),
    },
  };
  const out = {
    ...(inserted ? { break: inserted } : {}),
    ...(join ? { join } : {}),
    ...(format ? { format } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A whole block's suggestion as its live attributes: its insertion and its deletion. */
export function blockSuggestionAttributes(suggested: BlockSuggested | undefined): Attributes {
  return {
    [INSERTION_MARK]: suggested?.insertion && liveMarkOf(suggested.insertion),
    [DELETION_MARK]: suggested?.deletion && liveMarkOf(suggested.deletion),
  };
}

/** A whole block's suggestion from its live attributes; undefined for none. */
export function readBlockSuggested(attributes: Attributes): BlockSuggested | undefined {
  const insertion = fileMarkOf(attributes[INSERTION_MARK]);
  const deletion = fileMarkOf(attributes[DELETION_MARK]);
  if (!insertion && !deletion) return undefined;
  return { ...(insertion ? { insertion } : {}), ...(deletion ? { deletion } : {}) };
}
