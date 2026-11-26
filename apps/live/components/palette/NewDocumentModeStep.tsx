'use client';

// The New Document wizard's first step (docs/specs/007-editor/new-document-route.md "Choosing a mode"): what you are
// making, as the four openings that remain and the three document kinds, never a template. Each is a card of one build
// and one height: a fan of its own templates' previews on top (a kind, with none yet, a drawing of its blank page), then
// its mark, its name and its number key, then a line on what it makes. Four then three (one column on a phone).
// Choosing one creates the document at once; PDF document also offers Open a PDF file. Arrow keys move between the
// cards, and 1 to 7 (printed on each card) choose one straight away.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { TAB_OPENING_ICONS, lucideGlyph } from '@livedoc/ui';
import { lucideFileUp } from '@livedoc/icons/lucide';
import { TAB_OPENINGS, tabOpeningLabel, type TabOpening } from '@livedoc/document';
import { PreviewFan } from '@livedoc/template-previews';
import {
  NEW_DOCUMENT_KINDS,
  isNewDocumentKind,
  isBlankTemplate,
  newDocumentBlankOf,
  popularKindsFor,
  type NewDocumentKind,
  type TemplateKind,
} from '@livedoc/templates';
import { BLANK_GLYPHS } from '@/app/explorer/new-document/blank-glyphs';
import { KindPlate } from './KindPlate';
import { useLatest } from '@/hooks/ui/useLatest';
import { isTypingTarget } from '@/lib/typing-target';
import { Spinner } from './template-picker-icons';

// The openings in the order every list of what to make shows them (TAB_OPENINGS), Pages no longer offered (it is being
// retired): Sketch, Structured, Workshop, Plan.
export const NEW_DOCUMENT_MODES: readonly TabOpening[] = TAB_OPENINGS.filter((m) => m !== 'pages');

/** A choice of the step: an opening, or a document kind. */
export type NewDocumentStepChoice = TabOpening | NewDocumentKind;

// The openings, then the kinds: Text document, Spreadsheet, PDF document.
export const NEW_DOCUMENT_CHOICES: readonly NewDocumentStepChoice[] = [
  ...NEW_DOCUMENT_MODES,
  ...NEW_DOCUMENT_KINDS,
];

/** What a choice is made from: its blank, or (PDF document) a file chosen. */
export type NewDocumentSource = 'blank' | 'file';

// What each opening makes, in the words of the work rather than the tools.
const PITCH: Record<TabOpening, string> = {
  diagram: 'Flowcharts, mind maps, org charts and architecture, snapped neatly into place.',
  draw: 'A freehand whiteboard: pens, highlighters and shapes that tidy themselves.',
  pages: 'Infographics, slides, articles and logos, laid out to print, post or present.',
  plan: 'Boards and dashboards for the work in motion.',
  workshop: 'Run a collaborative session with your team, from workshops to retros.',
};

const nameOf = (choice: NewDocumentStepChoice): string =>
  isNewDocumentKind(choice) ? newDocumentBlankOf(choice)!.name : tabOpeningLabel(choice);
const pitchOf = (choice: NewDocumentStepChoice): string =>
  isNewDocumentKind(choice) ? newDocumentBlankOf(choice)!.pitch! : PITCH[choice];

// A mode's own templates, its Popular shelf without the blanks (its own, and Blank Spreadsheet): the fan's previews.
function examplesOf(mode: TabOpening): TemplateKind[] {
  return popularKindsFor(mode).filter((k) => !isBlankTemplate(k));
}

// Where each card sits in the twelve-track grid from 640px: the first row's four openings take three tracks each, the
// second row's three kinds take four, so both rows span the dialog at one height (`auto-rows-fr`).
export function modeCardSpan(index: number): string {
  return index < NEW_DOCUMENT_MODES.length ? 'sm:col-span-3' : 'sm:col-span-4';
}

function ModeCard({
  choice,
  index,
  selected,
  creating,
  onChoose,
  register,
}: {
  choice: NewDocumentStepChoice;
  index: number;
  selected: boolean;
  // This card's document is being made: its key gives way to a spinner.
  creating: boolean;
  onChoose: (source: NewDocumentSource) => void;
  register: (el: HTMLButtonElement | null) => void;
}) {
  const kind = isNewDocumentKind(choice) ? choice : null;
  const Icon = kind ? BLANK_GLYPHS[kind] : TAB_OPENING_ICONS[choice as TabOpening];
  const label = nameOf(choice);
  return (
    // The card: one button that makes its blank, and for PDF document a second that opens a file, side by side in one
    // frame (a button never holds another).
    <div
      data-mode-card=""
      className={`group relative flex flex-col overflow-hidden rounded-surface border bg-white transition duration-micro ease-out hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-xl hover:shadow-brand-900/10 focus-within:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-slate-900 dark:hover:border-brand-400 dark:hover:shadow-black/40 ${modeCardSpan(index)} ${
        selected
          ? 'border-brand-500 ring-2 ring-brand-500/30 dark:border-brand-400'
          : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <button
        ref={register}
        type="button"
        data-new-mode={choice}
        aria-pressed={selected}
        aria-busy={creating || undefined}
        aria-keyshortcuts={String(index + 1)}
        onClick={() => onChoose('blank')}
        className="flex flex-1 cursor-pointer flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        {/* The work it leads to: its templates fanned on a plate, wider on hover; a kind's own blank page. */}
        <span className="relative shrink-0 bg-gradient-to-br from-brand-50 via-slate-50 to-white px-3 py-1.5 dark:from-brand-500/10 dark:via-slate-900 dark:to-slate-900">
          {kind ? (
            <KindPlate kind={kind} />
          ) : (
            <PreviewFan
              kinds={examplesOf(choice as TabOpening)}
              plateClassName="h-20 rounded-surface !bg-transparent"
              cardClassName="h-12 [&>svg]:h-field"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3">
          <span className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-row shrink-0 items-center justify-center rounded-menu bg-brand-50 text-brand-700 transition group-hover:bg-brand-700 group-hover:text-white dark:bg-brand-500/15 dark:text-brand-300"
            >
              <Icon size={16} />
            </span>
            <span className="text-panel-title text-slate-900 dark:text-slate-50">
              {label}
              {/* The card is named by its own text, "Plan: Track work…", so everything it shows is in its
                  name (WCAG 2.5.3); the colon only separates the two for a screen reader. */}
              <span className="sr-only">: </span>
            </span>
            {/* The card's number key, as the keyboard picks it (aria-keyshortcuts carries it for assistive technology);
                left off a phone, which has no keys to press. While its document is made, a spinner in its place. */}
            {creating ? (
              <span data-mode-creating className="ml-auto flex text-brand-700 dark:text-brand-300">
                <Spinner />
              </span>
            ) : null}
            <kbd
              aria-hidden
              data-mode-key
              className={`ml-auto h-icon-title min-w-icon-title items-center justify-center rounded-control border border-slate-200 px-1 text-glyph text-slate-500 dark:border-slate-700 dark:text-slate-400 ${creating ? 'hidden' : 'hidden sm:flex'}`}
            >
              {/* Trimmed to its cap band, so centring lands on the digit, whatever the face (optical-alignment.md). */}
              <span className="text-optical-centre">{index + 1}</span>
            </kbd>
          </span>
          <span className="text-supporting text-slate-600 dark:text-slate-300">
            {pitchOf(choice)}
          </span>
        </span>
      </button>
      {kind === 'pdf-document' ? (
        <button
          type="button"
          onClick={() => onChoose('file')}
          className="mx-4 mb-3 inline-flex min-h-row cursor-pointer items-center gap-2 self-start rounded-control px-2 text-body text-brand-700 outline-none transition hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300 dark:hover:bg-brand-500/15"
        >
          <FileUpIcon aria-hidden />
          Open a PDF file
        </button>
      ) : null}
    </div>
  );
}

const FileUpIcon = lucideGlyph(lucideFileUp, 16);

export function NewDocumentModeStep({
  selected,
  creating = false,
  onChoose,
}: {
  // The choice picked so far: a `?mode=` preset, or the one being created.
  selected: NewDocumentStepChoice | null;
  // The chosen choice's document is being made.
  creating?: boolean;
  onChoose: (choice: NewDocumentStepChoice, source: NewDocumentSource) => void;
}) {
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  // The chosen (else Structured) card is focused on a desktop, so Enter or the arrows work at once.
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: fine)').matches) return;
    const at = Math.max(0, NEW_DOCUMENT_CHOICES.indexOf(selected ?? 'diagram'));
    cards.current[at]?.focus({ preventScroll: true });
    // Once, as the step appears.
    // oxlint-disable-next-line react/exhaustive-deps
  }, []);
  // 1 to 7 choose wherever the focus is on the page, as Escape backs out from anywhere: after a click on the backdrop
  // the focus is on the page, not a card, and the keys did nothing. A field being typed in, or a chord, keeps its digit.
  const choose = useLatest(onChoose);
  useEffect(() => {
    const onDigit = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target))
        return;
      const digit = Number(e.key);
      if (!Number.isInteger(digit) || digit < 1 || digit > NEW_DOCUMENT_CHOICES.length) return;
      e.preventDefault();
      choose.current(NEW_DOCUMENT_CHOICES[digit - 1]!, 'blank');
    };
    window.addEventListener('keydown', onDigit);
    return () => window.removeEventListener('keydown', onDigit);
  }, [choose]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    const at = cards.current.findIndex((c) => c === document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    const n = NEW_DOCUMENT_CHOICES.length;
    cards.current[(at + step + n) % n]?.focus();
  };
  return (
    <div role="group" aria-label="What are you making?" onKeyDown={onKeyDown}>
      <div className="grid grid-cols-1 gap-3 sm:auto-rows-fr sm:grid-cols-12 lvd-cascade">
        {NEW_DOCUMENT_CHOICES.map((choice, i) => (
          <ModeCard
            key={choice}
            choice={choice}
            index={i}
            selected={selected === choice}
            creating={creating && selected === choice}
            onChoose={(source) => onChoose(choice, source)}
            register={(el) => {
              cards.current[i] = el;
            }}
          />
        ))}
      </div>
    </div>
  );
}
