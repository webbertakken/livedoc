# Domain export

The **domain export** turns an Event Storming board into what a team builds from it: a **spec** of the domain, laid
out the way [our organisation](../../../AGENTS.md#organisation-process) lays specs out, and the **domain types in
code**, in the language the team works in.
It is offered three ways, which all hand out the same thing: the [CLI](#the-cli), the [MCP](#the-mcp) and a
[zip](#the-zip) from the editor.

## Two halves: the reading and the writing

- **The reading is ours.** What the board says (notes, timeline, chains, gaps) is the deterministic
  [board reading](board-reading.md), the same in all three ways, and it is never a model's guess.
- **The writing is always a model's.** Turning a domain into a spec and types is judgement: naming, grouping notes
  into aggregates and contexts, choosing how a language expresses a value or a state. Models keep getting better at
  it, so no template, generator or rule set of ours stands in for one; a deterministic generator would freeze
  today's judgement into the product.
- **The brief joins them.** `CONVERT.md` is one text, shipped with LiveDoc, that tells a model how to turn a reading
  into a spec and types: what each note kind becomes, how the spec is organised, how each language expresses the
  building blocks, and how to change an earlier result rather than replace it. Every way hands the same brief to
  whichever model does the writing. The brief is distilled from the domain-driven design and code-pattern
  literature; its source is `packages/storm-reading/src/brief/`.

## The bundle

What every way produces before a model writes anything:

| File          | Holds                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `storm.json`  | The reading as data (`livedoc.storm/1`): the baseline the next export compares against                   |
| `storm.md`    | The reading as text, the `storm` view                                                                    |
| `CHANGES.md`  | What changed on the board since the previous export's `storm.json`, when there is one                    |
| `CONVERT.md`  | The brief, with the language filled in                                                                   |
| `export.json` | The manifest: board (document, tab, name, rev), language, LiveDoc version, when, and the brief's version |
| `trace.json`  | Which spec section and type each note became: written by the model, kept by every later export            |

## Iterative, never from scratch

A board changes after its first export, and so do the spec and the code a team grew from it.
An export never throws the earlier result away:

- **The baseline.** Each export keeps its `storm.json`, and the model keeps `trace.json` beside it. The next export compares the new reading against it and
  writes `CHANGES.md`: notes added, removed, reworded and re-kinded, and relations made and broken, by note ref.
  Refs are stable element ids, so a reworded note is a rewording, not a removal and an addition.
- **The brief says change, not regenerate.** With an earlier result present, the model reads the existing spec and
  code first, applies only what `CHANGES.md` implies, keeps every hand-written change, and renames through the code
  rather than leaving the old name behind.
- **With no baseline** (a first export, or an earlier result made without one) the model still reads whatever spec
  and code exist before writing, and treats the reading as the whole story.

## The language

The types are written in the language the team needs, identified, not assumed:

- **The CLI** looks at the directory it writes into: the project files at its root name the language
  (`tsconfig.json` or `package.json` TypeScript, `pyproject.toml`, `requirements.txt` or `setup.py` Python, `go.mod` Go,
  `Cargo.toml` Rust, `*.csproj` or `*.sln` C#, `pom.xml` or `build.gradle` Java, `build.gradle.kts` Kotlin,
  `pubspec.yaml` Dart; `DOMAIN_LANGUAGE_MARKERS`).
  An earlier export's manifest wins over the markers. `--lang` wins over both. Two or more candidates, or none,
  is refused as `language_unclear` with the candidates and the `--lang` to choose.
- **The MCP** takes `language`, optional: without it the brief tells the agent to identify the language from the
  repository it works in, and to ask the person when the repository does not say.
- **The zip** asks: the export dialog's language picker, remembered per board on this device, TypeScript the first
  time (default).
- The languages offered are `DOMAIN_EXPORT_LANGUAGES`: the eight the domain-modelling research covers. The brief
  carries each one's building-block idioms, so the types read as that language's community writes them.

## The CLI

`livedoc storm export <doc> [--tab <t>] [--to <dir>] [--lang <language>]`

- Writes the bundle into `<dir>/.livedoc/storm/<board-slug>/` (`<dir>` defaults to the working directory), reading
  the earlier `storm.json` and `export.json` there first for `CHANGES.md` and the language.
- Prints where the bundle is, the language and why, the counts (notes, events, gaps, changes), and the next step:
  "Follow CONVERT.md". An agent driving the CLI is the model that writes the spec and the types, into the repository
  it is already working in, where the existing spec and code are.
- The bundle stays in the repository: committing it is what lets a teammate's next export iterate from the same
  baseline.

## The MCP

`export_event_storming { documentId, tabId?, language?, previous? }` (read)

- Answers the bundle as text: the reading, `CHANGES.md` when `previous` (the earlier `storm.json`) is given, the
  brief, and the manifest.
- The calling agent is the model: it writes the spec and the types into its workspace following the brief, and keeps
  the new `storm.json` as the next baseline.

## The zip

**File → Export → Domain Model (zip)**, offered on an Event Storming board only.

- **The dialog**: the language, and **Update an earlier export** (an earlier zip, optional).
- **With the deployment's model** (`aiEnabled`), the api writes the spec and the types with the brief, given the
  reading, `CHANGES.md` and the earlier zip's spec and code when one was given, and the zip holds the result beside
  the bundle. It may take a minute: the dialog shows progress and can be cancelled.
- **Without one** (a self-host with no model key), the zip holds the bundle and a `README.md` saying to hand
  `CONVERT.md` to a coding agent; the dialog says so before the export, never after.
- **Layout**: `README.md`, `livedoc/` (the bundle), `docs/specs/…` (the spec), and the source tree the brief chose for
  the language.
- **Limits**: a board of up to `DOMAIN_EXPORT_MAX_NOTES` (400) notes; an earlier zip of up to
  `DOMAIN_EXPORT_MAX_PREVIOUS_BYTES` (2 MB) of text; anything past them is refused before the model is called,
  saying which.
- The route is `POST /api/documents/:id/tabs/:tabId/storm-export`, behind the AI routes' gates (rate limiter,
  origin allow-list, `AI_REQUIRE_ACCOUNT`), with edit or view access to the tab.
- **Telemetry**: `Export / Used / DomainModel`.

## Share roles

Exporting reads the board: anyone who may read it may export it, as with every other export.
