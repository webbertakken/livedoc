'use client';

// The Fonts dialog, More fonts (docs/specs/004-interface-design/fonts.md "More fonts"): Google Fonts' catalogue,
// searched, shown by category and sorted, beside My fonts. Choosing a row adds it to My fonts or takes it out; OK keeps
// the changes, Cancel and × keep none. Mounted only while open, so it always opens on the My fonts there is now.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CloseIcon } from '@livedoc/ui';
import { DocumentFonts } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { loadGoogleFonts, type GoogleFont } from '@/lib/document-fonts/google-font-catalogue';
import { googleFontLoads, type GoogleFontLoads } from '@/lib/document-fonts/google-font-loading';
import { MyFonts } from '@/lib/office/office-my-fonts';
import {
  FONT_SHOW,
  FONT_SORT,
  moreFontsFamilies,
  moreFontsRows,
  rowFace,
  type FontShow,
  type FontSort,
  type MoreFontsFamily,
} from '@/lib/office/office-more-fonts';
import { OfficeDialog } from './OfficeDialog';
import { OfficeDialogMessage, OfficeDialogSearch, OfficeDialogSelect } from './OfficeDialogFields';
import { OfficeFontList } from './OfficeFontList';

type Catalogue =
  | { state: 'loading' }
  | { state: 'ready'; families: readonly MoreFontsFamily[] }
  | { state: 'failed' };

// The Google families of these rows that LiveDoc does not serve: only those are fetched for a preview.
const googleOf = (rows: readonly MoreFontsFamily[]): GoogleFont[] =>
  rows.flatMap((r) => (r.google && !DocumentFonts.find(r.name) ? [r.google] : []));

export function OfficeMoreFontsDialog({
  initial,
  onClose,
  onApply,
  catalogue: readCatalogue = loadGoogleFonts,
  loads = googleFontLoads(),
}: {
  // My fonts as the dialog opens.
  initial: readonly string[];
  onClose: () => void;
  // OK: the My fonts to keep.
  onApply: (fonts: readonly string[]) => void;
  catalogue?: () => Promise<readonly GoogleFont[]>;
  loads?: GoogleFontLoads;
}) {
  const [catalogue, setCatalogue] = useState<Catalogue>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<FontShow>('All fonts');
  const [sort, setSort] = useState<FontSort>('Popularity');
  const [draft, setDraft] = useState<readonly string[]>(initial);
  const search = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    readCatalogue().then(
      (google) => {
        if (!live) return;
        const families = moreFontsFamilies(google);
        setCatalogue({ state: 'ready', families });
        // My fonts is drawn in its faces too, whichever rows are in view.
        void loads.preview(googleOf(families.filter((f) => MyFonts.has(initial, f.name))));
      },
      (error: unknown) => {
        debugLog(`[fonts] google catalogue not loaded ${String(error)}`);
        if (live) setCatalogue({ state: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [readCatalogue, loads, initial, attempt]);

  const rows = useMemo(
    () =>
      catalogue.state === 'ready' ? moreFontsRows(catalogue.families, { query, show, sort }) : [],
    [catalogue, query, show, sort],
  );
  const toggle = useCallback(
    (name: string) => setDraft((fonts) => MyFonts.toggle(fonts, name)),
    [],
  );
  const preview = useCallback(
    (inView: readonly MoreFontsFamily[]) => void loads.preview(googleOf(inView)),
    [loads],
  );

  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Fonts"
      wide
      primary={{ label: 'OK', onPress: () => onApply(draft), disabled: draft.length === 0 }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <OfficeDialogSearch label="Search fonts" value={query} onChange={setQuery} field={search} />
        <OfficeDialogSelect label="Show" value={show} options={FONT_SHOW} onChange={setShow} />
        <OfficeDialogSelect label="Sort" value={sort} options={FONT_SORT} onChange={setSort} />
      </div>
      <div className="mt-3 flex min-h-0 flex-1 gap-4 sm:h-[440px] sm:flex-none max-sm:flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {catalogue.state === 'ready' ? (
            <>
              <p role="status" aria-live="polite" className="sr-only">
                {rows.length === 1 ? '1 font' : `${rows.length} fonts`}
              </p>
              {rows.length === 0 ? (
                <OfficeDialogMessage>No fonts match</OfficeDialogMessage>
              ) : (
                <OfficeFontList
                  // A new search, category or sort is a new list, starting at its top.
                  key={`${query}\n${show}\n${sort}`}
                  rows={rows}
                  chosen={draft}
                  onToggle={toggle}
                  onPreview={preview}
                />
              )}
            </>
          ) : catalogue.state === 'loading' ? (
            <OfficeDialogMessage>
              <span role="status">Loading fonts</span>
            </OfficeDialogMessage>
          ) : (
            <OfficeDialogMessage>
              <span role="alert">Fonts could not load.</span>
              <button
                type="button"
                onClick={() => {
                  setCatalogue({ state: 'loading' });
                  setAttempt((n) => n + 1);
                }}
                className="touch-target relative mt-2 rounded-full px-4 py-2 text-sm font-medium text-(--office-primary) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
              >
                Try again
              </button>
            </OfficeDialogMessage>
          )}
        </div>
        <MyFontsColumn fonts={draft} onRemove={toggle} onEmptied={() => search.current?.focus()} />
      </div>
    </OfficeDialog>
  );
}

export function MyFontsColumn({
  fonts,
  onRemove,
  onEmptied,
}: {
  fonts: readonly string[];
  onRemove: (name: string) => void;
  // Where focus goes when the last family was taken out.
  onEmptied: () => void;
}) {
  const headingId = useId();
  const list = useRef<HTMLUListElement | null>(null);
  // After a removal, focus goes to the row that took its place (or the one before it), never lost to the page. The
  // intent holds the list it was made against and waits for that list to change: a render that comes between (one
  // left over from the catalogue or a preview loading, flushed before the removal's) must not spend it.
  const refocus = useRef<{ index: number; from: string } | null>(null);
  useEffect(() => {
    if (refocus.current === null || refocus.current.from === fonts.join('\n')) return;
    const at = refocus.current.index;
    refocus.current = null;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('button');
    const next = buttons?.[Math.min(at, buttons.length - 1)];
    if (next) next.focus();
    else onEmptied();
  }, [fonts, onEmptied]);
  return (
    <section
      aria-labelledby={headingId}
      className="flex w-56 shrink-0 flex-col border-l border-(--office-line) pl-4 max-sm:max-h-[30dvh] max-sm:w-auto max-sm:border-t max-sm:border-l-0 max-sm:pt-3 max-sm:pl-0"
    >
      <h3 id={headingId} className="pb-2 text-base font-medium">
        My fonts
      </h3>
      {fonts.length === 0 ? (
        <p className="text-sm text-(--office-muted)">Keep at least one font</p>
      ) : (
        <ul ref={list} className="min-h-0 flex-1 overflow-y-auto max-sm:max-h-none">
          {fonts.map((name, index) => (
            <li key={name} className="flex h-9 items-center gap-2 text-[15px]">
              <span className="min-w-0 flex-1 truncate" style={{ fontFamily: rowFace(name) }}>
                {name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => {
                  refocus.current = { index, from: fonts.join('\n') };
                  onRemove(name);
                }}
                className="touch-target relative flex size-8 shrink-0 items-center justify-center rounded-full text-(--office-icon) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
              >
                <CloseIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
