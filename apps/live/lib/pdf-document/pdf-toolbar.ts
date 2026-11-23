// A PDF document's toolbar (docs/specs/035-pdf-documents/reading-surface.md "The toolbar"), as the office shell's data
// (office-shell.md "Toolbar"): the first groups are every mode's, the rest the mode's own. The spec's table is its
// source, held to it by pdf-menus-spec.test.ts. A control that runs a menu item shares its id; one that will open a
// list of its own has an id of its own. A control whose phase has not landed is `comingSoon`, drawn dimmed.
import type { IconPrim } from '@livedoc/icons';
import {
  lucideBaseline,
  lucideBold,
  lucideBookOpen,
  lucideCheck,
  lucideHand,
  lucideHighlighter,
  lucideImage,
  lucideItalic,
  lucideLayoutGrid,
  lucideLink,
  lucideMessageSquarePlus,
  lucideMinus,
  lucideMoon,
  lucideMousePointer2,
  lucidePalette,
  lucidePencilLine,
  lucidePrinter,
  lucideRedo2,
  lucideRotateCwSquare,
  lucideSearch,
  lucideShapes,
  lucideSignature,
  lucideSquareDashedMousePointer,
  lucideStamp,
  lucideTextAlignStart,
  lucideTextCursorInput,
  lucideType,
  lucideUnderline,
  lucideUndo2,
} from '@livedoc/icons/lucide';
import type { AccessLevel } from '@livedoc/api-schema';
import type { OfficeControl, OfficeToolbar, OfficeToolbarGroup } from '@/lib/office/office-toolbar';
import {
  DARK_PAGES,
  EDIT_OBJECTS,
  EDIT_TEXT,
  FIND,
  INSERT_COMMENT,
  INSERT_LINK,
  INSERT_PICTURE,
  INSERT_TEXT_BOX,
  ORGANISE_PAGES,
  PRINT,
  REDO,
  ROTATE_VIEW_CLOCKWISE,
  TOOL_DRAWING,
  TOOL_HAND,
  TOOL_HIGHLIGHT,
  TOOL_SELECT,
  TOOL_TEXT,
  TOOL_TICK,
  UNDO,
} from './pdf-menus';
import type { PdfMode } from './pdf-modes';

type Icon = readonly IconPrim[];
type Options = Partial<Pick<OfficeControl, 'status' | 'shortcut'>>;

/** A press. */
const button = (
  id: string,
  label: string,
  level: AccessLevel,
  icon: Icon,
  options: Options = {},
): OfficeControl => ({
  id,
  label,
  level,
  status: 'comingSoon',
  look: { kind: 'icon', icon },
  ...options,
});

/** A tool in hand, or a state that is on or off: pressed while it is. */
const toggle = (
  id: string,
  label: string,
  level: AccessLevel,
  icon: Icon,
  options: Options = {},
): OfficeControl => ({
  id,
  label,
  level,
  status: 'comingSoon',
  look: { kind: 'icon', icon, toggle: true },
  ...options,
});

/** A glyph that opens a list of its own. */
const list = (id: string, label: string, level: AccessLevel, icon: Icon): OfficeControl => ({
  id,
  label,
  level,
  status: 'comingSoon',
  look: { kind: 'icon', icon, menu: true },
});

const group = (id: string, label: string, controls: OfficeControl[]): OfficeToolbarGroup => ({
  id,
  label,
  controls,
});

const BUILT = { status: 'built' } as const;

/** The Viewing toolbar's Page display: a list of View > Page display's items. */
export const PAGE_DISPLAY_CONTROL = 'page-display-control';

// "Every mode".
const EVERY_MODE: OfficeToolbar = [
  group('history', 'History', [
    button(UNDO, 'Undo', 'participate', lucideUndo2, { ...BUILT, shortcut: 'undo' }),
    button(REDO, 'Redo', 'participate', lucideRedo2, { ...BUILT, shortcut: 'redo' }),
  ]),
  group('file', 'File', [
    button(PRINT, 'Print', 'view', lucidePrinter),
    button(FIND, 'Find', 'view', lucideSearch),
  ]),
  group('pointer', 'Pointer', [
    toggle(TOOL_SELECT, 'Select', 'view', lucideMousePointer2, BUILT),
    toggle(TOOL_HAND, 'Hand', 'view', lucideHand),
  ]),
];

// The mode's own, each control at the level its mode is drawn for.
const OWN: Readonly<Record<PdfMode, OfficeToolbar>> = {
  viewing: [
    group('view', 'View', [
      { ...list(PAGE_DISPLAY_CONTROL, 'Page display', 'view', lucideBookOpen), ...BUILT },
      button(ROTATE_VIEW_CLOCKWISE, 'Rotate view', 'view', lucideRotateCwSquare),
      toggle(DARK_PAGES, 'Dark pages', 'view', lucideMoon),
    ]),
  ],
  reviewing: [
    group('comment', 'Comment', [
      button(INSERT_COMMENT, 'Comment', 'participate', lucideMessageSquarePlus),
    ]),
    group('marks', 'Marks', [
      toggle(TOOL_HIGHLIGHT, 'Highlight', 'participate', lucideHighlighter, BUILT),
      toggle(TOOL_TEXT, 'Text', 'participate', lucideType),
      toggle(TOOL_DRAWING, 'Drawing', 'participate', lucidePencilLine),
      list('shape-control', 'Shape', 'participate', lucideShapes),
      list('stamp-control', 'Stamp', 'participate', lucideStamp),
      toggle(TOOL_TICK, 'Tick', 'participate', lucideCheck),
      list('sign-control', 'Sign', 'participate', lucideSignature),
    ]),
    group('tool-in-hand', 'Tool in hand', [
      list('colour-control', 'Colour', 'participate', lucidePalette),
      list('line-width-control', 'Line width', 'participate', lucideMinus),
    ]),
  ],
  editing: [
    group('content', 'Content', [
      toggle(EDIT_TEXT, 'Edit text', 'edit', lucideTextCursorInput),
      toggle(INSERT_TEXT_BOX, 'Text box', 'edit', lucideType),
      button(INSERT_PICTURE, 'Picture', 'edit', lucideImage),
      toggle(INSERT_LINK, 'Link', 'edit', lucideLink),
      toggle(EDIT_OBJECTS, 'Object tool', 'edit', lucideSquareDashedMousePointer),
      button(ORGANISE_PAGES, 'Organise pages', 'edit', lucideLayoutGrid),
    ]),
    group('text', 'Text', [
      {
        id: 'font-control',
        label: 'Font',
        level: 'edit',
        status: 'comingSoon',
        look: { kind: 'text', text: 'Font', width: 96, list: true },
      },
      {
        id: 'font-size-control',
        label: 'Font size',
        level: 'edit',
        status: 'comingSoon',
        look: { kind: 'text', text: '12', width: 36 },
      },
      toggle('text-bold', 'Bold', 'edit', lucideBold),
      toggle('text-italic', 'Italic', 'edit', lucideItalic),
      toggle('text-underline', 'Underline', 'edit', lucideUnderline),
      list('text-colour-control', 'Text colour', 'edit', lucideBaseline),
      list('alignment-control', 'Alignment', 'edit', lucideTextAlignStart),
    ]),
  ],
};

const TOOLBARS: Readonly<Record<PdfMode, OfficeToolbar>> = {
  viewing: [...EVERY_MODE, ...OWN.viewing],
  reviewing: [...EVERY_MODE, ...OWN.reviewing],
  editing: [...EVERY_MODE, ...OWN.editing],
};

/** The toolbar of the editing mode a person is in; the same array for a mode every time. */
export const pdfToolbar = (mode: PdfMode): OfficeToolbar => TOOLBARS[mode];
