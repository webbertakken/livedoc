// The suggest lines a topic is answered with (docs/specs/021-event-storming/asks.md "The built-in hand": "the same
// lines `livedoc storm suggest` takes"), written out for a model that has no guide to read. An agent with the CLI or
// the MCP reads the guides instead. Pure.

import { EVENT_STORMING_NOTES } from '@livedoc/document';
import type { StormAskTopic } from './catalogue';

const KINDS = EVENT_STORMING_NOTES.map((note) => note.kind).join(', ');
const REFS = 'Name notes and contexts by the refs the reading prints for them.';
const NAME = `suggest-name "<name>" <context>… reason="<why>"`;

export const ASK_LINES: Record<StormAskTopic, string> = {
  gaps: `One line per note:
suggest <kind> "<words>" before|after|above|below=<note> reason="<why>" [gap=<code>]
Kinds: ${KINDS}.
before and after are along the note's lane (time runs left to right); above and below are the next lane.
gap is the code of the reading's gap the note fills, when it fills one.
${REFS}`,
  contexts: `One line per context:
suggest-context "<name>" <note>… reason="<why>"
${REFS}`,
  names: `One line per name:
${NAME}
${REFS}`,
  merge: `One line per name, naming every context of the merge:
${NAME}
${REFS}`,
  wording: `One line per change:
suggest-reword <note> "<words>" [term="<old word>" to="<new word>"] reason="<why>"
suggest-kind <note> <kind> reason="<why>"
suggest-split <note> "<words>" "<words>"… reason="<why>"
suggest-remove <note> reason="<why>"
Kinds: ${KINDS}.
Name the one word a reword changes (term, to), so its context can follow. A split makes two to four notes.
${REFS}`,
  lanes: `One line per lane, top to bottom; together they are one plan:
suggest-lane "<name>" [lanes=<n>,…] [kind=<kind>,…] [context=<context>,…] [<note>…] reason="<why>"
A line says what its lane holds: the notes now on a lane by its number, every note of a kind, every note of a
context, or notes by ref. The most specific line takes a note. Every workshop note must end on a lane.
${REFS}`,
};
