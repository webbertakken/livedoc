// The spreadsheet's toolbar (docs/specs/029-sheets/surface.md "Toolbar"): Google Sheets' groups in Google's order. A
// control that runs a menu item shares its id; the rest are the toolbar's own. Controls whose phase has not landed are
// `comingSoon`, drawn dimmed, as the menus' are; a value field not built yet is its placeholder text, dimmed.
import type { IconPrim } from '@livedoc/icons';
import {
  lucideAlignLeft,
  lucideAlignVerticalJustifyCenter,
  lucideArrowRightToLine,
  lucideBaseline,
  lucideBold,
  lucideChartColumn,
  lucideChevronUp,
  lucideDecimalsArrowLeft,
  lucideDecimalsArrowRight,
  lucideDollarSign,
  lucideFunnel,
  lucideGrid2x2,
  lucideHash,
  lucideItalic,
  lucideLink,
  lucideMessageSquarePlus,
  lucideMinus,
  lucidePaintBucket,
  lucidePaintRoller,
  lucidePercent,
  lucidePlus,
  lucidePrinter,
  lucideRedo2,
  lucideRotateCcw,
  lucideSearch,
  lucideSigma,
  lucideStrikethrough,
  lucideTableCellsMerge,
  lucideUndo2,
} from '@livedoc/icons/lucide';
import type { AccessLevel } from '@livedoc/api-schema';
import type { OfficeControl, OfficeControlLook, OfficeToolbar } from '@/lib/office/office-toolbar';

type Extra = {
  built?: boolean;
  toggle?: boolean;
  menu?: boolean;
  split?: boolean;
  shortcut?: string;
};

const control = (
  id: string,
  label: string,
  level: AccessLevel,
  look: OfficeControlLook,
  { built = false, shortcut }: Extra = {},
): OfficeControl => ({
  id,
  label,
  level,
  status: built ? 'built' : 'comingSoon',
  look,
  ...(shortcut ? { shortcut } : {}),
});

const icon = (
  id: string,
  label: string,
  level: AccessLevel,
  glyph: readonly IconPrim[],
  extra: Extra = {},
): OfficeControl =>
  control(
    id,
    label,
    level,
    {
      kind: 'icon',
      icon: glyph,
      ...(extra.toggle ? { toggle: true } : {}),
      ...(extra.menu ? { menu: true } : {}),
      ...(extra.split ? { split: true } : {}),
    },
    extra,
  );

const BUILT = { built: true } as const;

export const SPREADSHEET_TOOLBAR: OfficeToolbar = [
  {
    id: 'history',
    label: 'History',
    controls: [
      icon('search-the-menus', 'Search the Menus', 'view', lucideSearch, {
        shortcut: 'tool-finder',
        built: true,
      }),
      icon('undo', 'Undo', 'participate', lucideUndo2, { ...BUILT, shortcut: 'undo' }),
      icon('redo', 'Redo', 'participate', lucideRedo2, { ...BUILT, shortcut: 'redo' }),
      icon('print', 'Print', 'view', lucidePrinter, { shortcut: 'print' }),
      // Holds the selection's formats for the next range; a double-click keeps it on (formatting.md "Paint format").
      icon('paint-format', 'Paint Format', 'edit', lucidePaintRoller, {
        toggle: true,
        built: true,
      }),
    ],
  },
  {
    id: 'view',
    label: 'View',
    controls: [control('zoom', 'Zoom', 'view', { kind: 'zoom' }, { built: true })],
  },
  {
    id: 'number',
    label: 'Number',
    controls: [
      icon('number-currency', 'Format as Currency', 'edit', lucideDollarSign, {
        ...BUILT,
        shortcut: 'format-as-currency',
      }),
      icon('number-percent', 'Format as Percent', 'edit', lucidePercent, {
        ...BUILT,
        shortcut: 'format-as-percentage',
      }),
      icon(
        'decrease-decimal-places',
        'Decrease Decimal Places',
        'edit',
        lucideDecimalsArrowLeft,
        BUILT,
      ),
      icon(
        'increase-decimal-places',
        'Increase Decimal Places',
        'edit',
        lucideDecimalsArrowRight,
        BUILT,
      ),
      icon('more-formats', 'More Formats', 'edit', lucideHash, { menu: true, built: true }),
    ],
  },
  {
    id: 'font',
    label: 'Font',
    controls: [
      control('font', 'Font', 'edit', { kind: 'font' }, BUILT),
      icon('font-size-decrease', 'Decrease Font Size', 'edit', lucideMinus, BUILT),
      control('font-size', 'Font Size', 'edit', { kind: 'fontSize' }, BUILT),
      icon('font-size-increase', 'Increase Font Size', 'edit', lucidePlus, BUILT),
    ],
  },
  {
    id: 'text',
    label: 'Text',
    controls: [
      icon('bold', 'Bold', 'edit', lucideBold, { toggle: true, built: true, shortcut: 'bold' }),
      icon('italic', 'Italic', 'edit', lucideItalic, {
        toggle: true,
        built: true,
        shortcut: 'italic',
      }),
      icon('strikethrough', 'Strikethrough', 'edit', lucideStrikethrough, {
        toggle: true,
        built: true,
        shortcut: 'strikethrough',
      }),
      // The A without its line: the control draws the line in the active cell's colour (formatting.md "Text and colour").
      control(
        'text-colour',
        'Text Colour',
        'edit',
        { kind: 'colour', icon: lucideBaseline.slice(1) },
        BUILT,
      ),
    ],
  },
  {
    id: 'cell',
    label: 'Cell',
    controls: [
      control(
        'fill-colour',
        'Fill Colour',
        'edit',
        { kind: 'colour', icon: lucidePaintBucket },
        BUILT,
      ),
      // Opens the Borders panel (formatting.md "Borders").
      icon('borders', 'Borders', 'edit', lucideGrid2x2, { menu: true, built: true }),
      // Merges all, or unmerges a selection holding a merge; its arrow lists the four (formatting.md "Merges", D208).
      icon('merge-cells', 'Merge Cells', 'edit', lucideTableCellsMerge, {
        split: true,
        built: true,
      }),
    ],
  },
  {
    id: 'alignment',
    label: 'Alignment',
    controls: [
      icon('horizontal-align', 'Horizontal Align', 'edit', lucideAlignLeft, {
        menu: true,
        built: true,
      }),
      icon('vertical-align', 'Vertical Align', 'edit', lucideAlignVerticalJustifyCenter, {
        menu: true,
        built: true,
      }),
      icon('text-wrapping', 'Text Wrapping', 'edit', lucideArrowRightToLine, {
        menu: true,
        built: true,
      }),
      icon('text-rotation', 'Text Rotation', 'edit', lucideRotateCcw, { menu: true, built: true }),
    ],
  },
  {
    id: 'insert',
    label: 'Insert',
    controls: [
      icon('insert-link', 'Insert Link', 'edit', lucideLink, {
        shortcut: 'insert-link',
        built: true,
      }),
      icon('insert-comment', 'Insert Comment', 'participate', lucideMessageSquarePlus, {
        shortcut: 'insert-or-edit-comment',
      }),
      icon('insert-chart', 'Insert Chart', 'edit', lucideChartColumn, { built: true }),
      icon('create-a-filter', 'Create a Filter', 'edit', lucideFunnel, {
        toggle: true,
        built: true,
      }),
      icon('functions', 'Functions', 'participate', lucideSigma, { menu: true }),
    ],
  },
  {
    id: 'end',
    label: 'View',
    controls: [
      icon('hide-the-menus', 'Hide the Menus', 'view', lucideChevronUp, {
        shortcut: 'compact-controls',
      }),
    ],
  },
];
