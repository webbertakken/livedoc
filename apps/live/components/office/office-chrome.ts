// What the editor page hands the office shell's title row (docs/specs/004-interface-design/office-shell.md "Title row"):
// the document's own parts, the same for every kind. Each part is null where the session may not use it, so the title
// row draws nothing for it (docs/specs/034-text-documents/editing-surface.md "The title row").
import type { BackTarget } from '@/components/chrome/lines/BrandBack';
import type { PersonOnTab } from '@/lib/others-in-document';
import type { OfficeDocumentFacts } from '@/lib/office/office-details';

export type { PersonOnTab as OfficePerson } from '@/lib/others-in-document';

export type OfficeChrome = {
  back: BackTarget;
  // Null for a session that may not rename the document: its name is text.
  rename: ((next: string) => void) | null;
  // Bumped by a rename asked for elsewhere (the command palette): each bump puts the focus in the name once.
  renameNonce: number;
  star: { starred: boolean; onToggle: () => void } | null;
  move: (() => void) | null;
  // File > Move to trash, for whoever may delete the document (files-and-print.md "Trash"); null for anyone else.
  trash: (() => void) | null;
  // What File > Details says of every kind: owner, location, created, last saved (files-and-print.md "Details").
  facts: OfficeDocumentFacts;
  // Share for whoever may share; Make a copy in its place for anyone else, once the document is up.
  share: { shareable: boolean; onOpen: () => void } | null;
  makeCopy: { copying: boolean; run: () => void } | null;
  // File > Make a copy's Copy document dialog, for anyone once the document is up, where the kind asks before copying
  // (files-and-print.md "Make a copy"); null elsewhere.
  copy: (() => void) | null;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  people: readonly PersonOnTab[];
  onOpenTab: (tabId: string) => void;
};
