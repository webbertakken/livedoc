// The canvas toolbars' items on a phone (docs/specs/007-editor/toolbar-layout.md "On a phone"):
// their pickers give up 4px of side padding, so more tiles show beside the menu card, and every
// item (the field step on the strip, the row step elsewhere) gets a 44px-tall tap area on a touch
// screen (`touch-target-y`, vertical only: the items sit 2px apart, so a sideways pad would steal its
// neighbour's taps). What is drawn stays the scale's. Set on a toolbar's card, it reaches the items
// inside by their size classes, so no item needs a phone-only prop of its own. Menus portal out of
// the card (or use their own row classes), so they are untouched.
export const PHONE_TOOLBAR_ITEMS =
  'phone:[&_.px-2]:px-1 [&_.h-field]:relative [&_.h-field]:touch-target-y [&_.h-row]:relative [&_.h-row]:touch-target-y';
