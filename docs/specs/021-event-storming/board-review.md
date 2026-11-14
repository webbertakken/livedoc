# Board review

The **Review panel** is where a person looks a board over before building from it: what the
[reading](board-reading.md) found, the words the board uses, and the story told aloud.
All of it is deterministic: no model is asked, so a deployment without one has the whole panel.

## The panel

- **Review**, a button in the strip beside Ask and in the Event Storming category, opens and closes the panel.
- It stands where the [suggestions panel](suggestions.md#how-a-person-sees-them) stands; while it is open the
  suggestions panel folds to its button (default).
- Three tabs, following the WAI-ARIA tabs pattern: **Check**, **Language** and **Story**. The tab last open is
  remembered on this device; Check the first time (default).
- It reads the board as it is and follows every change, a peer's included.

## Readiness

The **readiness** line heads the Check tab and the [domain export](domain-export.md) dialog.

- It counts what a person would settle before exporting: events, gaps, open hotspots, and events outside every
  candidate context when the board keeps any ("42 events · 3 gaps · 2 open hotspots · 5 events outside a context").
- A board with none of the last three reads "Ready to export".
- It never blocks an export: it informs.

## Check

The gaps the reading finds, for a person: until this panel nothing in the editor showed them.

- **Grouped by level**, in the reading's order: flow ("The story has a hole"), notation ("The grammar slipped"),
  question ("Left open").
- **A row** says the gap in words and names its notes. Pointing at it or focusing it brings those notes into view
  and rings them.
- **Add**, on a gap with a remedy, lands a blank note of the remedy's kind where the remedy says (the side of the
  note it names), exactly as a [next-note button](event-storming.md#phase-7-shipped-re-ruled-next-note-buttons)
  lands one, and opens it for typing. One undoable step.
- **Answer**, on an open hotspot's row, opens its [answer](board-structure.md#hotspot-answers).
- **No gap**: "Nothing to check. The story holds."
- A gap is a prompt, never a verdict: nothing is drawn on a note because of one.

## Language

The board's terms: [Board language](board-language.md#the-language-tab).

## Story

The timeline told as sentences, one step per event, so a person can walk it and hear where it stumbles.

- **A step** is one event with what leads to it and what follows: who issues which command ("Customer: Place Order"),
  the event, then each policy and the command it issues ("Whenever Order Placed: Notify kitchen, then Prepare Meal").
  The words are the notes' own; only the joining words are ours.
- **Walking.** The step in hand is highlighted; Next and Previous, or the arrow keys while the list has focus, move
  through the timeline. The board brings the step's notes into view and rings them.
- A pivotal event's step is followed by a rule naming the phase it closes.
- The loose notes follow the last step, by kind.
- **An empty timeline**: "No events yet. The story starts with one."
- Under reduced motion the view jumps rather than glides.

## Share roles

| Role        | May                                                         |
| ----------- | ----------------------------------------------------------- |
| Editor      | open the panel, walk the story, Add and Answer, Rename Term |
| Participant | open the panel and read all three tabs; no Add, no Rename   |
| Viewer      | open the panel and read all three tabs                      |

## Telemetry

`Canvas / Used / ReviewOpened`, `GapNoteAdded` and `StoryWalked` (once per opening of the Story tab) (default).

## Where it lives

- The readiness and the story's sentences: `packages/storm-reading/src/readiness.ts` and `story.ts`.
- The panel: `apps/live/components/canvas/review/`.
