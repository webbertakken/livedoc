// A text document's modes (docs/specs/034-text-documents/review.md "Editing modes"): Editing, Suggesting and Viewing,
// in Google's order and words, on the office shell's mode switch (office-shell.md "Modes").
import { lucideEye, lucidePencil, lucidePencilLine } from '@livedoc/icons/lucide';
import type { OfficeModeInfo } from '@/lib/office/office-mode';

export type TextDocumentMode = 'editing' | 'suggesting' | 'viewing';

export const TEXT_DOCUMENT_MODES: readonly OfficeModeInfo<TextDocumentMode>[] = [
  {
    mode: 'editing',
    label: 'Editing',
    description: 'Edit document directly',
    icon: lucidePencil,
    level: 'edit',
    drawnAt: 'edit',
    status: 'built',
    item: 'mode-editing',
  },
  {
    mode: 'suggesting',
    label: 'Suggesting',
    description: 'Edits become suggestions',
    icon: lucidePencilLine,
    level: 'participate',
    drawnAt: 'participate',
    status: 'comingSoon',
    item: 'mode-suggesting',
  },
  {
    mode: 'viewing',
    label: 'Viewing',
    description: 'Read or print final document',
    icon: lucideEye,
    level: 'view',
    drawnAt: 'view',
    status: 'built',
    item: 'mode-viewing',
  },
];
