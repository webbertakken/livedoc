// A PDF document's editing modes (docs/specs/035-pdf-documents/editing-modes.md "Switching"): Reviewing, Editing and
// Viewing, in that order, on the office shell's mode switch (office-shell.md "Modes"). Reviewing is declared first, so
// a person starts in it, an Editor too: real editing is entered on purpose.
import { lucideEye, lucideHighlighter, lucidePencil } from '@livedoc/icons/lucide';
import type { OfficeModeInfo } from '@/lib/office/office-mode';

export type PdfMode = 'reviewing' | 'editing' | 'viewing';

export const PDF_MODES: readonly OfficeModeInfo<PdfMode>[] = [
  {
    mode: 'reviewing',
    label: 'Reviewing',
    description: 'Mark text, comment, fill in and sign',
    icon: lucideHighlighter,
    level: 'participate',
    drawnAt: 'participate',
    status: 'built',
    item: 'mode-reviewing',
  },
  {
    mode: 'editing',
    label: 'Editing',
    description: 'Change the pages themselves',
    icon: lucidePencil,
    level: 'edit',
    drawnAt: 'edit',
    status: 'comingSoon',
    item: 'mode-editing',
  },
  {
    mode: 'viewing',
    label: 'Viewing',
    description: 'Read or print the PDF',
    icon: lucideEye,
    level: 'view',
    drawnAt: 'view',
    status: 'built',
    item: 'mode-viewing',
  },
];
