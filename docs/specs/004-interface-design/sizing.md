# Sizing

LiveDoc's chrome is drawn on **one sizing scale**: one compact set of type sizes, heights, gaps, side padding, radii
and icon sizes, the same on every surface of every app.
It is taken from the [office shell](office-shell.md)'s measured sizes, one step lower in height (Webber, 2026-11-21).
There is no density setting and no second scale: everyone sees the same sizes.
Power user mode keeps no denser rows of its own: a denser row for some people would be a density setting.
So the Explorer's half-height Details rows retired with that ruling (director, 2026-11-22).

Chrome is everything that is not content: toolbars, menus, rows, fields, buttons, dialogs, panels and pages' own text.
Content is never on the scale: elements and text on the canvas, a text document's page, a sheet's cells, a form as
respondents see it and a slide keep the sizes their author chose.

- A form as respondents see it is its title, description, questions, answer controls and its Finish look, wherever
  it is drawn: the page respondents fill in, Preview and the builder's picture of a question (D237, default).
- A form's own type is named once in `apps/live/app/forms.css` (`form-type-title`, `-lead`, `-section`, `-question`,
  `-note`, `-answer`), so the builder draws the same sizes as the page respondents fill in, off the scale.
- The form's chrome is on the scale: its status bar, strips, warnings and problems, Share Form, the Preview button,
  and the builder's own controls (add bar, settings, menus, destination pickers).
- A sheet's grid is content with everything drawn in it at the sheet's zoom: cells, row and column headers, the
  selection's labels, a rule's marks, card rows' buttons, the outline's group buttons, Add Rows and charts (D238,
  default).
- A sheet's tab window face is its picture, drawn as the sheet looks.
- A sheet's chrome is on the scale: its bars, menus, popovers and dialogs, and what floats over the grid (Smart Fill,
  Import CSV, a cell's tooltip).
- A Plan view's drawing is content, drawn at the canvas's zoom as a sheet's grid is: a Gantt's timeline, rows,
  bars and marks, a Calendar's day grid, the Priority Matrix's quadrants, Workload's bars and Status Mix (D240,
  default).
- A Plan view's frame is chrome on the scale: its header, legend, search, scale controls, Add Card and settings.
- A board's drawing is content in the same way: its columns' heads, its cards' faces, its cells and Add Card (D240).
- A board's or a sheet's header is chrome: its title the panel title's step, its icon buttons (Focus, Maximise,
  the cog) 28 px.
- A metric tile reads its name and line on the scale; its figure and picture are drawn art (D239).
- A board's header widgets are chrome: 28 px pills in a 36 px band, figures regular in the ink, not in weight.
- A widget's × is a 16 px mark with a 24 px reach, so it sits on the widget's corner yet meets the floor.
- The board picker's pictures of each board (`board-previews.tsx`) are drawn art.
- A card's panel is chrome: its title the dialog title's step, its tabs medium only when chosen.
- A card shown as a slide (`ItemSlideView`) is a slide, so it is content and keeps its own sizes.
- A Dashboard tab is a page, never zoomed, so it is chrome on the scale: its cards' names, lines and controls, its
  slots' toolbars and its menus (D239, default).
- A dashboard's Title card is the page's title (`text-page-title`, its line `text-body`); a Note card's title is a
  section's (`text-panel-title`).
- Drawn art keeps its own sizes, as a switch does: Add to Slot's pictures of a card, and a metric tile's figure and
  picture, which grow with the tile ([Metric tiles](../026-plan/plan-tabs.md#metric-tiles)), and a Key Date's count.
- A dashboard's figures are named once in `apps/live/app/dashboard.css` (`dashboard-figure`), off the scale: 34 px,
  unless a tile that grows its figure with its size sets its own; a tile's sparkline is its picture.
- A metric's name reads at 14 px as written, beside its 28 px glyph.
- A card's top line keeps clear of the slot's menu by a margin (`CLEAR_OF_SLOT_MENU`), never by side padding.
- A slot is a surface (`rounded-surface`), its toolbar's controls 28 px; its grip and a row's resize band are
  24 px, the floor for anything pressable.

## Why

- **One reading size.** Everything read or pressed is 14 px on a 20 px line, and 12 px is the only smaller step.
- **Weight is rare, so it means something.** Text is regular; medium marks the control that is pressed, selected or
  primary, so it stands out from the rest.
- **A short ladder of heights, one job each.** Controls that sit together share a height, so their lines agree.
- **Big type in tight boxes.** A 28 px control holds 14 px type: height goes to what is read, not to frames.
- **Few icon sizes.** Icons that share a row share a size, so their ink lines up without help.

## The scale

Each step is a theme token in the shared theme (`packages/tailwind-config/theme.css`), named after its job.
A surface names the token, never the number, so the scale changes in one place.

### Type

| Token               | Size on line | Job                                                                   |
| ------------------- | ------------ | --------------------------------------------------------------------- |
| `text-glyph`        | 10 on 12     | A glyph, never words: a key hint, a count in a badge                  |
| `text-supporting`   | 12 on 16     | Supporting text: a description, a hint under a field, a timestamp     |
| `text-body`         | 14 on 20     | Everything read or pressed: labels, menu items, rows, fields, buttons |
| `text-panel-title`  | 16 on 24     | A panel's or a section's title                                        |
| `text-name`         | 18 on 26     | A document's name in its title row                                    |
| `text-dialog-title` | 22 on 28     | A dialog's title                                                      |
| `text-page-title`   | 24 on 32     | A page's title (the Explorer's panes, Settings' pages)                |

- **Weight** is regular (400) by default.
- Medium (500) marks a pressed, selected or primary control, and nothing else.
- **Headings are regular** (Webber, 2026-11-21): size alone carries the hierarchy, as the shell's dialog title does.
- **No tracked capitals**: a label reads as its copy is written (a menu item or a button in Title Case), never set in
  capitals with wide letter spacing.
- Nothing in the chrome reads under 12 px; 10 px is for a glyph only.

### Heights

| Token       | Height | Job                                                                      |
| ----------- | ------ | ------------------------------------------------------------------------ |
| `chip`      | 24     | The floor: a menu bar item, a chip, a small icon button                  |
| `row`       | 28     | A row (menu item, list row, tree row), a toolbar control, an icon button |
| `field`     | 32     | A field, a button; a canvas drawing tool                                 |
| `prominent` | 36     | A primary action; the band around a toolbar of 28 px controls            |

- A row is 28 px whatever it held before: a list of rows has one rhythm.
- A picture in a row (a document's thumbnail) is the chip step's height, so the row keeps its 28 px.
- A row's `⋯` is the chip step, so it sits inside the row with room around it.
- **A canvas drawing tool is 32 px** (Webber, 2026-11-21), the one exception to the 28 px toolbar control.
- The tools are the most pressed controls in the product, pressed mid-gesture and often with a pen that reports as
  a fine pointer, so they keep one step more.
- Nothing pressable is drawn under 24 px on a fine pointer
  ([WCAG 2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum)).
- A height token reads as `h-row`, `min-h-row` or `size-row`; a square control takes its step on both sides
  (`size-row` is a 28 px icon button).

### Icons

| Token          | Size | Job                                 |
| -------------- | ---- | ----------------------------------- |
| `icon-chevron` | 12   | A chevron or a disclosure caret     |
| `icon-row`     | 16   | An icon in a row, a menu or a field |
| `icon-toolbar` | 18   | An icon in a toolbar control        |
| `icon-title`   | 20   | An icon in a title row              |

- An icon takes its size as a square: `size-icon-row`.

### Shapes

- A popover's arrow is one drawn size wherever it points: `size-arrow`, 12 px.
- A count badge sits where an icon would: 16 or 18 px (`size-icon-row`, `size-icon-toolbar`), its figure in
  `text-glyph`.
- A switch's track and knob are drawn art, sized by the switch itself; the row that holds a switch is on the scale.
- A colour's drawn parts take the icon steps: a swatch's chip 16 or 20 px, the picker's handle and hue track 12 px
  (D236, default).
- A colour swatch button is the chip step, 24 px, so a row of swatches keeps the chip rhythm.

### Gaps, padding and radii

- **Gaps** step 2 (inside a group), 4, 8, 12, 16 and 24 px.
- **Side padding** steps 8, 12, 16 and 24 px; a control's height comes from its height token, not from padding.
- A track or a band inset around its controls steps 2 or 4 px (a segmented track, a stepper, the toolbar band).
- **Radii** are named after what they round:

| Token     | Radius | Job                           |
| --------- | ------ | ----------------------------- |
| `control` | 6      | A control: button, field, row |
| `menu`    | 8      | A menu or a popover           |
| `surface` | 12     | A dialog, a card, a panel     |
| `full`    | pill   | A pill or a round button      |

- A radius reads as `rounded-control`, or on one side or corner as `rounded-t-surface`; square is `rounded-none`.
- A part that follows its parent's corners takes `rounded-[inherit]`: the parent names the step.

## Touch

- Touch keeps what it has: a control's tap area is 44 px on a coarse pointer ([Touch targets](touch-targets.md)).
- The scale sets what is drawn; the 44 px pad and the touch-only sizes (44 px rows, 16 px fields) sit on top of it.
- A size set only under a coarse pointer (`pointer-coarse:`) is touch's, not the scale's.

## UI scale

- [UI scale](../007-editor/ui-scale.md) is a person's own preference that multiplies the scale on the surfaces it
  covers; it is not a density setting and its default (100%) draws the scale as written.
- A token is the size drawn at that default: no chrome carries a zoom of its own on top of it (default).
- The top line's 100% draws at 115%, UI scale's own base for it, so its tokens draw 1.15 times larger (D241).

## The editor's toolbars

- Every editor toolbar is a [toolbar group](toolbar-group.md): 28 px controls (`h-row`) in a 36 px band, its
  4 px inset inside a hairline.
- The top line is where the drawing tools sit: the brand group, the Palette strip or Draw's dock, and the actions
  group.
- Its controls take the drawing tool's 32 px (`h-field`), so the line reads as one height (D242, default).
- Draw's dock holds drawing tools wherever it sits, so its controls are 32 px at the bottom too.
- The palette's menus are chrome on the scale; their pictures are drawn art: animation previews, the palette's own
  glyphs and the Sankey menu's pictures.
- The sign-in stage's pitch (`AuthStage`) is display type, as the marketing site's hero, and moves with the other
  apps (slice 7); its form, card and title are on the scale (`auth-card.ts`).
- The bottom line and every other toolbar group keep the 28 px control.
- A toolbar control's label reads `text-body`, regular; medium marks it only while it is pressed or chosen.
- A tool's key hint is a glyph (`text-glyph`) in the tile's corner; a toolbar icon is `size-icon-toolbar`.
- So a drawing tool draws 37 px at the default, and the top line 48 px, as in the render Webber ruled on.

## The guard

- A static guard, the **sizing guard** (`packages/tailwind-config`), refuses a size that is off the scale in a folder
  or file that has moved to it; each app's own `sizing-guard.test.ts` runs it over that app's moved paths.
- It refuses a type size, a weight, tracked capitals, a height, an icon size, a gap, a side padding or a radius that
  is not a step above, and names the token to use instead.
- Tracked capitals are `uppercase`, a `tracking-` wider than normal, and `text-optical-caps`, the capitals of
  [Optical alignment](optical-alignment.md) (D42), which sets uppercase with its tracking.
- A type size, a height, an icon size or a radius is named by its token, even when its number is on the scale.
- A gap or a side padding is named by its number (`gap-2`, `px-3`), which must be a step.
- A box under 12 px or over 36 px (a hairline, a dot, an avatar, a panel) is layout, not the scale, and passes.
- It reads class strings only; sizes set under a coarse pointer are touch's and pass.
- A field reads 16 px on a phone, so iOS never zooms in on it (`globals.css`); a picker drawn as a button among
  fields takes the same floor (`max-sm:text-[16px]`), and that alone passes under a width.
- The paths it covers grow as each surface moves to the scale, and in the end cover every app.
- A moved folder may name exceptions: drawn art, or a part that moves with a later group; a stale one fails the run.

## How it rolls out

The scale reaches the product one group of surfaces at a time, type and boxes together, each fitted once.
The order and its reasons are in plan 0024 (Rollout).

1. The scale written down: the tokens, this spec and the guard; nothing visible changes.
2. The shared parts: buttons, fields, menus and dialogs' frames in `packages/ui` and the editor's primitives.
3. The Explorer, home and the new document page.
4. Dialogs and panels.
5. The other tab kinds' own chrome: Plan, Sheets, Forms, notes.
6. The canvas chrome: the editor's toolbars, palette, tab bar and selection toolbar, last.
7. The other apps (help, marketing, telemetry), with the guard everywhere.

Until a surface moves, it keeps its own sizes; this spec describes the surfaces that have moved.

## Share roles

The scale is presentation only.
An Editor, a Participant and a Viewer see the same sizes; what each may do with a control is that control's rule.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D231** The glyph step's line: 10 px on a 12 px line, the smallest line that holds a key hint's ascenders
  (default).
- **D232** The tokens' names: each step is named after its job (`row`, `field`, `icon-toolbar`), not its number, so
  a surface reads as what it is and the number can change in one place (default).
- **D233** Where the zoom stands: a token is the size drawn on screen at the default UI scale, so no chrome carries
  a zoom of its own (default).
- **D241** The top line's 115% base stays: it is UI scale's default for that line, a person's preference with its own
  slider, not a zoom of the chrome's, and the ruled render drew 32 px tools at 37 px with it (default).
- **D242** The top line has one height: its groups' controls take the drawing tool's 32 px, as the ruled render drew
  them, rather than 28 px controls in shorter cards beside the strip (default).
- **D234** What the guard reads: every static string in a source file outside tests, so a size in a constant (a
  variant table, a shared class list) is held to the scale as one in markup is (default).
- **D235** The tokens' unit: rem at a 16 px root, so a browser set to larger text grows the chrome with it (default).
- **D236** A colour's drawn parts: a swatch's chip, the picker's handle and its hue track take the icon steps (16 or
  20, 12 px), the nearest to what they drew, rather than sizes of their own (default).
- **D237** A form as respondents see it is content: [Forms](../030-forms/forms.md#building-a-form) draws it in the
  Form tab exactly as it is filled in, with its own Finish look, so its answer controls and the page respondents
  fill in keep their own sizes (default).
- **D238** A sheet's grid is content: it zooms as one surface and its rows set its headers' heights, so what is
  drawn in it keeps the sizes the grid gives it, as a canvas's elements do (default).
- **D239** A Dashboard tab is chrome: it is drawn as a page the canvas never zooms, so what it reads is on the
  scale, but for drawn art that grows with its tile or frame (default).
- **D240** A Plan view's or a board's drawing is content: it zooms with the canvas and lays its rows, days,
  quadrants, columns and cards out at the sizes it draws, so what is drawn in it keeps them, as a sheet's grid does
  (default).
