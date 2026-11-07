# Toolbar group

A **toolbar group** is the one container every editor toolbar is drawn in: the Palette strip, Sketch mode's dock,
the brand group, the top-right actions, the bottom-left tools and the bottom-right document group
([Toolbar layout](../007-editor/toolbar-layout.md#the-two-lines)). They look alike so the chrome reads as one set of
tools, never as a header, a footer and some floating cards.

## Look

- **The palette strip's surface**: a 12 px radius (`rounded-xl`), a 1 px hairline border (slate-200, slate-700 in
  dark), white (slate-900 in dark), 4 px padding, a soft shadow (`shadow-md`, slate-900/5, slate-950/40 in dark).
- **One height**: 36 px buttons (`h-9`), so every group is 46 px tall with its padding and border. A touch screen
  widens each button's hit area to 44 px without changing what is drawn (`touch-target-y`,
  [Touch targets](touch-targets.md)).
- **Buttons** inside are flat: 6 px radius (`rounded-md`), no border of their own, a slate-100 (slate-800 in dark)
  hover fill; an icon button is 36 px square, a labelled one pads its label 10–12 px.
- **Parts of one group** are split by a **divider**: a 1 px slate-200 (slate-700) rule, 24 px tall, 2 px either
  side.
- **Pressed or current**, a button takes the tint the palette's pressed tile has; a group never nests a bordered box
  inside it (the active tab is a tinted segment, not a pill with its own border).
- Text sits on the group's centre line: every child is centred on the cross axis, and a label is trimmed to its cap
  band (`text-optical-centre`, [Optical alignment](optical-alignment.md)), so a 28 px badge, a 19 px pill and a 13 px
  label all centre on the same line.

## Where it is used

- The editor's top and bottom lines, every group on them ([Toolbar layout](../007-editor/toolbar-layout.md#the-two-lines)).
- Nowhere else: panels (the Map, Quick style, AI, the tool panels) keep the panel surface
  ([Panel docking](../007-editor/panel-docking.md)), and menus keep the menu surface ([Menus](menus.md)).

## Share roles

The group is presentation only. What each button offers an Editor, a Participant and a Viewer is the button's own
rule; a group with nothing left to show for the session is not drawn.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D74** How a divider knows a part before it rendered: By CSS on the part (`:not(:empty)` sibling), so a part whose
  control draws nothing leaves no divider behind (default).
- **D75** Whether a labelled group is a landmark: A `toolbar` with its name, never a landmark region: the lines are
  controls over the canvas, not page sections (default).
