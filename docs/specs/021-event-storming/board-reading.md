# Board reading

The **board reading** is what an Event Storming board says, read out of where its notes sit.
It is deterministic and pure: the same board always reads the same, with no model involved.
A model is good at domain words and poor at geometry, so the geometry is read here and the words are left to the model.
The reading feeds everything that has to understand a board rather than draw it:
the agents' `storm` view ([Suggestions](suggestions.md)), the gaps, and the [domain export](domain-export.md).

It lives in `@livedoc/storm-reading` (`packages/storm-reading`), beside nothing that paints.

## What is read

- **Notes.** Every workshop note on the tab (a sticky with an `esKind`), except a [suggestion](suggestions.md).
  A plain sticky, a shape, an arrow or a picture is not part of the notation and is not read.
- **Words.** A note's label, trimmed, with runs of whitespace collapsed; capitals are presentation, so the typed case
  is kept.
- **Time.** The x axis is time, left to right: a note's moment is its centre x.
- **Lanes.** A note's lane is the lane its centre is nearest (`ES_LANES`); a note free-placed off a lane still has one.
- **Reach.** Two notes can relate only within `READING_REACH_LANES` (2) lanes of each other.

## Relations

Each note kind relates to the flow by the notation's own grammar:
an actor or a read model leads to a command, a command causes an event, an aggregate or an external system handles
the command that causes an event, an event triggers a policy, and a policy issues a command.
A relation is found from geometry alone, in this order, and each note takes at most one partner per relation:

| Note            | Relates to                                           | How it is found                                                                          |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Command         | the event it **causes**                              | the nearest event not left of the command                                                |
| Policy          | the event that **triggers** it                       | the nearest event not right of the policy                                                |
| Policy          | the command it **issues**                            | the nearest command not left of the policy, whose event comes after the policy's trigger |
| Actor           | the command it **issues**                            | the command it overlaps, else the nearest command not left of it                         |
| Read model      | the command it **informs**                           | the nearest command not left of it                                                       |
| Aggregate       | the event it **decides**                             | the nearest event not left of it                                                         |
| External system | the event it **causes** or the command it **serves** | the nearest event not left of it                                                         |
| Hotspot         | the note it **flags**                                | the note it overlaps most, else the nearest note                                         |

- **"Not left of"** means the partner's centre is at or right of the note's left edge, so a partner in the same
  column counts: a board laid out a lane per kind (as the MCP's storm graph lays it) reads like a board laid out in
  one row.
- **Nearest** is by straight-line distance between centres, where each lane apart costs one `ES_LANE_PITCH` (default), so a partner on the
  note's own lane wins over one diagonally the same distance away.
- **Ties** go to the partner fewer lanes away, then to the one on the lane above, then to the one first in document
  order.
- There is no reach along the timeline: a partner far to the right is still the nearest one (default).
- A note that finds no partner within reach is **loose**: read, listed, and the subject of a gap.

## The timeline

- The reading is a **timeline of events**, ordered by moment, then by lane from the top.
- Each event carries what leads to it (its commands, each with its actors, read models and issuing policy), what
  decides it (aggregates, external systems), what it triggers (its policies, each with the command it issues) and
  what flags it (hotspots).
- A **chain** is an event, a policy it triggers, the command the policy issues and the event that command causes:
  the reading follows chains, so a process reads as one story across the board.
- Loose notes follow the timeline, by kind, in reading order.

## Gaps

A **gap** is a finding about the board, the way a [lint](../024-agents/diagram-lint.md) finding is one about a
drawing. Each has a stable code, a level, the notes it is about and, where one note would close it, the **remedy**:
the kind of note and the side of which note it would go.
The remedy is what turns a gap into a [suggestion](suggestions.md): the reading knows where, a model knows the words.

Levels:

- **notation**: the grammar was not followed.
- **flow**: the story has a hole.
- **question**: something the room left open.

| Code                      | Level    | When                                                                   | Remedy                     |
| ------------------------- | -------- | ---------------------------------------------------------------------- | -------------------------- |
| `event_without_cause`     | flow     | No command, policy-issued command or external system leads to an event | a command before the event |
| `command_without_event`   | flow     | A command causes no event                                              | an event after the command |
| `command_without_trigger` | flow     | No actor and no policy issues a command                                | an actor above the command |
| `policy_without_trigger`  | flow     | No event triggers a policy                                             | an event before the policy |
| `policy_without_command`  | flow     | A policy issues no command                                             | a command after the policy |
| `read_model_unused`       | flow     | A read model informs no command                                        | a command after it         |
| `blank_note`              | notation | A note has no words                                                    | none                       |
| `event_not_past_tense`    | notation | An event's last word does not read as past tense                       | none                       |
| `command_not_imperative`  | notation | A command's first word reads as past tense                             | none                       |
| `duplicate_note`          | question | Two events, commands or policies of one kind say the same words        | none                       |
| `open_hotspot`            | question | Every hotspot: a question the room has not answered                    | none                       |

- **Tense is a heuristic, in English.** A word reads as past tense when it ends in `ed`, or is one of the common
  irregular past forms (`PAST_TENSE_IRREGULARS`). A board in another language finds none of these two, never false
  ones: the check stands down when fewer than half the board's events read as English past tense
  (`TENSE_CHECK_MIN_SHARE`) (default).
- **Duplicates** compare words ignoring case, punctuation and repeated spaces, among the kinds that name a moment
  (events, commands, policies): actors, read models, aggregates and external systems recur on a board by nature.
- Gaps are ordered by the timeline (the first note they name), then by code.
- A gap is a prompt, never a verdict: an event can be caused by time passing, and the room may know it.
  Nothing in the editor flags a gap on its own; gaps are what an agent reads to make suggestions.

## Output

- **Data**: `StormReading`, versioned (`schema: 'livedoc.storm/1'`), holding the notes (ref, kind, words, lane,
  order), the timeline, the chains, the loose notes and the gaps. It is the `storm.json` of the
  [domain export](domain-export.md).
- **Text**: the `storm` view (`?view=storm` on a tab), compact, one line per note in timeline order, then the loose
  notes, the gaps and the board's open [suggestions](suggestions.md). It is not budgeted: the whole reading is what an
  agent asks for, and a board of `DOMAIN_EXPORT_MAX_NOTES` notes prints in about eight thousand tokens.
- **JSON** of the view (`json=1`): `{ reading, suggestions, rev }`, `rev` the tab revision read. A tab that is not a board is refused as
  `400 not_event_storming`.
- Refs are the [document views](../024-agents/document-views.md#refs)' refs, so an agent can name a note from the
  reading in an edit operation.
