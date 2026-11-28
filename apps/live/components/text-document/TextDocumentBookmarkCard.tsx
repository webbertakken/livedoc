'use client';

// A bookmark's card (docs/specs/034-text-documents/links-and-navigation.md "Bookmarks"): beside a caret at a bookmark,
// **Bookmark**, then Copy link and, for whoever may edit, Remove. It never takes the focus from the writing.
import { lucideCopy, lucideTrash2 } from '@livedoc/icons/lucide';
import { lucideGlyph } from '@livedoc/ui';
import { OfficePopup } from '@/components/office/OfficePopup';
import type { Box } from '@/lib/office/popup-place';
import { CardButton } from '@/components/office/OfficeLinkCard';

const CopyGlyph = lucideGlyph(lucideCopy, 18);
const RemoveGlyph = lucideGlyph(lucideTrash2, 18);

export function TextDocumentBookmarkCard({
  anchor,
  onCopy,
  onRemove,
}: {
  anchor: Box;
  onCopy: () => void;
  // Null for a session that may not edit.
  onRemove: (() => void) | null;
}) {
  return (
    <OfficePopup anchor={anchor}>
      <div
        role="group"
        aria-label="Bookmark"
        data-text-document-bookmark-card
        className="flex items-center gap-1 rounded-menu border border-(--office-line) bg-(--office-menu) py-1 pr-1 pl-3 text-body text-(--office-ink) shadow-lg"
      >
        <span className="mr-2">Bookmark</span>
        <CardButton label="Copy link" onPress={onCopy}>
          <CopyGlyph />
        </CardButton>
        {onRemove ? (
          <CardButton label="Remove" onPress={onRemove}>
            <RemoveGlyph />
          </CardButton>
        ) : null}
      </div>
    </OfficePopup>
  );
}
