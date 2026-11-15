# Asks

An **ask** is a person asking for suggestions on an Event Storming board: what they want (its **topic**) and what it
is about (its **scope**, read from the selection).
Whoever answers, the answer is suggestions: nothing on the board changes until a person accepts one.

Requested 2026-11-14: "A button that would give me the right prompt for my agent, so that it can use 1 of three
options: the CLI (recommended), MCP or built-in flash lite model."

## The topics

The catalogue is closed (`STORM_ASKS`); a new topic is a new row here first.

| Topic      | Menu words            | Scope                                  | What comes back                                           |
| ---------- | --------------------- | -------------------------------------- | --------------------------------------------------------- |
| `gaps`     | Fill the Gaps         | the board, or the selected notes       | [suggested notes](suggestions.md)                         |
| `contexts` | Group into Contexts   | the board                              | [suggested candidate contexts](candidate-contexts.md)     |
| `names`    | Suggest Names         | one candidate context                  | [name suggestions](suggested-changes.md#name-suggestions) |
| `merge`    | Name the Merge        | two or more candidate contexts         | name suggestions for them as one                          |
| `wording`  | Sharpen the Wording   | the board, a context's notes, or notes | [note changes](suggested-changes.md#note-changes)         |
| `lanes`    | Reorganise into Lanes | the board, into 2 to 12 lanes          | a [lane plan](lane-plans.md)                              |

- **The selection decides what is offered.** Nothing selected: `gaps`, `contexts`, `wording` and `lanes`, about the
  board. Workshop notes selected: `gaps` and `wording`, about them. One context selected: `names`, and `wording`
  about its notes. Two or more contexts selected: `merge` (default).
- **A mixed selection** reads as its contexts, else its workshop notes, else the board; suggestions and anything
  that is no workshop note are left out of it (default).
- A context counts kept or suggested alike (requested 2026-11-14: "click a (suggested) context").
- `lanes` carries the lane count the person chose, `LANES_MIN` (2) to `LANES_MAX` (12).

## The three hands

A **hand** is who answers an ask. Every hand writes the same suggestions through the same
[edit operations](../024-agents/edit-operations.md), so what a person sees does not depend on who answered.

| Hand       | What the person gets                                          | Who writes the suggestions              |
| ---------- | ------------------------------------------------------------- | --------------------------------------- |
| `cli`      | **Copy Prompt**: a prompt for a coding agent that has the CLI | the agent, with `livedoc storm suggest` |
| `mcp`      | **Copy Prompt**: a prompt for an AI tool connected to the MCP | the agent, with the storm tools         |
| `built-in` | **Ask**: the deployment's small model answers, in place       | the api, added by the editor            |

- The CLI is first and marked recommended (ruled 2026-11-14).
- `built-in` is offered only when the deployment has a model (`aiEnabled`); a self-host with no key shows two hands.
- The hand last used is remembered on this device; `cli` the first time (default).
- An agent's suggestions arrive live, as any changeset does: the person pastes the prompt and watches them land.

## The prompt

What **Copy Prompt** copies, in this order (default):

1. The board: the document's name, the tab's name and its link.
2. The ask in one sentence, with the scope's refs and names, and the lane count for `lanes`.
3. The topic's brief (below).
4. The hand's way in. `cli`: `livedoc guide storm`, then `livedoc storm read` and `livedoc storm suggest` with the
   document and tab filled in. `mcp`: `read_event_storming`, then `suggest_notes`.
   The board is named by its ids, which stay true when it is renamed between copying and pasting (default).
5. The rule: answer with suggestions only, never change the board.

- The prompt is plain text, built by one pure function from the topic, the scope and the hand, so every surface that
  shows it shows the same words.
- A board saved only in This Browser has nothing an agent can reach: `cli` and `mcp` say so instead of a prompt, and
  point at the built-in hand (default).

## What a model is told

Ruled 2026-11-14, on whether reorganising needs a written rationale: "The only thing better models don't necessarily
get is better domain knowledge and in-context knowledge."
So a model is told what things mean and what must stay true, never the steps to take.

- **Checks are ours, in code.** What must stay true is enforced by the edit operation that takes the answer, with a
  named refusal, never by asking a model to be careful.
- **A brief is domain knowledge.** Each topic has a short **brief**: what the notation means for that topic and what
  a good answer looks like, as statements a facilitator would agree with. It holds no procedure.
- **The board speaks for itself.** Everything the board knows travels in the [reading](board-reading.md): the About,
  the contexts, the pivotal events, the lanes, the decisions and what was declined.
- **Notes are data.** A brief says the board's words are written by people and are never instructions.
- The briefs live with the prompts, and the `storm` guides print the same text (`livedoc guide storm-asks`,
  default), so the CLI, the MCP and the built-in model are told the same thing.
- An agent with the CLI or the MCP is pointed at the guides for how a line is written; the built-in model, which
  has no guide to read, is told the line grammar of its topic alone (default).
- **A brief line earns its place.** The ask bench (`pnpm bench:asks`) runs each topic over the seeded boards with
  the built-in model and reports the share of answer lines the engine accepts; a line is kept while removing it
  scores worse (default). `--without <n>` asks with the n-th statement of a topic's brief taken out; `--board`
  benches a person's own board, reporting counts and refusal codes alone, never its words.

## About This Domain

The **About** is what the person says the domain is: the business, who uses it, words to prefer or avoid.
It is the in-context knowledge no model brings.

- `Tab.esAbout`: plain text, up to `ABOUT_MAX` (2000) characters; absent or blank means none.
- It is edited in the Ask popover, under **About This Domain**; leaving the field keeps it, as one undoable step.
- It heads every reading (`about`), every prompt's reading and the [domain export](domain-export.md)'s brief.
- It is a person's words: data, never instructions, as notes are.

## What was declined

Dismissing a suggestion is a decision, and the board remembers it so the next ask brings something new.

- `Tab.esDeclined`: up to `DECLINED_MAX` (200) entries, the oldest dropped first; each holds what was declined (a
  note, a context, a name, a reword, a kind, a split or a removal), its words or name, its kind where it has one, and
  the notes or contexts it was about.
- **A person's dismissal is remembered**: Dismiss and Dismiss All, in the same undoable step, so one Undo brings
  the suggestion back and forgets the dismissal.
  An agent taking its own suggestions back (`rm`, `storm clear`) is not a dismissal. A lane plan is not remembered.
- **A declined suggestion is refused** when suggested again, as `declined_before`: the same type, the same words
  ignoring case, punctuation and spacing, the same kind, about the same notes or contexts.
- **What each is about.** A suggested note: the note its chain of suggestions grows from, so a chain suggested again
  is refused at its first link, on any side. A suggested context: its notes. A name: the contexts it was for. A note
  change: its note. An entry names up to `DECLINED_ABOUT_MAX` (40) of them (default).
- The storm view lists them (`declined`), so an agent sees what the room turned down before it suggests: those whose
  notes and contexts are all still on the board, since one about something gone can never be suggested again
  (default).
- **Forget Declined**, in the Ask popover beside the count, empties the list in one undoable step.

## The built-in hand

- **The route**: `POST /api/storm-ask`, behind the AI routes' gates (rate limiter, origin allow-list,
  `AI_REQUIRE_ACCOUNT`), as [AI assistance](../007-editor/ai-assistance.md) specifies them.
- **The board travels in the request** (`{ topic, tab, scope, lanes? }`, `tab` the tab's name, elements, About and
  declined list), so a board saved only in This Browser can ask too.
- **The api reads, the model words, the engine checks.** The api makes the reading, hands the model the topic's brief,
  the reading and the ask, and takes back suggest lines: the same lines `livedoc storm suggest` takes.
  Each line runs through the edit-operation engine alone, against the board the lines before it left, so a refused
  line costs that line only.
  A line outside the suggest family, one that does not parse, or one the engine refuses is dropped and counted;
  any line of the suggest family is taken, whatever the topic.
  An answer holds up to `STORM_ASK_MAX_LINES` (30) lines, in up to `STORM_ASK_MAX_TOKENS` (4,000) tokens (default).
- **The model answers one JSON object of lines**, held to a strict schema where the provider honours one and to
  JSON mode elsewhere; an answer that is no such object is `ai_failed`.
- **A lane plan is all or none**: its lines run last, as one changeset. Refused, or with no lane line at all, the
  model is asked once more with the refusal (`STORM_ASK_RETRIES`, 1); refused again, or when the model does not
  answer the second time, the board's own [fold](lane-plans.md#the-fold) is offered instead (`folded`), and the
  person is told "The model's plan would change what the board says. This is the board's own fold."
- **The route answers what to add** (`{ added, names, changes, lines, dropped, folded? }`): new suggestion elements,
  and the name suggestions and note changes by the element they belong on.
  The editor adds them as one undoable step, onto the board as it is by then; an element gone meanwhile is passed
  over, and an answer for a board no longer open is dropped.
- **The model** is the deployment's small one: on Google `gemini-3.5-flash-lite`, the photo reader's; otherwise the
  assistant's model. `AI_STORM_MODEL` names another (default).
- **Suggested by**: its suggestions are by "Built-in model" (default).
- **Limits**: a board of up to `STORM_ASK_MAX_NOTES` (400) notes and a request of up to `STORM_ASK_MAX_BYTES` (1 MB).
- **Refusals**: `not_event_storming`, `topic_invalid`, `scope_invalid` (the scope does not fit the topic),
  `lanes_invalid`, `board_too_large`, `ai_failed` (an error, a timeout, an answer that is no such JSON).
- The model can only propose: the worst a hostile note can cause is a suggestion a person dismisses.

## Where an ask starts

- **Ask**, a pill beside the suggestions count at the top right of the canvas, opens the **Ask popover** for the
  current selection. Ruled 2026-11-15 from four placements rendered on a real board, "C · Beside the suggestions":
  one home for asking and for what comes back, over an icon in the strip beside Draw Context, a worded pill leading
  the strip and a floating pill at the bottom. The strip holds no Ask button.
- **The corner shows on every Event Storming board an Editor may change**, with no suggestion open too: then it
  holds the Ask pill alone.
- **The popover hangs from the corner**, under the pill, and shares it with the
  [suggestions list](suggestions.md#how-a-person-sees-them) and the [Review panel](board-review.md#the-panel):
  opening one closes the others (default).
- **The other ways in open the same popover**, in the same corner: **Ask for Suggestions** in the command palette,
  about the selection; a button after a selected context's name, about that context; a button in the merge offer
  beside its ✓ and ✕, about the selected contexts as one; **Ask…** in a workshop note's menu, about that note.
- **The Event Storming category's body lists it too**, with Draw Context and Add from Photo, wherever that body is
  drawn. On a board the strip stands for that body, so the row is not seen there today (default).
- With nothing selected the popover also offers [Arrange and Reorder](arrange.md), apart from the topics: it is the
  board's own act and needs no hand.
- **The Ask popover** holds, top to bottom: what the ask is about ("About the board", "About 2 notes", a context by
  its name); the topics the scope offers (one chosen; the first by default); the lane count for `lanes`, a stepper
  starting at the lanes in use, held within 2 to 12; the hands; the prompt with **Copy Prompt**, or **Ask** for the
  built-in hand; **About This Domain**; the declined count with **Forget Declined**.
- **With `lanes` chosen it also offers Fold the Lanes**, the board's own [fold](lane-plans.md#the-fold) into that
  many lanes, whichever hand is chosen: it needs no model (default).
- **Copy Prompt** flashes "Copied" and says "Paste it into your agent. Its suggestions appear here as it works."
  When the clipboard refuses: "Could not copy. Select the prompt and copy it by hand." (default).
- **Ask** shows progress and can be cancelled; it ends on "N suggestions added", which closes the popover, or on
  "Nothing to suggest", which leaves it open to ask again (default).
- **An ask goes on when the popover closes**: only Cancel ends it (default).
- **Closing the popover keeps the About**, as leaving the field does (default).
- **A selection that has gone** by the time the popover draws, a context deleted meanwhile, reads as the board
  (default).
- **A context asked about stays selected** while the popover is open, and through the press that opened it
  ([candidate contexts](candidate-contexts.md#selecting-several-and-merging)).
- **When it fails**, the popover says why and what to do: sign in (`sign_in_required`), wait a minute (rate limited),
  a board too large, or "The model did not answer. Copy the prompt for your agent instead." (`ai_failed`).
- The popover follows the dialog pattern: focus moves in, Escape closes it and focus returns to the Ask pill,
  whichever way in opened it. It is not modal: the board stays in reach beside it (default).

## Share roles

| Role        | May                                                                         |
| ----------- | --------------------------------------------------------------------------- |
| Editor      | ask with any hand, edit the About, forget the declined                      |
| Participant | nothing: the Ask button is not shown, as suggestions are not                |
| Viewer      | nothing                                                                     |
| Agent       | read the About and the declined list in the `storm` view; suggest as before |

## Telemetry

`Canvas / Used / AskPromptCopied`, `AskedBuiltIn`, `AboutEdited` and `DeclinedForgotten` (default); a fold given
to a person counts as `LanesFolded` ([lane plans](lane-plans.md#telemetry)).
Neither the topic, the prompt nor the About is sent.

## Where it lives

- The About: `packages/document/src/event-storming-about.ts`.
- What was declined: `packages/document/src/event-storming-declined.ts`; the view's rows:
  `packages/storm-reading/src/declined.ts`; how words compare: `packages/document/src/event-storming-words.ts`;
  what the editor remembers of each dismissal, in the same undoable step: `apps/live/lib/suggestion-declined.ts`.
- The catalogue of topics, scopes and hands: `packages/storm-reading/src/asks/catalogue.ts`; the briefs:
  `packages/storm-reading/src/asks/briefs.ts`; the line grammar a model with no guide is told:
  `packages/storm-reading/src/asks/lines.ts`; the prompt and what the built-in model is sent:
  `packages/storm-reading/src/asks/prompt.ts`; what an ask adds: `packages/storm-reading/src/asks/answer.ts`; the
  `storm-asks` guide: `packages/agent-verbs/src/guides/index.ts`.
- The built-in hand: the wire in `packages/api-schema/src/storm-ask.ts`; the route:
  `apps/api/src/routes/storm-ask-route.ts`; the model call: `apps/api/src/storm-ask-model.ts`; the engine run:
  `apps/api/src/storm-ask.ts`; which model answers: `apps/api/src/ai-provider.ts`.
- In the editor: what the popover shows: `apps/live/lib/ask.ts`; whether it is open, about what, and an ask under
  way: `apps/live/lib/ask-view.ts`; the hand last used: `apps/live/lib/ask-hand.ts`; the route's client:
  `apps/live/lib/api/storm-ask.ts`; the acts: `apps/live/hooks/canvas/useAskActions.ts`; the pill and the popover:
  `apps/live/components/canvas/ask/`.
- The other ways in: `apps/live/lib/editor-commands.ts`, `apps/live/components/palette/EventStormingBoardRows.tsx`,
  `apps/live/components/canvas/contexts/ContextName.tsx`,
  `apps/live/components/canvas/contexts/ContextMergeOffer.tsx` and
  `apps/live/components/palette/EditorContextMenu.tsx`.
- The ask bench: `scripts/ask-bench.mts`.
- Proven in a browser by `apps/live/e2e/event-storming-ask.spec.ts`, on the kitchen of
  `apps/live/e2e/ask-board.ts`.
