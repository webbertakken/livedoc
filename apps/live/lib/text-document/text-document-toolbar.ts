// The text document's toolbar (docs/specs/034-text-documents/editing-surface.md "The toolbar"): Google's groups in
// Google's order. A control that runs a menu item shares its id and its shortcut; the rest are the toolbar's own.
// Controls whose phase has not landed are `comingSoon`, drawn dimmed, as the menus' are.
import {
  lucideAlignLeft,
  lucideArrowUpDown,
  lucideBaseline,
  lucideBold,
  lucideChevronUp,
  lucideHighlighter,
  lucideImage,
  lucideItalic,
  lucideLink,
  lucideList,
  lucideListIndentDecrease,
  lucideListIndentIncrease,
  lucideListOrdered,
  lucideListTodo,
  lucideMessageSquarePlus,
  lucideMinus,
  lucidePaintRoller,
  lucidePlus,
  lucidePrinter,
  lucideRedo2,
  lucideRemoveFormatting,
  lucideSearch,
  lucideSpellCheck,
  lucideUnderline,
  lucideUndo2,
} from '@livedoc/icons/lucide';
import type { IconPrim } from '@livedoc/icons';
import type { AccessLevel } from '@livedoc/api-schema';
import type { OfficeControl, OfficeControlLook, OfficeToolbar } from '@/lib/office/office-toolbar';

type Extra = { shortcut?: string; built?: boolean; toggle?: boolean; menu?: boolean };

const control = (
  id: string,
  label: string,
  level: AccessLevel,
  look: OfficeControlLook,
  { shortcut, built = false }: Extra = {},
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
    },
    extra,
  );

export const TEXT_DOCUMENT_TOOLBAR: OfficeToolbar = [
  {
    id: 'find',
    label: 'Find',
    controls: [
      icon('search-the-menus', 'Search the menus', 'edit', lucideSearch, {
        shortcut: 'tool-finder',
        built: true,
      }),
    ],
  },
  {
    id: 'history',
    label: 'History',
    controls: [
      icon('undo', 'Undo', 'edit', lucideUndo2, { shortcut: 'undo', built: true }),
      icon('redo', 'Redo', 'edit', lucideRedo2, { shortcut: 'redo', built: true }),
      icon('print', 'Print', 'edit', lucidePrinter, { shortcut: 'print' }),
      icon('spelling-and-grammar', 'Spelling and grammar check', 'edit', lucideSpellCheck, {
        shortcut: 'open-spelling-and-grammar',
      }),
      icon('paint-format', 'Paint format', 'edit', lucidePaintRoller, { toggle: true }),
    ],
  },
  {
    id: 'zoom',
    label: 'Zoom',
    controls: [control('zoom', 'Zoom', 'view', { kind: 'zoom' }, { built: true })],
  },
  {
    id: 'style',
    label: 'Styles',
    controls: [control('styles', 'Styles', 'edit', { kind: 'choice', width: 120 })],
  },
  {
    id: 'font',
    label: 'Font',
    controls: [
      control('font', 'Font', 'edit', { kind: 'font' }, { built: true }),
      icon('size-decrease', 'Decrease font size', 'edit', lucideMinus, {
        shortcut: 'decrease-font-size',
        built: true,
      }),
      control('font-size', 'Font size', 'edit', { kind: 'fontSize' }, { built: true }),
      icon('size-increase', 'Increase font size', 'edit', lucidePlus, {
        shortcut: 'increase-font-size',
        built: true,
      }),
    ],
  },
  {
    id: 'text',
    label: 'Text',
    controls: [
      icon('bold', 'Bold', 'edit', lucideBold, { shortcut: 'bold', toggle: true, built: true }),
      icon('italic', 'Italic', 'edit', lucideItalic, {
        shortcut: 'italicize',
        toggle: true,
        built: true,
      }),
      icon('underline', 'Underline', 'edit', lucideUnderline, {
        shortcut: 'underline',
        toggle: true,
        built: true,
      }),
      // The A without its line: the control draws the line in the colour at the caret.
      control('text-colour', 'Text colour', 'edit', {
        kind: 'colour',
        icon: lucideBaseline.slice(1),
      }),
      control('highlight-colour', 'Highlight colour', 'edit', {
        kind: 'colour',
        icon: lucideHighlighter,
      }),
    ],
  },
  {
    id: 'insert',
    label: 'Insert',
    controls: [
      icon('link', 'Insert link', 'edit', lucideLink, { shortcut: 'insert-or-edit-link' }),
      icon('comment', 'Add comment', 'participate', lucideMessageSquarePlus, {
        shortcut: 'insert-comment',
      }),
      icon('insert-image', 'Insert image', 'edit', lucideImage, { menu: true }),
    ],
  },
  {
    id: 'paragraph',
    label: 'Paragraph',
    controls: [
      icon('align', 'Align & indent', 'edit', lucideAlignLeft, { menu: true }),
      icon('line-spacing', 'Line & paragraph spacing', 'edit', lucideArrowUpDown, { menu: true }),
      icon('checklist', 'Checklist', 'edit', lucideListTodo, {
        shortcut: 'checklist',
        toggle: true,
      }),
      icon('bulleted-list', 'Bulleted list', 'edit', lucideList, {
        shortcut: 'bulleted-list',
        toggle: true,
      }),
      icon('numbered-list', 'Numbered list', 'edit', lucideListOrdered, {
        shortcut: 'numbered-list',
        toggle: true,
      }),
      icon('indent-decrease', 'Decrease indent', 'edit', lucideListIndentDecrease, {
        shortcut: 'decrease-paragraph-indentation',
      }),
      icon('indent-increase', 'Increase indent', 'edit', lucideListIndentIncrease, {
        shortcut: 'increase-paragraph-indentation',
      }),
    ],
  },
  {
    id: 'clear',
    label: 'Clear',
    controls: [
      icon('clear-formatting', 'Clear formatting', 'edit', lucideRemoveFormatting, {
        shortcut: 'clear-text-formatting',
      }),
    ],
  },
  {
    id: 'right',
    label: 'View',
    controls: [
      icon('hide-the-menus', 'Hide the menus', 'view', lucideChevronUp, {
        shortcut: 'hide-the-menus-compact-mode',
      }),
    ],
  },
];
