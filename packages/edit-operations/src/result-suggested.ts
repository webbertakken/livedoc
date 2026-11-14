// How a result line says what was suggested on an element (docs/specs/021-event-storming/suggested-changes.md): a
// note's `esChanges` and a context's name suggestions print as what was added (`suggested reword "Booking Placed"`)
// or taken back (`took back 2 changes`), never as `(changed)`.

import type { FieldChange } from '@livedoc/api-schema';
import type { ElementId, EsNameSuggestion, EsNoteChange } from '@livedoc/document';
import { sameValue as same } from './equality';

const quoted = (words: string) => JSON.stringify(words);

function changeText(change: EsNoteChange): string {
  switch (change.change) {
    case 'reword':
      return `reword ${quoted(change.words)}`;
    case 'kind':
      return `kind ${change.kind}`;
    case 'split':
      return `split ${change.parts.map(quoted).join(' | ')}`;
    case 'remove':
      return 'remove';
  }
}

const nameText = (name: EsNameSuggestion, refOf: (id: ElementId) => string) =>
  `name ${quoted(name.name)}${name.with ? ` with ${name.with.map(refOf).join(', ')}` : ''}`;

// What was added to a list and how many of what it held went, as the changes of one line.
function listChanges<T>(
  was: readonly T[],
  now: readonly T[],
  say: (item: T) => string,
  word: string,
): FieldChange[] {
  const added = now.filter((item) => !was.some((held) => same(held, item)));
  const gone = was.filter((item) => !now.some((held) => same(held, item))).length;
  return [
    ...(added.length ? [{ key: 'suggested', to: added.map(say).join(', ') }] : []),
    ...(gone ? [{ key: 'took back', to: `${gone} ${word}${gone === 1 ? '' : 's'}` }] : []),
  ];
}

/** A note's suggested changes, before and after: what the line says of them. */
export function noteChangeLines(was: unknown, now: unknown): FieldChange[] {
  const list = (v: unknown) => (Array.isArray(v) ? (v as EsNoteChange[]) : []);
  return listChanges(list(was), list(now), changeText, 'change');
}

type Named = { names?: EsNameSuggestion[] };

/** A context's name suggestions, before and after; `rest` is true when anything else of the context changed. */
export function nameLines(
  was: Named | undefined,
  now: Named | undefined,
  refOf: (id: ElementId) => string,
): { changes: FieldChange[]; rest: boolean } {
  const { names: before = [], ...wasRest } = was ?? {};
  const { names: after = [], ...nowRest } = now ?? {};
  return {
    changes: listChanges(before, after, (name) => nameText(name, refOf), 'name'),
    rest: !same(wasRest, nowRest),
  };
}
