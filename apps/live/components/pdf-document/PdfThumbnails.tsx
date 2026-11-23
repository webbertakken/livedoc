'use client';

// The left panel's thumbnails (docs/specs/035-pdf-documents/reading-surface.md "Thumbnails"): every page in a column,
// fitted into its box upright as the file has it, captioned by its label or number; the page in view outlined, its
// thumbnail the list's one tab stop and kept in the panel's view; a press goes to the page. Each is drawn near the
// panel's view on the engine's one line, behind every page and tile, light paper always, the file's own marks in the
// picture and LiveDoc's over it; who is on a page shows as a dot in their colour.
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import type { Mark, PageInfo, PageMatrix } from '@livedoc/pdf-documents';
import { OFFICE_PANEL_START } from '@/components/office/OfficePanel';
import { debugLog } from '@/lib/debug-log';
import { marksOnPage, type PdfMarksStore } from '@/lib/pdf-document/pdf-marks-store';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import { paintPicture } from '@/lib/pdf-document/pdf-paint';
import { usePdfPresencePeers, type PdfPresencePeer } from '@/lib/pdf-document/pdf-presence-store';
import { PdfThumbnailCopy, thumbnailSize } from '@/lib/pdf-document/pdf-thumbnails';
import { HELD_MARGIN, NEAR_MARGIN, useWithin } from '@/lib/pdf-document/useWithin';
import { PdfMarksOverlay } from './PdfMarksOverlay';

/** The most people's dots on one thumbnail; the rest are counted ("+2"). */
const MOST_DOTS = 3;
const NOBODY: readonly PdfPresencePeer[] = [];

export function PdfThumbnails({
  tabId,
  pages,
  page,
  onGoTo,
  drawer,
  marks,
}: {
  tabId: string;
  pages: readonly PageInfo[];
  /** The page in view, by its index. */
  page: number;
  onGoTo: (index: number) => void;
  drawer: PdfPageDrawer;
  marks: PdfMarksStore;
}) {
  // The panel's body scrolls the list: it is the view the thumbnails are drawn near.
  const scroller = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLOListElement | null>(null);
  const attach = useCallback((element: HTMLOListElement | null) => {
    list.current = element;
    scroller.current = element?.parentElement ?? null;
  }, []);
  const near = useWithin(scroller, NEAR_MARGIN);
  const held = useWithin(scroller, HELD_MARGIN);
  const { watch: watchNear } = near;
  const { watch: watchHeld } = held;
  const register = useCallback(
    (index: number, element: HTMLElement | null) => {
      watchNear(index, element);
      watchHeld(index, element);
    },
    [watchNear, watchHeld],
  );
  const byPage = useSyncExternalStore(marks.subscribe, marks.get, marks.get);
  const peers = usePdfPresencePeers(tabId);
  const here = useMemo(() => {
    const out = new Map<string, PdfPresencePeer[]>();
    for (const peer of peers) out.set(peer.place.page, [...(out.get(peer.place.page) ?? []), peer]);
    return out;
  }, [peers]);

  // The page in view's thumbnail is kept in the panel's view as the page in view changes.
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-pdf-thumbnail="${page + 1}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [page]);

  // Down and Up move to the next thumbnail and the one before, Home and End to the ends; a button presses itself.
  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-pdf-thumbnail]')];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = {
      ArrowDown: Math.min(at + 1, buttons.length - 1),
      ArrowUp: Math.max(at - 1, 0),
      Home: 0,
      End: buttons.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined || at < 0) return;
    event.preventDefault();
    buttons[next]?.focus();
  };

  return (
    <ol
      ref={attach}
      aria-label="Pages"
      onKeyDown={onKeyDown}
      className="flex flex-col items-center gap-3 py-2"
    >
      {pages.map((info, index) => (
        <li key={info.name}>
          <PdfThumbnail
            index={index}
            page={info}
            current={index === page}
            wanted={near.within.has(index)}
            held={held.within.has(index)}
            drawer={drawer}
            marks={marksOnPage(byPage, info.name)}
            people={here.get(info.name) ?? NOBODY}
            onGoTo={onGoTo}
            register={register}
          />
        </li>
      ))}
    </ol>
  );
}

// `by`: the drawer that drew it; a replaced stored file comes with another, and the thumbnail is drawn again.
type Drawn = { toView: PageMatrix; by: PdfPageDrawer };

const PdfThumbnail = memo(function PdfThumbnail({
  index,
  page,
  current,
  wanted,
  held,
  drawer,
  marks,
  people,
  onGoTo,
  register,
}: {
  index: number;
  page: PageInfo;
  current: boolean;
  // Near the panel's view: drawn. Held: its picture is kept though it left view.
  wanted: boolean;
  held: boolean;
  drawer: PdfPageDrawer;
  marks: readonly Mark[];
  people: readonly PdfPresencePeer[];
  onGoTo: (index: number) => void;
  register: (index: number, element: HTMLElement | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  // Its picture was let go far from view: the one drawn is gone from the canvas until it is drawn again.
  const letGo = useRef(false);
  const describedBy = useId();
  const size = thumbnailSize(page);

  useEffect(() => {
    if (!held) {
      drawer.forgetThumbnail(index);
      if (canvas.current) canvas.current.width = canvas.current.height = 0;
      letGo.current = true;
      return;
    }
    if (!wanted || (drawn?.by === drawer && !letGo.current)) return;
    let settled = false;
    // Upright, at the screen's pixel ratio: CSS pixels a point times device pixels a CSS pixel.
    const scale = (size.width / page.width) * (window.devicePixelRatio || 1);
    void drawer.drawThumbnail(index, scale).then((bitmap) => {
      settled = true;
      if (!bitmap) {
        debugLog(`[pdf] thumbnail-failed page=${index + 1}`);
        return;
      }
      if (!canvas.current) return;
      paintPicture(canvas.current, bitmap);
      letGo.current = false;
      setDrawn({ toView: bitmap.toView, by: drawer });
    });
    // A thumbnail that leaves view before its turn is never drawn.
    return () => {
      if (!settled) drawer.forgetThumbnail(index);
    };
  }, [held, wanted, drawn, drawer, index, page.width, size.width]);

  const shown = held ? drawn : null;
  const named = PdfThumbnailCopy.here(people.map((person) => person.name));
  return (
    <button
      ref={(element) => register(index, element)}
      type="button"
      aria-label={PdfThumbnailCopy.name(index, page.label)}
      aria-current={current ? 'page' : undefined}
      aria-describedby={named ? describedBy : undefined}
      tabIndex={current ? 0 : -1}
      {...(current ? { [OFFICE_PANEL_START]: '' } : {})}
      data-pdf-thumbnail={index + 1}
      data-pdf-thumbnail-drawn={shown ? 'true' : 'false'}
      onClick={() => onGoTo(index)}
      className="group flex flex-col items-center gap-1 rounded-md p-1.5 outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
    >
      <span
        className={`relative block bg-(--pdf-paper) shadow-sm outline ${
          current ? 'outline-2 outline-(--office-focus)' : 'outline-1 outline-(--office-line)'
        }`}
        style={{ width: size.width, height: size.height }}
      >
        <canvas ref={canvas} aria-hidden="true" className="block h-full w-full" />
        {shown ? (
          <PdfMarksOverlay
            matrix={shown.toView}
            width={page.width}
            height={page.height}
            marks={marks}
          />
        ) : null}
        {people.length > 0 ? (
          <span aria-hidden="true" className="absolute top-1 right-1 flex items-center gap-0.5">
            {people.slice(0, MOST_DOTS).map((person) => (
              <span
                key={person.id}
                data-pdf-thumbnail-person={person.id}
                className="size-2.5 rounded-full ring-1 ring-(--pdf-paper)"
                style={{ backgroundColor: person.color }}
              />
            ))}
            {people.length > MOST_DOTS ? (
              <span className="rounded-full bg-(--pdf-paper) px-1 text-[10px] leading-3 text-(--pdf-paper-ink)">
                +{people.length - MOST_DOTS}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span
        className={`text-xs tabular-nums ${current ? 'font-medium text-(--office-ink)' : 'text-(--office-muted)'}`}
      >
        {PdfThumbnailCopy.caption(index, page.label)}
      </span>
      {named ? (
        <span id={describedBy} hidden>
          {named}
        </span>
      ) : null}
    </button>
  );
});
