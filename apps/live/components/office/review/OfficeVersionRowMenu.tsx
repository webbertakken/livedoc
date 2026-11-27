'use client';

// A version's ⋮ menu in the version history panel (docs/specs/012-collaboration/review-surfaces.md "Version history";
// docs/specs/034-text-documents/review.md "Version history"): Name this version, or Rename and Remove name, and Restore
// this version; Current version's names it only. The ⋮ (`OfficeVersionMoreButton`) sits at the row's end for the
// pointer, hidden from the list's reading; the keyboard opens the selected row's menu from the list (Shift+F10 or the
// menu key). The menu itself stands outside the list, fixed under the ⋮ (or the row), so the list holds options only;
// focus goes back to the list when it closes.
import { lucideEllipsisVertical } from '@livedoc/icons/lucide';
import { useRef } from 'react';
import { lucideGlyph, useClickOutside, useMenu } from '@livedoc/ui';
import { VERSION_MENU_LABELS, type VersionMenuItem } from '@/lib/office/office-version-list';

const MoreIcon = lucideGlyph(lucideEllipsisVertical, 18);

/** The ⋮ at a row's end: the pointer's way to its menu. */
export function OfficeVersionMoreButton({ onOpen }: { onOpen: (anchor: DOMRect) => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      data-version-actions=""
      onClick={(event) => {
        event.stopPropagation();
        onOpen(event.currentTarget.getBoundingClientRect());
      }}
      className="relative flex size-field shrink-0 items-center justify-center rounded-full text-(--office-ink) outline-none touch-target hover:bg-(--office-hover)"
    >
      <MoreIcon />
    </button>
  );
}

/** The menu, fixed under its anchor's right edge. */
export function OfficeVersionRowMenu({
  title,
  items,
  anchor,
  onClose,
  onChoose,
  returnTo,
}: {
  /** The row's name or time: the menu says whose actions it holds. */
  title: string;
  items: readonly VersionMenuItem[];
  anchor: { readonly right: number; readonly bottom: number };
  onClose: () => void;
  onChoose: (item: VersionMenuItem) => void;
  /** Where focus goes when the menu closes: the list. */
  returnTo: HTMLElement | null;
}) {
  const { attach, surfaceProps } = useMenu({
    onClose,
    trigger: returnTo,
    initialFocus: 'first',
    label: `Actions for ${title}`,
  });
  // A press anywhere else closes it, as any menu.
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, onClose, true);
  return (
    <div ref={box}>
      <div
        ref={attach}
        {...surfaceProps}
        style={{ top: anchor.bottom + 4, right: Math.max(8, window.innerWidth - anchor.right) }}
        className="fixed z-50 w-56 rounded-menu bg-(--office-menu) py-2 text-(--office-ink) shadow-lg outline-none"
      >
        {items.map((item) => (
          <button
            key={item}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onClose();
              onChoose(item);
            }}
            className="flex w-full px-4 py-2 text-left text-body outline-none hover:bg-(--office-menu-hover) focus-visible:bg-(--office-menu-hover)"
          >
            {VERSION_MENU_LABELS[item]}
          </button>
        ))}
      </div>
    </div>
  );
}
