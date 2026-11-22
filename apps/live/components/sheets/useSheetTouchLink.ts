// A HYPERLINK on a touch screen (docs/specs/029-sheets/formulas.md "Text", On a touch screen): Ctrl/⌘ held with a tap
// opens it as a click does (a tablet with a keyboard); a plain tap on one marks its cell, so the grid shows the link
// chip with its address and Open. A pen is a mouse to the grid, so this is the finger's alone.
import { useCallback, useState } from 'react';
import { openHyperlink } from '@/lib/open-hyperlink';

export type TouchLinkCell = { r: number; c: number };
type TapKeys = { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };

export function useSheetTouchLink() {
  const [tapped, setTapped] = useState<TouchLinkCell | null>(null);

  /** A tap on a cell and its link (null for none): true when it opened the link, which then selects nothing. */
  const tap = useCallback(
    (keys: TapKeys, cell: TouchLinkCell, link: string | null, painting: boolean): boolean => {
      if (link && (keys.ctrlKey || keys.metaKey) && !keys.shiftKey && !painting) {
        setTapped(null);
        openHyperlink(link);
        return true;
      }
      setTapped(link ? cell : null);
      return false;
    },
    [],
  );

  /** The chip's Open: the link in a new tab, and the chip gone. */
  const open = useCallback((link: string) => {
    setTapped(null);
    openHyperlink(link);
  }, []);

  const dismiss = useCallback(() => setTapped(null), []);

  return { tapped, tap, open, dismiss };
}
