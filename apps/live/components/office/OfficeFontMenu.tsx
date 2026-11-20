'use client';

// The toolbar's font control (docs/specs/004-interface-design/fonts.md "The font menu"): the family at the caret, in
// the toolbar's own face as Google's (blank over a mixed selection; in italics, with what it is drawn in, for one the menu does not list), opening the
// font menu over the page. Choosing a family remembers it among the recent ones and hands it to the kind.
import { useMemo, useState } from 'react';
import { ChevronDownIcon, HoverCard } from '@livedoc/ui';
import { fontMenuActions, fontMenuEntries, fontShownAs } from '@/lib/office/office-font-menu';
import { noteRecentFont, readRecentFonts } from '@/lib/office/office-recent-fonts';
import { OfficeMenuPanel } from './OfficeMenuPanel';
import { OfficePopup } from './OfficePopup';

/** What the kind hands the font control: the family now (read by the toolbar as the caret changes), and how to set one. */
export type OfficeFontFamily = { read: () => string | null; set: (family: string) => void };

const NO_SHORTCUTS = () => null;

export function OfficeFontMenu({
  font,
  value,
  tabIndex,
  className,
}: {
  font: OfficeFontFamily;
  // The family at the caret; null over a mixed selection.
  value: string | null;
  tabIndex: number;
  className: string;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  // Read as the menu opens, so a family chosen in another document shows.
  const [recent, setRecent] = useState<readonly string[]>([]);
  const entries = useMemo(() => fontMenuEntries(recent), [recent]);
  const actions = useMemo(
    () =>
      fontMenuActions(entries, value, (family) => {
        noteRecentFont(family);
        font.set(family);
      }),
    [entries, value, font],
  );
  const shownAs = value === null ? null : fontShownAs(value);
  return (
    <>
      <HoverCard title="Font" description={shownAs ? `Shown as ${shownAs}` : undefined}>
        <button
          ref={setTrigger}
          type="button"
          aria-label={value ? `Font: ${value}` : 'Font'}
          aria-haspopup="menu"
          aria-expanded={open}
          data-office-control="font"
          tabIndex={tabIndex}
          onClick={() => {
            setRecent(readRecentFonts());
            setOpen((was) => !was);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' || open) return;
            e.preventDefault();
            setRecent(readRecentFonts());
            setOpen(true);
          }}
          style={{ width: 112 }}
          className={className}
        >
          <span className={`truncate pl-1 ${shownAs ? 'italic' : ''}`}>{value ?? ''}</span>
          <ChevronDownIcon size={12} />
        </button>
      </HoverCard>
      {open ? (
        <OfficePopup anchor={trigger}>
          <OfficeMenuPanel
            entries={entries}
            actions={actions}
            shortcutOf={NO_SHORTCUTS}
            trigger={trigger}
            initialFocus="first"
            placement="popup"
            label="Font"
            onClose={() => setOpen(false)}
            onDone={() => setOpen(false)}
          />
        </OfficePopup>
      ) : null}
    </>
  );
}
