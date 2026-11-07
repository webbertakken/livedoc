# Diagram lint

**Status: built**, with the [CLI](../015-api/cli.md)'s `tab lint` and `graph lint` (`--compare`).
`@livedoc/diagram-lint` checks a tab; the api serves `?view=lint`, every changeset, dry run and revert carries
the verdict, and the MCP's write tools carry the summary line.

The **diagram lint** reports what is wrong with how a tab is drawn, as text an agent can act on without looking at
an image: about 100 tokens where a preview costs about 1,000, and usable by models that cannot see. On a measured
15-node architecture, grouping by tier gave 5 crossings and 2 arrows behind boxes, which only a check or a look could
reveal (`docs/research/agent-cli/authoring-from-scratch.md`).

## Findings

Each **lint finding** has a code, a severity, the refs involved and a fix phrased as a command or operation.

| Code                | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `box-overlap`       | error    | Two boxes that arrows connect partly overlap; one wholly inside another does not count                                                                                                                                                                                                                                                                                                                  |
| `arrow-dangling`    | error    | An arrow pinned to a missing element                                                                                                                                                                                                                                                                                                                                                                    |
| `arrow-behind-box`  | warning  | An arrow passes through a box it does not connect (not one drawn over boxes by choice, `routeBehind: false`)                                                                                                                                                                                                                                                                                            |
| `edge-crossings`    | warning  | More crossing arrow pairs than `LINT_CROSSINGS_PER_ARROW` × arrows (a line drawn over by choice, `routeBehind: false`, crosses by design and is not counted)                                                                                                                                                                                                                                            |
| `label-collision`   | warning  | An arrow label overlaps a box or another arrow's label, or another arrow's line strikes it through (a run along its own track aside); its fix says how many characters fit on the edge's longest run, or, with no box in the way (another label or a line), where along its own line it sits clear                                                                                                      |
| `label-overflow`    | warning  | A label needs more lines than its box holds, or a card's title or subtitle is cut short with an ellipsis                                                                                                                                                                                                                                                                                                |
| `node-isolated`     | warning  | A labelled shape with no arrows on a tab that is otherwise a graph (an unlabelled one is decoration: a key's sample, a card)                                                                                                                                                                                                                                                                            |
| `group-escape`      | warning  | A member lies outside its frame                                                                                                                                                                                                                                                                                                                                                                         |
| `group-split-edges` | info     | Most of a frame's arrows cross its border, when some run inside it (a frame none of whose arrows run inside is a role group, a services tier, split by design) and the flow does not pass through it (a pipeline stage: every arrow in from wholly before it and every arrow out to wholly after it, down or across)                                                                                    |
| `duplicate-label`   | info     | Two boxes share a label (a card's title and subtitle count too, so mirrored cards differ; event-storming notes other than domain events repeat by design and never count)                                                                                                                                                                                                                               |
| `flow-backwards`    | info     | Arrows point against the flow direction (not one that closes a loop: a retry runs back by design)                                                                                                                                                                                                                                                                                                       |
| `aspect-extreme`    | info     | The drawing is more than `LINT_MAX_ASPECT` times wider than tall, or the reverse, on a graph, or on a tab with no frames or lanes whose boxes some line joins (a board of columns and stickies is shaped by its design)                                                                                                                                                                                 |
| `colour-on-themed`  | info     | A fill or stroke the tab's theme would not paint, on an element the theme colours, bound to no preset or swatch (stickies, and a mind map's branch hues, excepted). A changeset's lint names only the colours that write set, never a template's own (a replace landing a template, or a template's tabs at `create_document`, name none); a template's scaffold layer and a Pages tab are never judged |
| `text-overflow`     | warning  | Two texts print over each other, on any tab (a board's column heading wrapped onto its subtitle); and on a Pages tab, a page's text needs more lines than its box holds (text on a page is its content, not a caption). Turned text and text on a curve are left out                                                                                                                                    |

- A fix never lays out shapes alone on a tab with frames or lanes: `layout` would leave the groups behind, so there a
  crossing fix reroutes an arrow, and the drawing's shape is the groups' to set.
- The error codes judge the diagram's graph. Boxes no arrow connects are decoration (an icon on a card, a sticker,
  a Venn circle) and may overlap by design; a line with both ends free is a drawing, not a broken arrow. The
  editor's templates use both and lint without errors.
- The group codes judge frames, not lanes. An element belongs to the smallest frame or lane holding its centre,
  the containment the views use.
- Whether the story reads is not linted; that is what the preview is for.

## Output

```text
5 crossings · 2 behind · 0 overlaps · 1317×1196 → 2 warnings, 1 info
W arrow-behind-box   orders→bus passes behind pay            fix: drop the groups, or lines: angled
W arrow-behind-box   bus→notify passes behind pay            fix: drop the groups, or lines: angled
I group-split-edges  core: 12 of 13 arrows cross its border  fix: group by ownership, or drop the groups
```

- One summary line, then one finding a line, refs first, each ending with its fix.
- `--compare direction,groups,lines` lays a graph source out in each variant and prints one line of measures each,
  marking the best.
- `--json` returns the findings as an array.
- `tab lint` and `graph lint` exit 1 when any finding is an error, else 0.

## Where it runs

- One pure package, `@livedoc/diagram-lint`, using the geometry `@livedoc/document` already has
  (`arrowRoutePoints`, `pathsCross`, `pathPassesThrough`, the element grid, refs and containment). It reads each line
  as drawn: ends sharing an anchor fanned apart as the renderers and the label pass place them, so a label sitting
  between two fanned lines is never called struck, and a spot it names for a struck label is clear on the drawing.
- Every changeset result's last line carries the lint verdict, `lint clean` or `lint 2 warnings, 1 info`
  ([Edit operations](edit-operations.md#results)); `tab lint` shows the findings. A changeset lints its whole result
  tab, not only what it touched.
- The api serves a stored tab's lint as a view, `GET /api/documents/:id/tabs/:tabId?view=lint`
  ([Document views](document-views.md)); the CLI's `tab lint` reads it.
- The CLI lints a graph or Mermaid file locally, before anything is written (`graph lint`).
- The MCP appends the summary line to the result of every tool that writes a tab's elements: `create_document`,
  `add_tab` and `update_document`. An `update_document` whose edit changed nothing records no changeset and so has
  no changeset lint: it reads the tab's lint view instead, so the answer still lists what is wrong with the tab.

## Properties

- **Deterministic**: the same tab gives the same findings in the same order, so one fixture pins each code.
- **Bounded**: above `LINT_MAX_ARROWS` arrows the pairwise crossing check (`edge-crossings`) is skipped and the
  summary says so; every other check runs.
- **Observable**: each run logs `[lint] run` with its counts, never content.

| Constant                   | Value | Why                                                       |
| -------------------------- | ----- | --------------------------------------------------------- |
| `LINT_CROSSINGS_PER_ARROW` | 0.25  | A few crossings in a dense graph are normal; many are not |
| `LINT_MAX_ASPECT`          | 3     | Beyond 3:1 a diagram reads badly on a screen and in a PNG |
| `LINT_MAX_ARROWS`          | 300   | Pairwise checks stay under a few milliseconds             |

## Invariants and edge cases

The invariants and edge cases the code and its tests cite by id.

- **N15** A custom tab theme: `colour-on-themed` is skipped and `[lint] theme unresolved` logs at debug.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **LN1** Whether elements on hidden layers are linted: Only visible elements are checked, as `mermaidFromTab` and the
  render do; the index and refs span every element, so a hidden end is not missing (default).
- **LN2** What a "box" is: A boxed element that is not a container, `text`, `annotation`, `freehand` or `path`: shapes,
  stickies, tables, images, link cards, videos (default).
- **LN3** How overlap and "wholly inside" are measured: On element rects, rotation included (separating axes), deeper
  than `LINT_OVERLAP_TOLERANCE_PX` = 2 (`PATH_INSIDE_INSET_PX`); silhouettes are not traced (default).
- **LN4** Which text measure the label checks use: `estimatedLabelMeasure` (0.55 em a character), the headless
  renderers' fallback lifted into a name, so the lint is deterministic and agrees with the previews (default).
- **LN5** How many lines a box "holds": `max(1, floor(labelRoom.height / (px × LABEL_LINE_HEIGHT)))`, only for boxes
  where `drawsStandardLabel` is true (default).
- **LN6** Whether a `scale` text size can overflow: No: it fits the box by design (default).
- **LN7** How rich text is measured: As its plain `label` at the element's base size (default).
- **LN8** Granularity of `arrow-behind-box` and `label-collision`: One finding per arrow listing every box; an arrow's
  own pinned ends are exempt from behind, not from label collision (default).
- **LN9** What `edge-crossings` reports: One finding for the tab; JSON refs every crossing arrow, most crossings first;
  the message names the top 3 and `+k` (default).
- **LN10** How the summary says crossings were skipped: `crossings skipped ({n} arrows)` in place of the crossing count;
  `skipped.crossings` in JSON (default).
- **LN11** When a tab is "otherwise a graph": At least 2 boxes are ends of connecting arrows and they are at least half
  of all boxes (default).
- **LN12** "Most" of a frame's arrows: More than half of at least 3 arrows touching a member; an arrow crosses when
  exactly one end is a member; membership is transitive through nested containers (default).
- **LN13** When a member "lies outside" its frame: Its rotated bounds reach past the first frame on its container chain
  by more than 2 px on any side (default).
- **LN14** When two labels are "the same": Equal after trim, whitespace collapse and lower-casing; blank never matches;
  one finding per label (default).
- **LN15** What the flow direction of a tab is: A graph source's `direction`; else the larger-axis class of at least 60%
  of at least 3 directed connecting arrows; backwards beyond 8 px; `from` reverses, `both`/`none` skipped (default).
- **LN16** What the drawing's extent is, and when aspect applies: `contentBounds` of visible elements with arrow routes
  and label plates; only with at least 3 boxes and both sides at least 1 px (default).
- **LN17** Which colours a theme "would paint": Its element fill or stroke, every palette and root entry, every
  per-shape override; both Default halves; a custom theme skips the check (default).
- **LN18** Order of findings: Severity, then code order, then reading position (top, then left) of the primary subject,
  then refs (default).
- **LN19** Text line layout: Severity letter, code padded to 17, message padded to the longest printed (max 48), then
  `fix: …` (default).
- **LN20** How long the text report may grow: At most 10 lines per code, then `… {n} more {code}`; JSON is never cut
  (default).
- **LN21** How labels are quoted in messages: Controls stripped, whitespace collapsed, cut at 40 characters with `…`,
  JSON-escaped (default).
- **LN22** Summary plurals and an empty drawing: `1 crossing`, `1 overlap`, `1 error`, `1 warning`, `{n} info`; nothing
  visible reads `empty` (default).
- **LN23** What happens when the lint throws: The write or tool call still succeeds; `[lint] failed` logs and `lint unavailable`
  stands in; the view answers 500 (default).
- **LN24** How the MCP appends the summary: A `lint` field in structured content plus a text block; `create_document`
  reads `?view=lint&json=1` per tab, one line each in `tabIds` order (default).
- **LN25** Where the lint's wire types live: `packages/api-schema/src/lint.ts`, as every DTO the api emits (default).
- **LN26** Value order and enumeration of `--compare`: Dimensions nested in the order named; `down, right`; `groups, no-groups`;
  `straight, angled, curved`; a source without groups has `no-groups` only (default).
- **LN27** What makes a variant "best": Fewest errors, then crossings plus behind, then warnings, then aspect nearest 1,
  then area, then enumeration order (default).
- **LN28** Arrow ids of a laid-out graph source: `e1`, `e2`, … in edge order, `-2` on a clash with a node id, so a graph
  lint is deterministic (default).
- **LN29** Wording of each code's fix: The fix catalogue: tab fixes are edit operations (`; ` sequence, `, or `
  alternatives, `<ref>`/`<text>` placeholders); graph fixes are source changes (default).
- **LN30** How the pure package logs: An injected `LintLogger`, default console; the CLI's debug logger writes to stderr
  only when debugging (default).
- **LN31** Which changeset paths are linted: Writes, dry runs and reverts; a rejected changeset is not linted (default).
- **LN32** Whether a lint report is stored: No: derived on each call; changeset rows do not carry it (default).
- **LN33** How estimated widths stay out of the label layout's word cache: `fontEpoch` = -1 (`LINT_MEASURE_EPOCH`), a
  key no browser uses (default).
- **LN34** How rotated boxes are found through the element grid: Every query rect grows by half the largest diagonal of
  any rotated box (default).
- **LN35** The concrete budget behind "a few milliseconds": 50 ms CPU for 300 boxes and 300 arrows, label pass included,
  as a measured aim; the test gates growth (4× the tab under 8× the CPU) (default).
- **LN36** Granularity of the per-element codes: One finding per pair (`box-overlap`), per box, per shape, per arrow,
  per frame or per element; one per tab for `edge-crossings` and `aspect-extreme` (default).
- **LN37** `--compare` on a stored tab: Refused as a usage error (exit 2): only a graph source has variants (default).
- **LN38** Shape of `--json`: The findings array, pretty-printed; with `--compare` the rows array (default).
- **LN39** What a theme paints where it leaves a colour to the element, and what counts as bound: The element type's own
  default on either surface; a colour stored by name (a marker colour) is a binding, so only hex values are judged
  (default).
- **LN40** A ref that is an edit-operations keyword (`back`, `frame`) in a fix: Printed as the views print it; such an
  id is reached as `id:"…"` (the engine never mints keywords as ids) (default).
