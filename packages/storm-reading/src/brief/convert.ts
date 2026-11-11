// The conversion brief (docs/specs/021-event-storming/domain-export.md "Two halves"): one text, shipped with LiveDoc,
// that tells a model how to turn a board reading into a spec and domain types, and how to change an earlier result
// rather than replace it. Every way of exporting (CLI, MCP, zip) hands out this text, with the language filled in.
//
// Distilled from the domain-driven design and code-pattern literature (Evans, Vernon, Khononov, Wlaschin, Millett and
// Tune, Fowler, Hohpe and Woolf): the wall's grammar already names the building blocks, so the brief maps each note kind
// to one of four function shapes and leaves the judgement (names, boundaries, fields) to the model.

import { LANGUAGE_IDIOMS, type DomainLanguage } from './languages';

// Bumped when the brief changes in a way an earlier export should know about.
export const BRIEF_VERSION = 1;

const BRIEF = `# Convert an Event Storming board into a spec and domain types

You turn the board in \`storm.json\` into two things, in the repository you are working in:
a **spec** of the domain, and the **domain types** in {{language}}.
You change what is already there; you never start over.

## What you are given

- \`storm.json\`: the board reading (schema \`livedoc.storm/1\`). Notes with stable ids, the relations between them,
  the timeline of events, the chains (event, policy, command, event) and the gaps. It is deterministic: trust its
  relations, question its words.
- \`storm.md\`: the same reading as text, for orientation.
- \`CHANGES.md\`: what changed on the board since the last export, by note id. Absent on a first export.
- \`trace.json\`: which spec section and which type each note became last time. Absent on a first export.
- The repository: its existing spec and code. Read both before writing anything.

## The one idea

A board is a set of decisions. Every note kind becomes exactly one of four shapes, and nothing else:

| Note             | Becomes                                                                  | Shape                                       |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| Command (blue)   | an intent: a data type, imperative name, carrying what the issuer knows  | data                                        |
| Domain event     | a fact: a data type, past-tense name, carrying what happened and who     | data                                        |
| Aggregate        | a consistency boundary that decides                                      | \`decide(command, state) -> events or a rejection\`, \`evolve(state, event) -> state\` |
| Policy (lilac)   | a reaction, named for its rule ("whenever X, then Y")                    | \`react(event) -> commands\`                  |
| Read model       | the view an issuer decides with                                          | \`project(view, event) -> view\`              |
| Actor            | who may issue a command: a role, carried on the command's metadata       | data                                        |
| External system  | a port the domain depends on, behind a translator (anticorruption layer) | interface                                   |
| Hotspot          | an open question: it goes into the spec, never into code                 | none                                        |

- A **chain** (event, policy, command, event) is a process. A chain that needs memory of earlier steps, or branches,
  is a process manager: its own aggregate, named in the domain's words, deciding the next command.
- An event no command causes is caused by time or by an external system; say which in the spec, as a question if the
  board does not tell.
- Types are the documentation: write them so a domain expert could read the type names and recognise the wall.

## Grouping: aggregates and contexts

- An aggregate on the board names a boundary; the commands it decides and the events it emits belong to it.
- Where the board has no aggregate, group by the invariant: commands that must see the same consistent state belong to
  one aggregate. Ask "whose job is it to keep these consistent?"; if not the issuer's, they are separate aggregates
  that talk through events.
- Keep aggregates small: a root with values. Reference other aggregates by identity, never by holding them.
- Start with one bounded context per board. Split only where the language splits: one word meaning two things, or a
  pivotal event after which the vocabulary changes. A split is a module boundary, not a service.
- Identify the subdomain: core (where the business competes, give it the richest model), supporting or generic (keep
  it simple; say so in the spec).

## Naming

- The board's words are the ubiquitous language. Keep them, in the board's language and casing, in the spec.
- Code identifiers follow the language's conventions, derived from the words ("Order Placed" becomes \`OrderPlaced\`).
- One term per concept. When two notes name one concept differently, pick one, list the other as a banned synonym,
  and raise it as a question. When one word means two things, that is a context boundary or a question.
- Events are facts in the past tense; commands are intents in the imperative; never \`Updated\`, \`Changed\` or \`Data\`.
- Name errors in the domain's words (\`HoldAllowanceExceeded\`), never \`ValidationError\`.

## Fields

- Notes rarely state data. Give each type the minimum it needs: the aggregate's identity, the issuer, and the data
  the words imply. Use domain knowledge, and say what you assumed.
- Every field the board does not state is a default: mark it \`(default)\` in the spec, so a person confirms it.
- Prefer small value types to primitives: identities, money, quantities, codes. Make illegal states unrepresentable:
  states are a union of named states, never a bag of flags.

## The spec

Write it the way this organisation writes specs:

- Specs live in \`docs/specs/NNN-<context>/\`, a numbered category folder named after the domain concept (the next free
  number; reuse the folder an earlier export made). One file per subject, unnumbered, named by subject.
- The folder has a \`README.md\` that opens "Follow the references below only as needed; never upfront." and indexes its
  files as \`- ./<file>.md - when <trigger>\`. Add the folder to \`docs/specs/README.md\` the same way.
- Present tense, one sentence per line, at most 120 characters a line. A spec says what the domain IS: no task lists,
  no checkboxes, no history.
- Write, per context: the **glossary** (term, meaning, banned synonyms), the **aggregates** (what each decides, its
  invariants, the commands it accepts with who issues them and how each can be refused, the events it emits with
  their data), the **policies** (the rule, the event, the command), the **read models** (who reads them, what for),
  the **external systems** (what crosses the boundary, which way), the **processes** (the chains, in timeline order),
  and the **open questions** (every hotspot and every gap, word for word, with the note it came from).
- Mark every assumption \`(default)\`. Leave a question open rather than invent an answer.

## The types

- Write types and function signatures only: the commands, events, states, value types, rejections, and the
  \`decide\`, \`evolve\`, \`react\` and \`project\` signatures. No implementations, no persistence, no transport, no framework.
- Put them where the repository's conventions say domain code lives; with no convention, one module per context named
  after it, one file per aggregate. Never in folders named after patterns (\`models/\`, \`entities/\`, \`events/\`).
- Expected failures are values (a result type), not exceptions.
- Match the repository's formatter, linter and naming; run them, and the type checker, before you finish.

{{idioms}}

## Iterating

The spec and the code are older than this export, and people have changed them since. Respect that.

- Read \`CHANGES.md\` first. Change only what it implies; leave everything else byte for byte.
- A note is followed by its id, never by its words: \`trace.json\` maps each note id to the spec section and the type it
  became. A **reworded** note renames its concept everywhere (spec, glossary, types, references), and leaves no
  trace of the old name except as a banned synonym when people still say it.
- A **re-kinded** note moves to its new shape (a command that became a policy becomes a reaction).
- A **removed** note removes its concept, unless hand-written code or spec text still depends on it: then keep it and
  raise a question instead.
- A **new** relation or note extends; it never reorders or rewrites untouched sections.
- Keep every hand-written addition: methods people implemented, comments, extra fields, prose. When the board
  contradicts one, raise a question; do not overwrite it.
- With no \`CHANGES.md\` but an existing spec or code, treat the whole reading as the change list and merge into what
  is there.

## Before you finish

- Update \`trace.json\` (note id to spec anchor and type name) for every note, and keep \`storm.json\` as the baseline
  the next export compares against.
- Every note on the board is either in the spec and the types, or listed as a question; nothing is silently dropped.
- The type checker passes; the formatter has run; the spec indexes are updated.
- Report what you added, renamed, removed and left as a question, in a few lines.
`;

export function renderBrief(language: DomainLanguage): string {
  return BRIEF.replaceAll('{{language}}', LANGUAGE_IDIOMS[language].name).replace(
    '{{idioms}}',
    `### ${LANGUAGE_IDIOMS[language].name}\n\n${LANGUAGE_IDIOMS[language].idioms.map((l) => `- ${l}`).join('\n')}`,
  );
}
