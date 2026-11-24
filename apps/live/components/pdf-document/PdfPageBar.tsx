'use client';

// A PDF document's page bar (docs/specs/035-pdf-documents/reading-surface.md "The page bar"): bottom centre, floating
// over the pages, a group named "Page and zoom": the page in view and how many there are, the moves to the page
// before and after, and the zoom with its steps, in the shell's tokens.
import { useState, type ReactNode, type Ref } from 'react';
import { Glyph, HoverCard, Prims } from '@livedoc/ui';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideMinus,
  lucidePlus,
} from '@livedoc/icons/lucide';
import type { IconPrim } from '@livedoc/icons';
import { PDF_ZOOM_MAX, PDF_ZOOM_MIN } from '@livedoc/pdf-documents';
import { OfficeListField, type OfficeListOption } from '@/components/office/OfficeListField';
import { PDF_ZOOM_MENU_PERCENTS } from '@/lib/pdf-document/pdf-menus';
import { PdfView, type PdfZoom } from '@/lib/pdf-document/pdf-view';
import type { PdfViewer, PdfZoomWay } from '@/lib/pdf-document/usePdfView';

/** "There is no page 99." (reading-surface.md "The page bar"). */
export const noPageCopy = (typed: string): string => `There is no page ${typed.trim()}.`;

const ZOOM_OPTIONS: readonly OfficeListOption<PdfZoom>[] = [
  { label: 'Fit width', value: 'fit-width' },
  { label: 'Fit page', value: 'fit-page' },
  { label: 'Actual size', value: 1 },
  ...PDF_ZOOM_MENU_PERCENTS.filter((percent) => percent !== 100).map((percent) => ({
    label: `${percent}%`,
    value: percent / 100,
  })),
];

// A scale this near an option's is it.
const SAME_SCALE = 1e-6;

/** The option the zoom in force is, marked in the list; -1 where it is none of them. */
const optionOf = (zoom: PdfZoom): number =>
  ZOOM_OPTIONS.findIndex((option) =>
    typeof option.value === 'number' && typeof zoom === 'number'
      ? Math.abs(option.value - zoom) < SAME_SCALE
      : option.value === zoom,
  );

const wayOf = (zoom: PdfZoom): PdfZoomWay =>
  zoom === 'fit-width'
    ? 'FitWidth'
    : zoom === 'fit-page'
      ? 'FitPage'
      : zoom === 1
        ? 'Actual'
        : 'Custom';

const BUTTON =
  'relative flex h-7 w-7 shrink-0 items-center justify-center rounded text-(--office-icon) outline-none touch-target-y hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) disabled:opacity-40 disabled:hover:bg-transparent';

function BarButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: readonly IconPrim[];
  disabled: boolean;
  onPress: () => void;
}): ReactNode {
  return (
    <HoverCard title={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onPress}
        className={BUTTON}
      >
        <Glyph size={18} units={24}>
          <Prims prims={icon} />
        </Glyph>
      </button>
    </HoverCard>
  );
}

export type PdfPageBarProps = {
  /** The page in view, by its index, and each page's label: null where the file gives none. */
  page: number;
  labels: readonly (string | null)[];
  atFirst: boolean;
  atLast: boolean;
  zoom: PdfZoom;
  /** The scale the zoom is now: 1 is 100%. */
  scale: number;
  onPrevious: () => void;
  onNext: () => void;
  onGoTo: (index: number) => void;
  onZoom: (zoom: PdfZoom, way: PdfZoomWay) => void;
  /** The page field, which Go to > Page… puts the caret in. */
  pageField?: Ref<HTMLInputElement>;
};

export function PdfPageBar({
  page,
  labels,
  atFirst,
  atLast,
  zoom,
  scale,
  onPrevious,
  onNext,
  onGoTo,
  onZoom,
  pageField,
}: PdfPageBarProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const count = labels.length;
  // A file whose pages have labels is typed to in letters too (reading-surface.md "Go to page").
  const labelled = labels.some((label) => label !== null);

  const goTo = () => {
    const typed = draft ?? '';
    const index = PdfView.parsePage(typed, labels);
    setDraft(null);
    if (index === null) {
      if (typed.trim() !== '') setProblem(noPageCopy(typed));
      return;
    }
    onGoTo(index);
  };

  return (
    // Never under the document group at the bottom right: on a narrow window the bar sits above its line.
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-4 phone:bottom-16">
      {problem ? (
        <p
          role="status"
          className="pointer-events-auto rounded-md bg-(--office-menu) px-3 py-1.5 text-sm text-(--office-ink) shadow-lg"
        >
          {problem}
        </p>
      ) : (
        <p role="status" className="sr-only" />
      )}
      <div
        role="group"
        aria-label="Page and zoom"
        data-pdf-page-bar
        data-region="pagebar"
        onKeyDownCapture={() => setProblem(null)}
        onPointerDownCapture={() => setProblem(null)}
        className="pointer-events-auto flex h-10 items-center gap-0.5 rounded-3xl bg-(--office-toolbar) px-2 shadow-md outline outline-1 outline-(--office-line)"
      >
        <BarButton
          label="Previous page"
          icon={lucideChevronLeft}
          disabled={atFirst}
          onPress={onPrevious}
        />
        <label className="relative flex h-7 items-center gap-1 px-1 text-sm text-(--office-ink) touch-target-y">
          <input
            ref={pageField}
            aria-label="Page"
            inputMode={labelled ? 'text' : 'numeric'}
            data-pdf-page-field
            value={draft ?? String(page + 1)}
            // As wide as the file's last page number, or a short label, and a caret.
            style={{
              width: `calc(${Math.max(labelled ? 4 : 2, String(count).length)}ch + 0.75rem)`,
            }}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={() => setDraft(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                goTo();
              } else if (event.key === 'Escape' && draft !== null) {
                event.preventDefault();
                event.stopPropagation();
                setDraft(null);
              }
            }}
            className="rounded bg-transparent px-1 text-right text-(--office-ink) tabular-nums outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
          />
          <span aria-hidden="true" className="text-(--office-muted) tabular-nums">
            / {count}
          </span>
          <span className="sr-only">of {count}</span>
        </label>
        <BarButton label="Next page" icon={lucideChevronRight} disabled={atLast} onPress={onNext} />
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-(--office-line)" />
        <BarButton
          label="Zoom out"
          icon={lucideMinus}
          disabled={scale <= PDF_ZOOM_MIN}
          onPress={() => onZoom(PdfView.stepOut(scale), 'Out')}
        />
        <OfficeListField<PdfZoom>
          label="Zoom"
          listLabel="Zoom levels"
          controlId="pdf-zoom"
          shown={PdfView.percent(scale)}
          options={ZOOM_OPTIONS}
          selected={optionOf(zoom)}
          parse={PdfView.parseZoom}
          onTake={(value) => onZoom(value, wayOf(value))}
          tabIndex={0}
          inputClass="w-14 px-1 text-right tabular-nums"
        />
        <BarButton
          label="Zoom in"
          icon={lucidePlus}
          disabled={scale >= PDF_ZOOM_MAX}
          onPress={() => onZoom(PdfView.stepIn(scale), 'In')}
        />
      </div>
    </div>
  );
}

/** The page bar of a person's view: the page in view, the ends, the zoom and the turns are the viewer's own. */
export function PdfViewerPageBar({
  viewer,
  labels,
  onGoTo,
  pageField,
}: {
  viewer: Pick<PdfViewer, 'page' | 'atFirst' | 'atLast' | 'view' | 'scale' | 'turn' | 'zoomTo'>;
  labels: readonly (string | null)[];
  onGoTo: (index: number) => void;
  pageField?: Ref<HTMLInputElement>;
}) {
  return (
    <PdfPageBar
      page={viewer.page}
      labels={labels}
      atFirst={viewer.atFirst}
      atLast={viewer.atLast}
      zoom={viewer.view.zoom}
      scale={viewer.scale}
      onPrevious={() => viewer.turn(-1)}
      onNext={() => viewer.turn(1)}
      onGoTo={onGoTo}
      onZoom={viewer.zoomTo}
      pageField={pageField}
    />
  );
}
