import {
  contextOf,
  eventStormingNote,
  rewordRipple,
  type Element,
  type ElementId,
  type EsNoteChange,
  type StickyElement,
} from '@livedoc/document';

// What a suggested note change says of itself (docs/specs/021-event-storming/suggested-changes.md "How a person sees
// and decides"): what changes, how far a reword reaches, the agent's reason and who suggested it. The words the
// change mark's caption, its label and the panel's row all read. Pure.

export type ChangeCaption = {
  // The act, and what it acts on or leaves: "Reword" and the new words, "Change kind" and the kind.
  title: string;
  what: string;
  // How far a reword that names a term reaches, in its context's scope; null when it reaches no further.
  ripple: string | null;
  // Notes beyond the context hold the term: Everywhere is offered.
  everywhere: boolean;
  reason?: string;
  by?: string;
};

const quoted = (words: string) => `“${words}”`;
const notes = (n: number) => `${n} note${n === 1 ? '' : 's'}`;

const TITLE: Readonly<Record<EsNoteChange['change'], string>> = {
  reword: 'Reword',
  kind: 'Change kind',
  split: 'Split',
  remove: 'Remove',
};

function whatOf(note: Pick<StickyElement, 'label'>, change: EsNoteChange): string {
  switch (change.change) {
    case 'reword':
      return quoted(change.words);
    case 'kind':
      return eventStormingNote(change.kind).label;
    case 'split':
      return change.parts.map(quoted).join(' · ');
    case 'remove':
      return quoted(note.label ?? '');
  }
}

/** A change in two words' worth: the act ("Reword") and what it acts on or leaves (the new words, the kind). */
export function changeWords(
  note: Pick<StickyElement, 'label'>,
  change: EsNoteChange,
): { title: string; what: string } {
  return { title: TITLE[change.change], what: whatOf(note, change) };
}

/** A change in one line, as a label reads it: "Reword “Pack parcel”". */
export function changeSummary(note: Pick<StickyElement, 'label'>, change: EsNoteChange): string {
  const { title, what } = changeWords(note, change);
  return `${title} ${what}`;
}

// How far a reword reaches from its note: its own context first, then how many more notes hold the term.
function rippleOf(
  elements: readonly Element[],
  noteId: ElementId,
  change: EsNoteChange,
): { ripple: string | null; everywhere: boolean } {
  if (change.change !== 'reword') return { ripple: null, everywhere: false };
  const { notes: rippled, contexts, beyond } = rewordRipple(elements, noteId, change, 'context');
  const context = contextOf(elements, noteId);
  const renamed = contexts.length > 0;
  let within: string | null = null;
  if (rippled.length > 0)
    within = context
      ? `Also rewords ${notes(rippled.length)} in ${context.label}${renamed ? ' and its name' : ''}`
      : `Also rewords ${notes(rippled.length)} outside any context`;
  else if (renamed) within = `Also renames ${context!.label}`;
  let further: string | null = null;
  if (beyond > 0)
    further = within
      ? `${beyond} more on the board`
      : `${beyond} more ${beyond === 1 ? 'note' : 'notes'} on the board ${beyond === 1 ? 'holds' : 'hold'} ${quoted(change.term!)}`;
  const parts = [within, further].filter((part) => part !== null);
  return { ripple: parts.length > 0 ? parts.join(' · ') : null, everywhere: beyond > 0 };
}

/** The caption of one suggested change of a note, from the board as it stands. */
export function changeCaption(
  elements: readonly Element[],
  noteId: ElementId,
  change: EsNoteChange,
): ChangeCaption {
  const note = elements.find((el) => el.id === noteId);
  return {
    ...changeWords({ label: note?.type === 'sticky' ? note.label : undefined }, change),
    ...rippleOf(elements, noteId, change),
    ...(change.reason ? { reason: change.reason } : {}),
    ...(change.by ? { by: change.by } : {}),
  };
}
