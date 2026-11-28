'use client';

// The link card (docs/specs/034-text-documents/links-and-navigation.md "Links", Show link details; a spreadsheet's,
// docs/specs/029-sheets/inserted-objects.md "The link card"): under a link, its title, a press on which opens it, then
// Copy, Edit and Remove; a session that may not edit has Copy alone. It never takes the focus from the writing or grid.
import {
  lucideBookmark,
  lucideCopy,
  lucideFileText,
  lucideGlobe,
  lucideLink2Off,
  lucidePencil,
  lucideTable,
} from '@livedoc/icons/lucide';
import { lucideGlyph, Tooltip } from '@livedoc/ui';
import { OfficePopup } from '@/components/office/OfficePopup';
import type { Box } from '@/lib/office/popup-place';

const DocumentGlyph = lucideGlyph(lucideFileText, 16);
const WebGlyph = lucideGlyph(lucideGlobe, 16);
const PlaceGlyph = lucideGlyph(lucideBookmark, 16);
const SheetGlyph = lucideGlyph(lucideTable, 16);
const CopyGlyph = lucideGlyph(lucideCopy, 18);
const EditGlyph = lucideGlyph(lucidePencil, 18);
const RemoveGlyph = lucideGlyph(lucideLink2Off, 18);

export const ICON_BUTTON =
  'grid size-row shrink-0 place-items-center rounded-full text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

export function CardButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        // A press acts without taking the focus from the writing.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPress}
        className={ICON_BUTTON}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** The card's buttons' names: a text document's in sentence case, a spreadsheet's in Google's title case. */
export type OfficeLinkCardLabels = { copy: string; edit: string; remove: string };
const SENTENCE: OfficeLinkCardLabels = {
  copy: 'Copy link',
  edit: 'Edit link',
  remove: 'Remove link',
};

export function OfficeLinkCard({
  anchor,
  title,
  href,
  kind,
  labels = SENTENCE,
  onOpen,
  onCopy,
  onEdit,
  onRemove,
}: {
  anchor: Box;
  title: string;
  href: string;
  // A LiveDoc document's link draws a document's glyph, a place in this document a bookmark, a sheet of the workbook a
  // sheet, a web address a globe.
  kind: 'document' | 'place' | 'sheet' | 'web';
  labels?: OfficeLinkCardLabels;
  onOpen: () => void;
  onCopy: () => void;
  // Null for a session that may not edit.
  onEdit: (() => void) | null;
  onRemove: (() => void) | null;
}) {
  return (
    <OfficePopup anchor={anchor}>
      <div
        role="group"
        aria-label="Link details"
        data-office-link-card
        className="flex max-w-[min(28rem,calc(100vw-1rem))] items-center gap-1 rounded-menu border border-(--office-line) bg-(--office-menu) py-1 pr-1 pl-3 text-body text-(--office-ink) shadow-lg"
      >
        <span aria-hidden="true" className="shrink-0 text-(--office-muted)">
          {kind === 'document' ? (
            <DocumentGlyph />
          ) : kind === 'place' ? (
            <PlaceGlyph />
          ) : kind === 'sheet' ? (
            <SheetGlyph />
          ) : (
            <WebGlyph />
          )}
        </span>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            onOpen();
          }}
          className="mr-2 min-w-0 flex-1 truncate rounded-control px-1 text-(--office-primary) underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
        >
          {title}
        </a>
        <CardButton label={labels.copy} onPress={onCopy}>
          <CopyGlyph />
        </CardButton>
        {onEdit ? (
          <CardButton label={labels.edit} onPress={onEdit}>
            <EditGlyph />
          </CardButton>
        ) : null}
        {onRemove ? (
          <CardButton label={labels.remove} onPress={onRemove}>
            <RemoveGlyph />
          </CardButton>
        ) : null}
      </div>
    </OfficePopup>
  );
}
