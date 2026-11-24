'use client';

// The left panel's outline (docs/specs/035-pdf-documents/reading-surface.md "Outline"): the file's bookmarks as a
// tree, the top level showing and every nested level folded; a press follows the bookmark; the one for the page in
// view is marked, or its nearest shown parent while it is folded. One Tab stop; the tree's keys move and fold.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { lucideChevronRight } from '@livedoc/icons/lucide';
import { Glyph, Prims } from '@livedoc/ui';
import type { LinkTarget, Outline, PageInfo, PdfEngine } from '@livedoc/pdf-documents';
import { OFFICE_PANEL_START } from '@/components/office/OfficePanel';
import { debugLog } from '@/lib/debug-log';
import { pdfLinkOutcome } from '@/lib/pdf-document/pdf-link';
import { PdfOutline } from '@/lib/pdf-document/pdf-outline';

/** Said while the outline is read, of a file with none, of one cut short, and of one that cannot be read. */
export const OUTLINE_COPY = {
  reading: 'Reading bookmarks…',
  none: 'This PDF has no bookmarks.',
  cut: 'This PDF has more bookmarks than LiveDoc lists (20,000).',
  failed: 'The bookmarks couldn’t be read.',
  nowhere: 'Goes nowhere',
} as const;

type Read =
  | { phase: 'reading' }
  | { phase: 'failed' }
  | { phase: 'ready'; outline: PdfOutline; cut: boolean };

export function PdfOutlinePanel({
  engine,
  pages,
  page,
  onFollow,
}: {
  engine: Pick<PdfEngine, 'outline'>;
  pages: readonly PageInfo[];
  /** The page in view, by its index. */
  page: number;
  /** A bookmark pressed: where it leads, as the file says. */
  onFollow: (target: LinkTarget | null) => void;
}) {
  const [read, setRead] = useState<Read>({ phase: 'reading' });
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [focused, setFocused] = useState<number | null>(null);
  const tree = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let gone = false;
    engine.outline().then(
      (outline: Outline) => {
        if (!gone)
          setRead({ phase: 'ready', outline: PdfOutline.of(outline.items), cut: outline.cut });
      },
      (error: unknown) => {
        debugLog('[pdf] outline-failed', String(error));
        if (!gone) setRead({ phase: 'failed' });
      },
    );
    return () => {
      gone = true;
    };
  }, [engine]);

  const names = useMemo(() => pages.map((info) => info.name), [pages]);
  const outline = read.phase === 'ready' ? read.outline : null;
  const shown = useMemo(() => (outline ? PdfOutline.shown(outline, open) : []), [outline, open]);
  const marked = outline
    ? PdfOutline.shownOf(outline, open, PdfOutline.current(outline, names, page))
    : null;
  // The one Tab stop: the bookmark last focused while it shows, else the one marked, else the first.
  const stop = focused !== null && shown.includes(focused) ? focused : (marked ?? shown[0] ?? null);

  if (read.phase === 'reading')
    return (
      <p role="status" className="px-2 py-2 text-sm text-(--office-muted)">
        {OUTLINE_COPY.reading}
      </p>
    );
  if (read.phase === 'failed')
    return (
      <p role="alert" className="px-2 py-2 text-sm">
        {OUTLINE_COPY.failed}
      </p>
    );
  if (!outline || outline.nodes.length === 0)
    return <p className="px-2 py-2 text-sm text-(--office-muted)">{OUTLINE_COPY.none}</p>;

  const toggle = (at: number) =>
    setOpen((before) => {
      const next = new Set(before);
      if (next.has(at)) next.delete(at);
      else next.add(at);
      return next;
    });
  const levelOf = (at: number): number => {
    let level = 1;
    for (let up = outline.nodes[at]!.parent; up !== null; up = outline.nodes[up]!.parent)
      level += 1;
    return level;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (stop === null) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      onFollow(outline.nodes[stop]!.item.target);
      return;
    }
    const move = PdfOutline.key(outline, open, stop, event.key);
    if (!move) return;
    event.preventDefault();
    if (move.openAll) setOpen(PdfOutline.allOpen(outline));
    else if (move.open !== undefined || move.close !== undefined) toggle(move.open ?? move.close!);
    setFocused(move.focus);
    // Focus follows once the bookmark shows: a child is drawn after its parent unfolds.
    requestAnimationFrame(() =>
      tree.current?.querySelector<HTMLElement>(`[data-pdf-bookmark="${move.focus}"]`)?.focus(),
    );
  };

  return (
    <>
      <div ref={tree} role="tree" aria-label="Bookmarks" onKeyDown={onKeyDown} className="py-1">
        {shown.map((at) => {
          const node = outline.nodes[at]!;
          const parent =
            node.parent === null ? PdfOutline.roots(outline) : outline.nodes[node.parent]!.children;
          const folds = node.children.length > 0;
          const nowhere = pdfLinkOutcome(node.item.target, names).kind === 'nowhere';
          const level = levelOf(at);
          return (
            <div
              key={at}
              role="treeitem"
              aria-level={level}
              aria-setsize={parent.length}
              aria-posinset={parent.indexOf(at) + 1}
              aria-expanded={folds ? open.has(at) : undefined}
              aria-selected={false}
              aria-current={at === marked ? 'location' : undefined}
              tabIndex={at === stop ? 0 : -1}
              {...(at === stop ? { [OFFICE_PANEL_START]: '' } : {})}
              data-pdf-bookmark={at}
              onFocus={() => setFocused(at)}
              onClick={() => onFollow(node.item.target)}
              style={{ paddingLeft: 4 + (level - 1) * 16 }}
              className={`flex min-h-8 cursor-pointer items-center pointer-coarse:min-h-11 gap-1 rounded-md pr-2 text-sm outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) ${
                at === marked ? 'bg-(--office-pressed) font-medium text-(--office-pressed-ink)' : ''
              }`}
            >
              <span
                aria-hidden="true"
                data-pdf-bookmark-fold={folds ? at : undefined}
                onClick={(event) => {
                  if (!folds) return;
                  event.stopPropagation();
                  toggle(at);
                }}
                className={`flex size-6 shrink-0 items-center justify-center rounded text-(--office-icon) ${
                  folds ? 'hover:bg-(--office-hover)' : 'invisible'
                }`}
              >
                <Glyph size={16} units={24}>
                  <g transform={open.has(at) ? 'rotate(90 12 12)' : undefined}>
                    <Prims prims={lucideChevronRight} />
                  </g>
                </Glyph>
              </span>
              <span className="min-w-0 flex-1 truncate">{node.item.title}</span>
              {nowhere ? (
                <span className="shrink-0 text-xs text-(--office-muted)">
                  {OUTLINE_COPY.nowhere}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {read.cut ? (
        <p className="px-2 py-2 text-xs text-(--office-muted)">{OUTLINE_COPY.cut}</p>
      ) : null}
    </>
  );
}
