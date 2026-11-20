'use client';

// The toolbar's font control (docs/specs/004-interface-design/fonts.md "The font menu", "More fonts"): the family at
// the caret, in the toolbar's own face as Google's (blank over a mixed selection; in italics, with what it is drawn in,
// for one the menu does not list or that could not load), opening the font menu over the page. Choosing a family
// remembers it among the recent ones and hands it to the kind; More fonts opens the Fonts dialog, whose OK keeps My
// fonts. The families of My fonts from Google Fonts load as the menu opens.
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { track } from '@/lib/telemetry';
import { loadGoogleFamilies } from '@/lib/document-fonts/google-families';
import { googleFontLoads } from '@/lib/document-fonts/google-font-loading';
import { fontMenuActions, fontMenuEntries, fontShownAs } from '@/lib/office/office-font-menu';
import { MyFonts, readMyFonts, writeMyFonts } from '@/lib/office/office-my-fonts';
import { noteRecentFont, readRecentFonts } from '@/lib/office/office-recent-fonts';
import { OfficeChoiceMenu } from './OfficeChoiceMenu';
import { OfficeMoreFontsDialog } from './OfficeMoreFontsDialog';

/**
 * What the kind hands the font control: the family now (read by the toolbar as the caret changes), how to set one,
 * and the kind's name in telemetry.
 */
export type OfficeFontFamily = {
  read: () => string | null;
  set: (family: string) => void;
  telemetryKind?: string;
};

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
  const loads = googleFontLoads();
  const [choosing, setChoosing] = useState<readonly string[] | null>(null);
  // Read as the menu opens, so a family chosen in another document shows.
  const [recent, setRecent] = useState<readonly string[]>([]);
  // This browser's My fonts (the control draws only in the browser, with an editor to bind).
  const [myFonts, setMyFonts] = useState<readonly string[]>(readMyFonts);
  // Drawn again as a family from Google Fonts loads or fails.
  const statuses = useSyncExternalStore(loads.subscribe, loads.statuses, loads.statuses);
  const statusOf = useCallback(
    (name: string) => statuses.get(name.toLowerCase()) ?? 'idle',
    [statuses],
  );

  const readMenu = () => {
    const fonts = readMyFonts();
    setRecent(readRecentFonts());
    setMyFonts(fonts);
    void loadGoogleFamilies(fonts);
  };
  const entries = useMemo(
    () => fontMenuEntries(recent, myFonts, statusOf),
    [recent, myFonts, statusOf],
  );
  const actions = useMemo(
    () =>
      fontMenuActions(
        entries,
        value,
        (family) => {
          noteRecentFont(family);
          font.set(family);
        },
        () => {
          if (font.telemetryKind) track('UI', 'Opened', `${font.telemetryKind}MoreFonts`);
          setChoosing(readMyFonts());
        },
      ),
    [entries, value, font],
  );
  const shownAs = value === null ? null : fontShownAs(value, myFonts, statusOf);
  return (
    <>
      <OfficeChoiceMenu
        id="font"
        label="Font"
        value={value}
        italic={shownAs !== null}
        description={shownAs ? `Shown as ${shownAs}` : undefined}
        entries={entries}
        actions={actions}
        width={112}
        tabIndex={tabIndex}
        className={className}
        onOpen={readMenu}
      />
      {choosing ? (
        <OfficeMoreFontsDialog
          initial={choosing}
          onClose={() => setChoosing(null)}
          onApply={(next) => {
            if (!MyFonts.same(choosing, next)) {
              if (font.telemetryKind) track('UI', 'Changed', `${font.telemetryKind}MyFonts`);
              writeMyFonts(next);
              setMyFonts(readMyFonts());
              void loadGoogleFamilies(next);
            }
            setChoosing(null);
          }}
        />
      ) : null}
    </>
  );
}
