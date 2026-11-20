// What the editor page hands the office shell's title row (docs/specs/004-interface-design/office-shell.md "Title row"):
// the document's own parts, the same for every kind. Each part is null where the session may not use it, so the title
// row draws nothing for it (docs/specs/034-text-documents/editing-surface.md "The title row").
import type { BackTarget } from '@/components/chrome/lines/BrandBack';
import type { PersonOnTab } from '@/lib/others-in-document';

export type { PersonOnTab as OfficePerson } from '@/lib/others-in-document';

export type OfficeChrome = {
  back: BackTarget;
  // Null for a session that may not rename the document: its name is text.
  rename: ((next: string) => void) | null;
  // Bumped by a rename asked for elsewhere (the command palette): each bump puts the focus in the name once.
  renameNonce: number;
  star: { starred: boolean; onToggle: () => void } | null;
  move: (() => void) | null;
  // Share for whoever may share; Make a copy in its place for anyone else, once the document is up.
  share: { shareable: boolean; onOpen: () => void } | null;
  makeCopy: { copying: boolean; run: () => void } | null;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  people: readonly PersonOnTab[];
  onOpenTab: (tabId: string) => void;
};
