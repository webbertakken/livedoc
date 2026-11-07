# CLI

**Status: built; publishing as `@livedoc/cli`.** Its first release on npm is 0.4.0 (`0.0.0` holds the placeholder that created the package); the version line continues from the 0.3.0 it was forked at. Every command below signs in through the
browser, a device code or a token kept in the system's keychain, and is counted on the dashboard. The help centre
article is `/help/developers/cli/` (Developers). Ahead: the update check.

`livedoc` is a command-line front door to the api, built first for **agents** (a coding agent in a repo, a chat
agent changing a diagram while a person talks to it) and second for people (scripts, syncing documents to files).
With it an agent reads, builds, edits, comments on and reasons about documents, paying for context only when it
asks. It sits beside the [MCP server](mcp-server.md), not in place of it: the two are front doors to one set of
verbs, and the api owns every write ([Agents](../024-agents/README.md)). The research behind it is in
`docs/research/agent-cli/`.

## Principles

- **Remote-first.** Every command acts on the api. Local files are an explicit `pull`, `push` or `export`.
- **The api owns meaning.** Writes are [changesets](../024-agents/agent-changesets.md) compiled by the api; reads are
  [views](../024-agents/document-views.md) rendered by the api. The CLI parses, sends and prints, so an old install
  never writes the old way.
- **Context costs only when asked.** No definitions up front; short help; compact text by default.
- **Never interactive when piped.** A command whose stdin or stdout is not a terminal never prompts.
- **No whole-tab saves.** The CLI never writes a tab with the editor's whole-tab `PUT`. Tab content changes only by
  changesets, a new tab is a `replace` changeset on a new tab id, a tab is renamed through its name route
  (`PUT /api/documents/:id/tabs/:tabId/name`), and a new document is compiled by `POST /api/documents`.

## Commands

Resource, then verb. `doc` and `el` are accepted for `document` and `element`.

| Command                                                                         | Does                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document ls [query]`                                                           | Documents in the personal library and joined teams, newest first                                                                                                           |
| `folder ls [--json]` / `folder create <name> [--in <f>]`                        | The person's folders as paths with their ids; a new folder, at the top of My documents or inside another                                                                   |
| `document view <doc>`                                                           | The overview view                                                                                                                                                          |
| `document create <name> [--tab <name>] [-f <file>\|--template <kind>]`          | A new document from a graph, Mermaid or template, compiled by the api                                                                                                      |
| `document rename\|share\|rm\|restore <doc>`                                     | As the MCP's verbs; `rm` moves to the Trash, there is no permanent delete                                                                                                  |
| `tab ls <doc>`                                                                  | The document's tabs                                                                                                                                                        |
| `tab view <doc> [--tab <t>] [--view <name>] [--budget <n>]`                     | A view; the outline by default; `show` takes `--ref`, `find` `--text`                                                                                                      |
| `tab add\|rename\|rm <doc> ...`                                                 | Tab lifecycle; `add` takes `-f` or `--template`                                                                                                                            |
| `tab diff <doc> [--tab <t>] --since <rev>`                                      | The diff view, computed by the CLI from its copy of the tab at that rev                                                                                                    |
| `tab render <doc> [--tab <t>] --png <file>\|--svg <file>`                       | A preview image; prints the path and its size, never image bytes                                                                                                           |
| `tab lint <doc> [--tab <t>]`                                                    | The [diagram lint](../024-agents/diagram-lint.md), served as a view                                                                                                        |
| `element add\|set\|rm\|move\|connect\|insert\|wrap <doc> ...`                   | One [edit operation](../024-agents/edit-operations.md) as a changeset                                                                                                      |
| `item ls\|add\|set\|move\|rm <doc> ...`                                         | [Items](../026-plan/items.md) by number (`#12`); columns, types, fields by name                                                                                            |
| `board add\|set <doc> ...`                                                      | Add a Plan board, or change one's title, columns or card types ([Plan for agents](../026-plan/plan-agents.md#adding-a-board))                                              |
| `type ls\|apply <doc> ...`                                                      | Card types, and changes to them from a JSON file ([Plan for agents](../026-plan/plan-agents.md))                                                                           |
| `sheet ls\|get\|set\|add\|insert-rows\|insert-cols\|rm-rows\|rm-cols <doc> ...` | Sheets: list, read cells by A1, set cells (or `--csv`), put one on a tab, insert or delete rows and columns ([Sheet store](../029-sheets/sheet-store.md#agents))           |
| `page ls\|set <doc> ...`                                                        | Pages: list them (the `pages` view), add, change, lay out, move, duplicate and delete them ([Pages for agents](../024-agents/pages-for-agents.md))                         |
| `form get\|add\|change\|share <doc> ...`                                        | Forms: read one, add one from a starter or `--from` JSON, change it from a JSON file of changes, publish, close or delete its link ([Forms](../030-forms/forms.md#agents)) |
| `article get\|set <doc> ...`                                                    | Articles: one as Markdown, or write one from Markdown (`--file`, `--append`, `--new`) ([Pages for agents](../024-agents/pages-for-agents.md#write_article))                |
| `changeset apply <doc> [--tab <t>] -f <file>\|-` (`edit`)                       | Many edit operations, or a `replace`, as one changeset                                                                                                                     |
| `changeset ls\|show\|revert <doc> [<changeset>]`                                | Recent changesets and their revert                                                                                                                                         |
| `comment ls\|add\|reply\|resolve\|reopen <doc> ...`                             | Threads ([Agent presence](../024-agents/agent-presence.md#comments)), by element ref                                                                                       |
| `presence set\|clear <doc> [--tab <t>] [--status ..] [--focus ..]`              | The agent's presence                                                                                                                                                       |
| `wait <doc> --for comment\|change [--timeout <s>]`                              | Blocks until it happens, prints it, exits                                                                                                                                  |
| `watch <doc>`                                                                   | Streams changes, one line each, until interrupted                                                                                                                          |
| `graph lint\|render <file>`                                                     | Lint or preview a graph or Mermaid file locally, before writing anything                                                                                                   |
| `pull <doc> [--to <dir>] [--force]` / `push <file>`                             | Sync one document to a file and back                                                                                                                                       |
| `export --all --to <dir> [--format json,svg,png,mermaid,md]`                    | Every document to files                                                                                                                                                    |
| `link init [--folder <f>] [--doc <d>] [--level <l>]`                            | Writes `livedoc.toml`; with no folder or document, a picker of the folders                                                                                                 |
| `link status\|ls [--all]`                                                       | A [repository link](../027-repositories/repository-link.md)'s documents and states                                                                                         |
| `sync [--watch] [--relocate] [--dry-run] [--all]`                               | Mirrors the link's documents into the repository; `--watch` keeps doing it                                                                                                 |
| `workbench open <doc>\|--workspace [--folder <f>] [--tab <t>] --origin <o>`     | A single-use link that opens the document, or the whole workspace (on Home, or a folder), live in a paired workbench                                                       |
| `workbench pair --origin <origin> [--name <name>] [--workspace]`                | Pairs the token with a workbench, approved once in the browser; `--workspace` asks for the whole workspace                                                                 |
| `template ls\|view`, `icon search <text>`, `image ls [name]`, `schema [kind]`   | The catalogues, the image gallery an image element's `imageId=` takes ([Image element](../009-elements/images.md#agents)), and the element format, from the api            |
| `guide [topic]`                                                                 | How-tos: `build`, `edit`, `views`, `comments`, `collaborate`, `workbench`                                                                                                  |
| `skill print\|install --to <dir>`                                               | The agent skill file                                                                                                                                                       |
| `api <method> <path> [--body <file>\|-]`                                        | Any api route, authenticated; the escape hatch                                                                                                                             |
| `auth login\|status\|logout`                                                    | Credentials                                                                                                                                                                |

**Addressing.** `<doc>` is a document name, an id prefix, or a pasted LiveDoc URL; an ambiguous one is refused
with the candidates. A share-link URL acts through that link: each request of the command carries its code. A
pulled file's path reads its views offline. `--tab` takes a tab name or id prefix and defaults to the first tab.
Elements are [refs and selectors](../024-agents/edit-operations.md#selectors); the comment verbs take the ref of the
element whose thread they act on, and `--cell <A1>` on a Sheet for a cell's thread
([Cell comments](../029-sheets/sheet.md#cell-comments)).

**Branches** (specified, not built). Document commands and changesets take `--branch <name>` and act on that
[document branch](../006-document/document-branches.md#agents); inside a linked work tree they default to the branch
bound to the work tree's git branch ([Branch binding](../027-repositories/branch-binding.md)). `document branches`,
`document merge` and `document discard` list, merge and discard them; `link clean` and `unlink` join the link
commands ([Repository link](../027-repositories/repository-link.md#commands)).

**Local copies** (specified, not built). `link init` takes `--dir <d>` (where the link's files live) and `--binding
none|branches` (`none` keeps a folder inside a git work tree a local copy); `sync --take file|livedoc <path>` settles a
file document changed in both places ([Local copy](../027-repositories/local-copy.md)).

**Files.** `-f <file>` holds edit operations, a graph, Mermaid, or elements, told apart by their content; a file
that is none of them is refused.

**Changeset writes** (`element`, `changeset apply`, `tab add`, `push`) accept `--dry-run` (the plan, nothing
written), `--summary <text>`, `--base <rev>`, `--strict` and `--wait-held <seconds>`. The base defaults to the agent's
last read of that tab: the CLI keeps a local copy of each tab it reads and sends its revision with the fingerprint of
every element, so the api can tell whether what the changeset targets changed since. The same copies give
`tab diff`.

**Ending.** Ctrl-C and SIGTERM (what a process manager sends) end a long command (`watch`, `sync --watch`) the same way: the work under way finishes, then the process exits within `EXIT_GRACE_MS` (250 ms), whatever a closing socket still waits for.

**Waiting.** `wait --for change` treats a burst of edits as one change. When `--timeout` passes, `wait` prints that
nothing new happened and exits 0.

**Provenance.** A document the CLI creates records `source: 'cli'`. Made by AI does not count it: a person directing
an agent through the CLI is designing their own diagram.

## Help

- `livedoc --help` lists the resources, how to address things, the output rules and four starting commands,
  within `HELP_TOP_MAX_TOKENS`.
- `<resource> --help` lists its verbs in a line each, within `HELP_RESOURCE_MAX_TOKENS`.
- `<resource> <verb> --help` gives usage, flags, two examples and what it prints, within `HELP_VERB_MAX_TOKENS`.
- `guide <topic>` and `schema <kind>` carry the depth, so it is paid for only when needed.
- `skill print` prints a `SKILL.md` whose frontmatter (about 60 tokens) says when to use the CLI and whose body
  points at `guide`, and at `guide workbench` when a message carries a `[livedoc]`
  [selection reference](../013-workspace/workbench-embeds.md#the-selection-reference). `skill install --to <dir>`
  writes it into that agent skills directory; without `--to` it lists the common ones.
- Help, guides and the skill come from the verb catalogue; templates, icons and the element format (`schema`) come
  from the api. Tests hold each within its budget.

## Output

- **stdout carries data only**; hints, warnings and update notices go to stderr.
- Compact text by default. `--json` gives the same data as JSON; `--json <fields>` picks fields; `-q` prints only
  refs or ids.
- Every write prints its result lines ([Edit operations](../024-agents/edit-operations.md#results)): what changed,
  the revision, the changeset, the lint summary and the revert command.
- Lists end with one line saying what was left out and how to see it, never silently cut.
- Errors name what was wrong, the valid values or candidates, and one runnable fix.

## Exit codes

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 0    | Done                                                             |
| 1    | Rejected: the input was understood and refused (`invalid_value`) |
| 2    | Usage: the command line does not parse                           |
| 3    | Not found or ambiguous: a document, tab or ref                   |
| 4    | Not signed in, or not permitted by the token's role              |
| 5    | Conflict or held: re-read, then retry                            |
| 6    | Rate limited                                                     |
| 7    | Network or server failure                                        |

## Authentication

In order of precedence:

1. **`LIVEDOC_TOKEN`**, a `livedoc_` token from the environment: agents, CI, sandboxes. There is no `--token` flag;
   it would land in shell history and transcripts.
2. **The stored credential** of the active profile, from `auth login`.

- `auth login` runs OAuth 2.1 with PKCE through the MCP worker's authorisation server
  ([MCP server](mcp-server.md) §3) with a loopback redirect, and stores the minted `livedoc_` token. `--device` uses the
  device authorisation grant for machines without a browser. `--with-token` reads a token from stdin, for hosts that
  do not run the MCP worker. The token is named "LiveDoc CLI"; its work shows as its owner's. A new login on a
  profile that holds a token revokes the old one once the new one works.
- The token goes in the operating system's own store, through the system's own tool and never native code: the
  macOS Keychain (`security`), the Secret Service on Linux (`secret-tool`), and on Windows a token sealed for the user
  with DPAPI (PowerShell). The token reaches the tool on stdin, never on a command line another process can read.
  Where the tool is missing or refuses, the token goes in `~/.config/livedoc/credentials.json` at mode 0600, with
  a one-line notice. The file keeps each profile's account, role and expiry either way.
- `auth status` prints the host, account, token name, its role and expiry, never the secret, and warns inside
  14 days of expiry. `auth logout` revokes the token and forgets it.
- A host without sign-in has no tokens, so the CLI cannot act there and says so in one line, as the MCP is absent
  there ([Public API and API tokens](public-api-and-tokens.md) §3.7). The CLI never acts as a guest.
- A stored credential the api refuses mid-command (a newer `auth login` revoked it while a long command such as
  `sync --watch` ran) is read again from the store, and the refused request is retried once with the new token.
  `LIVEDOC_TOKEN` is never re-read.
- `LIVEDOC_TOKEN` goes to whichever host is active; set `LIVEDOC_HOST` beside it for a self-host.

## Profiles and self-hosting

- `~/.config/livedoc/config.toml` names profiles, each a `host`; `--host`, `--profile`, `LIVEDOC_HOST` and
  `LIVEDOC_PROFILE` choose one. The default is `https://docs.nu`.
- The CLI learns a host from `GET /api/capabilities`: the api base, whether sign-in and the OAuth server exist, the
  document format and the oldest CLI version it accepts (`cli.minVersion`). Below that version the CLI refuses
  writes and names the version to install. Against a host storing a newer document format than it reads, the CLI
  refuses the commands that work on local files (`pull`, `push`, `export`, `graph`, `tab diff`) the same way.
- A self-host profile never contacts docs.nu.

## Local files

- `pull <doc>` writes `<slug>.livedoc.json`: the document, its tabs and each tab's revision. `--svg` adds a
  picture per tab. A pull never drops edits not yet pushed: when the file there changed since its pull, it is
  refused, naming `push`, and kept; `--force` drops those edits and pulls anyway.
- `push <file>` sends each changed tab as a changeset based on the pulled revision. A tab changed on the server
  since is refused as a conflict, naming it; the person pulls again. Nothing is overwritten blindly. Only elements
  are pushed: a changed tab name, theme or background, and a tab gone from the file, are named as not pushed, and
  nothing on the server is deleted.
- `export --all` writes every document, read-only, for backups and docs.
- A repository keeps its diagrams through a [repository link](../027-repositories/repository-link.md)
  (`link`, `sync`), whose mirror files are pull files; a developer tool frames the editor through
  `workbench open` ([Workbench embeds](../013-workspace/workbench-embeds.md)).

## Previews

`tab render` and `graph render` draw with the shared SVG renderer (`renderElementsToSvg`) and rasterise PNGs with
`@livedoc/render-png`, the MCP's resvg and embedded Inter. A stored tab is drawn from the api's
`render.svg`, so the CLI and the MCP draw alike.

## One catalogue for the CLI and the MCP

Every command and every MCP tool is a projection of one **verb** in `@livedoc/agent-verbs`: its id
(`tab.view`, `element.set`), input and output schemas, a factual description, its behaviour (read, write,
destructive) and a handler calling the api through `@livedoc/api-client`. The MCP keeps its tool names and
schemas: each tool is its own verb, a command whose shape differs is another, and the two share handlers. A parity
test fails when a verb is exposed by neither, or a tool's schema drifts from its verb.

## Distribution

- npm package `@livedoc/cli`, under the `livedoc` npm organisation, installing the command `livedoc`: one
  bundled ESM file plus the resvg wasm and font, Node 22 or later, run with `npx @livedoc/cli@latest` or installed.
  The unscoped `livedoc` and the `livedocs` scope belong to others on npm. Published from CI with provenance through npm
  trusted publishing, versioned on its own ([docs.nu operations](../../operations/docs-nu.md#npm)).
- Standalone binaries and a Homebrew tap may follow; a `curl | sh` installer is never offered.
- Once a day at most, after a command, it checks npm for a newer version and says so on stderr; never in CI, when
  stderr is not a terminal, or with `LIVEDOC_NO_UPDATE_CHECK=1`.

## Telemetry

- Category `Cli`, action `Used`, type the verb (`TabView`), sent after a command succeeds, never for help, mirroring
  `Mcp·Used` ([Telemetry](../017-telemetry/telemetry.md)). Api failures report as `Error·Api` with the verb, 4xx
  never.
- Sent to the active profile's api only. Off with `LIVEDOC_TELEMETRY=0`, `DO_NOT_TRACK=1` or `telemetry off`
  (which sends its own `UI·Toggled·TelemetryOff` first). The first run says on stderr what is counted.
- No device id, arguments, document ids or host names.
- A sign-in through the CLI counts as `Token·Created·Cli`, beside the MCP's `Token·Created·MCP`.

## Limits

| Constant                   | Value | Why                                                                                      |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| `HELP_TOP_MAX_TOKENS`      | 520   | Top-level help measured at 380; room to grow, not to sprawl (raised from 500 for `form`) |
| `HELP_RESOURCE_MAX_TOKENS` | 250   | A resource's verbs, a line each                                                          |
| `HELP_VERB_MAX_TOKENS`     | 400   | Usage, flags, two examples                                                               |

## Invariants and edge cases

The invariants and edge cases the code and its tests cite by id.

- **E11** A second `/callback` request (a refresh, a probe): answered 404 once the first valid one closed the server; a
  wrong `state` answers 400 and keeps waiting.
- **E13** The platform's tool is missing, or refuses a store: the file store, with the one-line notice. A stored
  keychain token the tool cannot read back: exit 4, hint `livedoc auth login`.
- **E14** `credentials.json` readable by group or others: stderr warning, mode set to 0600, read continues.
- **E18** `push` of a file pulled from another host: exit 2.
- **E20** A pull file edited into invalid JSON or an invalid tab: exit 1 naming the tab; nothing sent.
- **E24** `export` meets the token read limiter (120 a minute): 429 answers are retried after 60 s, up to three times
  per request, before exit 6.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **CLI1** What the workspace calls the app, and the name npm publishes it under: Workspace `@livedoc/cli` (private);
  `build.mjs` writes `dist/package.json` under the same name, published as `@livedoc/cli` in the `livedoc` npm
  organisation (the unscoped `livedoc` and the `livedocs` scope belong to others) with the command `livedoc`; CI
  publishes from `dist`, outside the workspace globs; `NPM_PACKAGE` and `UPGRADE_HINT` in
  `apps/cli/src/config/version.ts` name it in every hint (default).
- **CLI2** How the one ESM file is built: esbuild (already the root's), `platform: node`, `target: node22`,
  `#!/usr/bin/env node`, to `dist/livedoc.mjs`; render code reached only through `import()` so it is evaluated only when
  a render runs (default).
- **CLI3** How CI publishes with provenance: `.github/workflows/cli-publish.yml` on push to main when
  `apps/cli/package.json`'s version changes, and by hand; npm trusted publishing (OIDC, `id-token: write`) with
  `--provenance --access public`; skipped when that version is already on npm; every PR runs `npm pack --dry-run` on
  `dist` (default).
- **CLI4** Which keychain, and how a missing one degrades: The platform's own tool, no native code: macOS `security -i`
  (the add command on stdin), `secret-tool store` (the token on stdin), Windows PowerShell `ConvertFrom-SecureString`
  (DPAPI, the token on stdin, the blob kept in the file); service `livedoc`, account the profile name; a missing or
  refusing tool stores in the file with one notice (default).
- **CLI5** Where cache and state live, and whether XDG variables count: Config in `$XDG_CONFIG_HOME/livedoc` else
  `~/.config/livedoc`; cache and state in `$XDG_CACHE_HOME/livedoc` else `~/.cache/livedoc` (default).
- **CLI6** How `config.toml` is parsed: Read by hand in `apps/cli/src/config/config-file.ts`: top-level `key = value`
  lines and `[profiles.<name>]` tables, strings quoted, booleans bare; a line that does not read is a usage error naming
  the file and line; unknown keys ignored and logged under debug.
  The link file needs a full parser (RL1) (default).
- **CLI7** How flags, env and config combine, and what `--host` alone means: Flags over env over `default_profile` over
  a built-in profile `default` at `https://docs.nu`; `--host` with `--profile` is exit 2; `--host` alone picks the first
  profile with that host, else an unnamed profile with no stored credential (default).
- **CLI8** How long capabilities are trusted: One hour per profile in `<cache>/capabilities/<profile>.json`, so a raised
  floor lands within the hour (default).
- **CLI9** Where the api base comes from: The api answers `${url.origin}/api` from the request (the router forwards
  `/api` as is), so no new variable (default).
- **CLI10** What the new api settings are called: `OAUTH_ISSUER` in the hosted profile (`hosted-vars.json`),
  `CLI_MIN_VERSION` in `[vars]`; unset or malformed leaves the field out (default).
- **CLI11** What "whether sign-in exists" reads: `authEnabled` is true when sign-in is on (`identityConfigOf`), the same
  gate tokens use (default).
- **CLI12** How versions compare: Numeric major, minor, patch; a prerelease suffix is ignored (default).
- **CLI13** Which commands the floor refuses, and with which exit: Verbs whose behaviour is `write` or `destructive` and
  that reach the api (`api` with a method other than GET included); exit 1 (default).
- **CLI14** Which answers map to which exit code: 400, 405, 413, 422 to 1; 401, 403 to 4; 404, 410 to 3; 409, 412 to 5;
  429 to 6; 5xx, timeout, network to 7 (default).
- **CLI15** Whether a bad flag value is a usage error or a rejection: Unknown words or flags, missing positionals and
  type mismatches exit 2; enum, range and length failures exit 1 naming valid values; operation words from argv that
  fail to parse exit 2, from a file 1 (default).
- **CLI16** What an unexpected exception exits with: 7, with `error: internal error (<ErrorName>)` and a hint to rerun
  with `LIVEDOC_DEBUG=1` and report it (default).
- **CLI17** How `--json` takes an optional field list: `--json=a,b`, or a following word whose every comma-separated
  name is one of the verb's output fields; anything else is a positional (default).
- **CLI18** What `--json` prints for lists and errors: The verb's output object (the MCP's structured content); fields
  pick keys of the object or of each list item; with `--json`, errors are one JSON object on stderr (default).
- **CLI19** List size and where the left-out line goes: Default 20, at most 200; the footer is the list's last stdout
  line in text, on stderr with `-q`, a `more` count in JSON; an empty list prints `no <things>` on stdout (default).
- **CLI20** The order and minimum length of document addressing: URL, then a 36-character id read directly, then the
  swept list: id prefixes of at least 4 and names equal ignoring case, the union deciding; the printed ref is the
  shortest unique prefix of at least 4 (default).
- **CLI21** A pasted URL from another origin than the profile's host: Exit 2, hint `--host <origin>` (default).
- **CLI22** How `--tab` matches: Name equal ignoring case, or an id prefix of at least 4; absent is the first by
  `orderIndex` (default).
- **CLI23** How an element command's words become one operation: The verb name, then each word, re-quoted when it holds
  whitespace, quotes or backslashes (the value after `key=`, `key:` or `key~` when present); `connect <a> <b>` inserts
  the `->` so the shell never sees it (default).
- **CLI24** When a read copy is taken: After every `tab view` (the plain tab read beside the view, revisions agreeing by
  `ETag`), `--raw`, `tab diff`, `pull`, and after a write that rebased over nothing (one plain read); a rebased write
  keeps the older copy (default).
- **CLI25** How `--wait-held` retries: Every 2 s until the given seconds have passed since the first attempt, then exit
  5; at most 3600 s (`WAIT_HELD_MAX_S`, as `wait`) (default).
- **CLI26** Who writes the footer and its revert command: The api, with `formatResultFooter` and `livedoc changeset revert <documentId> <changeset-id>`:
  one footer for the CLI and the MCP, and a full id resolves without the sweep; the CLI prints the api's text (default).
- **CLI27** The pull file's shape and name: The editor's `livedoc.document` envelope plus `livedocSync { host, pulledAt, tabs: { rev, hash } }`;
  `<slug>.livedoc.json` with the name lower-cased to `[a-z0-9-]`, at most 60 characters, the id's first 8 when empty,
  `-<id8>` on a clash with another document; `--svg` writes `<slug>.<tab-slug>.svg`; temporary file then rename
  (default).
- **CLI28** How push tells changed tabs and what it rewrites: A tab's elements changed when the SHA-256 of their
  canonical JSON (keys sorted) differs from the pulled `hash`; sent as `replace { elements }` with the pulled revision
  and `strict`.
  Every other field is hashed apart (`settingsHash`): a change there prints `not pushed: the name, theme or background of tab "<name>"`.
  A tab missing from the document is created with no base; a pulled tab gone from the file prints `not pushed: removing tab <id>`.
  The file's revision and elements hash are updated for tabs that landed; its settings hash stays as pulled, so an
  unsent rename is named on every push until the file is pulled again (default).
- **CLI29** Export's paths, default format and pacing: Default `json`; `<dir>/<slug>.livedoc.json`,
  `<dir>/<slug>/<tab-slug>.{svg,png,mmd,md}`; two documents at a time; a 429 retried after 60 s up to three times
  (default).
- **CLI30** Preview scale and what "its size" prints: Scale 1, as the MCP renders; `<path> <width>×<height> · <n> KB`
  (default).
- **CLI31** How the PNG renderer gets its wasm and font in two runtimes: `createPngRenderer({ wasm, font })` with
  injected loaders: module imports in the Worker, files beside the bundle in Node (default).
- **CLI32** How the listening socket behaves: It never sends `hello` or any frame, so it is no session in anyone's
  roster; reconnects with a fresh ticket from 1 s doubling to 30 s (default).
- **CLI33** The lines `wait` and `watch` print: `wait --for comment`: the thread's lines from `GET .../comments`; a
  change: `tab "<name>" changed · rev <a>→<b> · diff: livedoc tab diff <doc> --tab <t> --since <a>`, `<a>` the latest
  read copy's revision (the hint left out without one); `watch`: `changeset <id> by <name>: "<summary>" (+a ~c -r)`,
  `element <ref> added\|changed\|removed`, `comment on <ref> by <name>: "<text>"`, `tab "<name>" added\|renamed\|removed`,
  `document renamed "<name>"` (default).
- **CLI34** How login opens the browser and whether it ever switches flow: `open`, `xdg-open` or `rundll32 url.dll,FileProtocolHandler`
  (never a shell: `cmd /c start` splits a URL at `&`); the URL is always printed to stderr; never an automatic switch to
  the device flow (default).
- **CLI35** The loopback path and the built-in client's redirect URIs: `/callback`; `http://127.0.0.1/callback` and
  `http://[::1]/callback`, matched on any port (default).
- **CLI36** The device grant's parameters: Built-in clients only; device code 32 random bytes; user code 8 letters of
  the RFC alphabet shown `XXXX-XXXX`; KV `device:<code>` and `usercode:<code>`, TTL 600 s; 20 starts an hour and 30
  lookups per 10 minutes per IP (default).
- **CLI37** Whether the device page links to help: No: no CLI help article exists; the CLI's README is its documentation
  (default).
- **CLI38** Logout with only an env token, a network failure, or a 401: Env only: exit 2 naming Settings › API Tokens;
  network: kept, exit 7; 401: forgotten, exit 0 (default).
- **CLI39** What `tokens/current` answers a session, and its fields: 405 for another method first; 403 `not_a_token` for
  a session or guest; 404 for a row revoked between resolution and the read (a dead token is 401 `invalid_token` at the
  front door); `{ accountId, accountName, tokenId, tokenName, role, expiresAt }`, the name from the owner's participant
  record (default).
- **CLI40** The credentials file's shape and a too-open mode: `{ version: 1, profiles }`, file 0600 in a 0700 directory;
  a looser mode warns and is set to 0600 (default).
- **CLI41** Telemetry's transport and edges: No `Authorization`; awaited at most 300 ms; a network failure is
  `Internal.<Verb>`; `telemetry on` sends `TelemetryOn` after writing; the telemetry verbs send no `Cli·Used`; the
  notice is recorded in `state.json` (default).
- **CLI42** Which `DO_NOT_TRACK` values opt out: Any value but empty or `0` (default).
- **CLI43** The update check's request and notice: `GET https://registry.npmjs.org/@livedoc/cli/latest`, 1.5 s; `CI` set
  and non-empty skips it; `checkedAt` stored whatever the answer; the notice names both versions and both install forms
  (default).
- **CLI44** How the CLI logs: Only under `LIVEDOC_DEBUG=1`, to stderr, `[cli]` fingerprints, `Authorization` redacted
  (default).
- **CLI45** How the api tells the CLI apart: `X-Livedoc-Client: cli` and `User-Agent: livedoc-cli/<v> node/<v> <platform>`
  (default).
- **CLI46** How long a request may take: 30 s, then exit 7 (default).
- **CLI47** Whether output is coloured: Never: the same bytes on a terminal and in a pipe (default).
- **CLI48** How help tokens are counted: `estimateTokens` of `@livedoc/document-views` (UTF-16 length over 3, rounded
  up), the views' own counter; stricter than o200k and no new dependency (default).
- **CLI49** Budgets for guide topics and the skill: 1,200 tokens a topic; 80 for the frontmatter; 1,500 for the body
  (research, agent-cli-ergonomics §4.2) (default).
- **CLI50** Which aliases exist: `doc`, `el` and `edit` only; no hidden long forms (default).
- **CLI51** How suggestions are found: Damerau-Levenshtein distance at most 2, the closest three (default).
- **CLI52** Where `skill install` writes and what it may overwrite: `<dir>/livedoc/SKILL.md`; only a file whose
  frontmatter `name` is `livedoc`, else exit 1 (default).
- **CLI53** How `api` reads its path: Relative to the api base, a leading `/api` dropped; an absolute URL, or a `PUT` of
  a tab, is exit 2; the body printed as sent, the status on stderr when not 2xx (default).
- **CLI54** How large the package may grow: 8 MiB unpacked, checked by the build test (default).
- **CLI55** How Node-only verbs sit in an isomorphic catalogue: Declared in `@livedoc/agent-verbs` with `local: true`
  and no `run`; `apps/cli` supplies the handler; a test fails on a local verb without one (default).
- **CLI56** How the dashboard shows `Cli·Used`: A `CLI Commands` stack in Connections, one chart per CLI verb, beside
  `MCP Tool Calls`; computed sites and sentences declared (default).
- **CLI57** The error text's shape: `error: <what>`, two-space-indented candidates, `hint: <one command>` (default).
- **CLI58** The new tab's id, and `tab add` with no source: `crypto.randomUUID()`; an empty tab through `replace { elements: [] }`
  (default).
- **CLI59** `tab ls`'s line: `<position> <ref> "<name>"` (default).
- **CLI60** `document ls`'s line and date: `<ref> "<name>" <library> <YYYY-MM-DD>`, UTC, so two calls print alike
  (default).
- **CLI61** `wait`'s default and longest timeout: 600 s and 3,600 s (default).
- **CLI62** Whether `--summary` is checked before sending: Yes, against `CHANGESET_SUMMARY_MAX` from
  `@livedoc/api-schema`; over it is exit 1 (default).
- **CLI63** Where the CLI gets `isApiTokenFormat`: Moved to `@livedoc/api-schema`; the api imports it from there
  (default).
- **CLI64** How the CLI reuses the editor's envelope and Markdown export: `export-document-text.ts` and
  `export-tab-text.ts` move to `@livedoc/document` (`git mv`); the editor imports them (default).
- **CLI65** The device page's states and copy: As listed under Presentation, in the consent page's shell and voice
  (default).
- **CLI66** Whether the CLI prompts on a terminal: Never, piped or not; stdin is read only for `-`, `--body -` and
  `--with-token` (default).
- **CLI67** Which WebSocket client the CLI uses: Node 22's global `WebSocket`; the URL is the api base with `https`
  turned to `wss` (default).
- **CLI68** How a contributor runs the CLI: `pnpm --filter @livedoc/cli build`, then `node apps/cli/dist/livedoc.mjs`;
  turbo's `build` includes it (default).
- **CLI69** How flags reach a view and how JSON and the revision are read: The document views' query: `view`, `budget`,
  `only`, `coarse=1`, `style=1`, `ref` (from `--ref`), `q` (from `--text`), `all=1` (from `--all`), `json=1` (from
  `--json`); the revision from `ETag` (default).
- **CLI70** How the CLI reads a pulled file's views offline: A `<doc>` that is an existing `*.livedoc.json` path is that
  pull file, read-only: `document view`, `tab ls` and `tab view` render with `renderView` locally; any other verb exits
  2 (default).
- **CLI71** How `classifySource` tells a `-f` file apart: Whole-text JSON: an object with `nodes` is a graph, with
  `replace` a replace, with `op` an operation; an array of operations (every item has `op`) is operations, any other
  array elements; else a first meaningful line opening with a header `graphFromMermaid` accepts is Mermaid; else edit
  operations (line form or JSON lines); unparseable JSON objects of neither kind are unknown, exit 1 (default).
- **CLI72** Who may read the catalogue routes, and their caching: No identity, `GET` only, `Cache-Control: public, max-age=300`,
  logged `[catalogues]` (default).
- **CLI73** Where the schema text is generated: `packages/edit-operations/src/element-format.ts`:
  `elementFormatText(kind)` read off the engine's factories, aliases and value lists, so it says what `add` and `set`
  accept; `elementSchemaDoc()` stays the MCP's, its prose being the MCP resource; 300 tokens a kind (research §4.2)
  (default).
- **CLI74** How icon search ranks and what it searches: `paletteRank` and `matches` move from `apps/live/lib/search.ts`
  to `packages/icons/src/search-rank.ts`, `searchIcons` on the `./search` subpath; the line-art and Technology
  catalogues, label then keywords, ties in catalogue order; default 20, at most 50, a query of 1 to 60 characters
  (default).
- **CLI75** `document create`'s id, empty tab and tab name: The CLI mints the id with `crypto.randomUUID()`
  (`VerbContext.newId`); without `-f` or `--template` one tab of `elements: []`; `--tab` defaults to the document's
  name; the api derives the intent from what it compiles (`creationIntentOf` of the first compiled tab); a file of edit
  operations is refused (they change a tab that exists); the printed ref is the id's first 8 characters (default).
- **CLI76** How read copies are stored and bounded: `<cache>/copies/<first 16 hex of SHA-256 of profile, document, tab>/<rev>.json`
  with an index; 3 revisions a tab, 32 MiB in all, least recently used out; files 0600 in 0700 directories (default).
- **CLI77** How the consent page knows a CLI sign-in: `GET /oauth/session/:id` adds the public `clientId`, used for the
  telemetry type only (default).
- **CLI78** Which comment id the thread verbs send, and an element with no thread: The thread's last comment's id; no
  thread exits 3 `no thread on <ref>` (default).
- **CLI79** `tab diff --since` a revision with no read copy: Exit 3 naming the revisions held (default).
- **CLI80** How long `wait --for change` waits for a burst to end: 2 s without another change (default).
- **CLI81** How `comment ls` prints a thread across tabs: The comments view's thread line without the kind, with ` · tab "<name>"`;
  its comments as the view prints them (`threadListingLines`) (default).
- **CLI82** How the top-level help stays within its budget: Grouped rows, as the final copy: `wait, watch` share one,
  `edit` shows as `apply (edit)` in the changeset row, and template, icon, schema, guide, skill, api, auth and telemetry
  are named on one line (default).
- **CLI83** `push`'s exit when tabs fail in different ways: 5 when any tab was stale, whatever else failed; else the
  highest exit among the other failures; each failure prints its error and the rest still go (default).
- **CLI84** What `export --all` does when one document fails: Prints that document's error, exports the rest, and exits
  with the highest failure's code; the totals count what was written (default).
- **CLI85** How siblings of one name are told apart when their short ids are alike too: The whole id instead of its
  first 8 characters (default).
- **CLI86** How `folder ls` prints the person's folders as paths: One line a folder, `<id> <path> <library>`, personal
  first then each joined team by name, depth first, siblings by name: `link init`'s own order (`folderChoices`)
  (default).
- **CLI87** Where `folder create` files a folder and what it prints: `--in` resolved as `link init --folder`; a team
  folder parent files it in that team; none, at the top of My Documents.
  Text `+ folder <ref> "<path>"`, `--json` `{ id, path }` (default).
- **CLI88** Which release a new command and a new flag make: A minor version (0.2.3 to 0.3.0): new commands, nothing
  removed (default).
