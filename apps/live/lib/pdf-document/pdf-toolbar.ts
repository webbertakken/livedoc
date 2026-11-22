// A PDF document's toolbar (docs/specs/035-pdf-documents/reading-surface.md "The toolbar"), as the office shell's data
// (office-shell.md "Toolbar"). A control that runs a menu item shares its id. The groups join as their phases land.
import {
  lucideHighlighter,
  lucideMousePointer2,
  lucideRedo2,
  lucideUndo2,
} from '@livedoc/icons/lucide';
import type { OfficeToolbar } from '@/lib/office/office-toolbar';
import { REDO, TOOL_HIGHLIGHT, TOOL_SELECT, UNDO } from './pdf-menus';

export const PDF_TOOLBAR: OfficeToolbar = [
  {
    id: 'history',
    label: 'History',
    controls: [
      {
        id: UNDO,
        label: 'Undo',
        level: 'participate',
        status: 'built',
        shortcut: 'undo',
        look: { kind: 'icon', icon: lucideUndo2 },
      },
      {
        id: REDO,
        label: 'Redo',
        level: 'participate',
        status: 'built',
        shortcut: 'redo',
        look: { kind: 'icon', icon: lucideRedo2 },
      },
    ],
  },
  {
    id: 'zoom',
    label: 'Zoom',
    controls: [
      { id: 'zoom', label: 'Zoom', level: 'view', status: 'built', look: { kind: 'zoom' } },
    ],
  },
  {
    id: 'pointer',
    label: 'Pointer',
    controls: [
      {
        id: TOOL_SELECT,
        label: 'Select',
        level: 'view',
        status: 'built',
        look: { kind: 'icon', icon: lucideMousePointer2, toggle: true },
      },
    ],
  },
  {
    id: 'marks',
    label: 'Marks',
    controls: [
      {
        id: TOOL_HIGHLIGHT,
        label: 'Highlight',
        level: 'participate',
        status: 'built',
        look: { kind: 'icon', icon: lucideHighlighter, toggle: true },
      },
    ],
  },
];
