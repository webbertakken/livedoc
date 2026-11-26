'use client';

import { useLayoutEffect, useState } from 'react';
import { Button, CloseIcon, useEscape } from '@livedoc/ui';
import type { TabOpening } from '@livedoc/document';
import {
  BLANK_TEMPLATE_FOR_OPENING,
  isNewDocumentKind,
  type NewDocumentKind,
  type TemplateKind,
} from '@livedoc/templates';
import { HelpArticleLink } from '@/components/primitives/HelpArticleLink';
import { useModalGuard } from '@/hooks/ui/useModalGuard';
import { takeEarlyModeChoice } from '@/app/new/early-mode-choice';
import { CanvasModalCard } from './CanvasModalCard';
import {
  NewDocumentModeStep,
  type NewDocumentSource,
  type NewDocumentStepChoice,
} from './NewDocumentModeStep';
import { FolderOpenIcon, SparkleIcon, Spinner } from './template-picker-icons';

// The New Document wizard (docs/specs/007-editor/new-document-route.md "One-step wizard"): one question, what you are
// making, answered by choosing a mode, which creates the document at once. It asks nothing about where the document
// goes or what it is called: /new stores and files it by default (Save Locations, Default folders), and it opens on
// its mode's start, where the templates are. Escape and the X back out, creating nothing; Skip makes a Blank Diagram.
export function NewDocumentWizard({
  busy = false,
  initialMode = null,
  onCreate,
  onCreateKind,
  onSkip,
  onBackOut,
  onOpenExisting,
}: {
  // The create is in flight: Create shows its spinner and nothing else creates.
  busy?: boolean;
  // A `/new?mode=` preset: its card is chosen, and Create makes its blank.
  initialMode?: TabOpening | null;
  // Make the document from a mode's blank.
  onCreate: (kind: TemplateKind) => void;
  // Make a document of a kind: its blank, or (PDF document) a file chosen.
  onCreateKind: (kind: NewDocumentKind, source: NewDocumentSource) => void;
  // Make a Blank Diagram with its start closed (the documented Skip defaults).
  onSkip: () => void;
  // Back to the page that opened /new, creating nothing.
  onBackOut: () => void;
  // To the Explorer, to open a document that exists.
  onOpenExisting?: () => void;
}) {
  useModalGuard(true);
  const [chosen, setChosen] = useState<NewDocumentStepChoice | null>(null);
  // Pages is no longer offered: its preset chooses nothing (new-document-route.md "Choosing a mode").
  const mode = chosen ?? (initialMode === 'pages' ? null : initialMode);
  const create = (next: NewDocumentStepChoice | null, source: NewDocumentSource = 'blank') => {
    if (busy) return;
    // Open a PDF file chooses no card: the chooser may be left, and nothing is made then.
    if (next && source === 'blank') setChosen(next);
    if (next && isNewDocumentKind(next)) return onCreateKind(next, source);
    onCreate(BLANK_TEMPLATE_FOR_OPENING[next ?? 'diagram']);
  };
  // A card clicked before hydration is chosen now, before the browser can hand React another event.
  useLayoutEffect(() => {
    const early = takeEarlyModeChoice();
    if (early) create(early);
    // Once, as the wizard mounts.
    // oxlint-disable-next-line react/exhaustive-deps
  }, []);
  useEscape(() => {
    if (!busy) onBackOut();
  });
  return (
    <CanvasModalCard label="Start a new document" width="sm:w-[44rem] lg:w-[58rem]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 pb-5 pt-6 dark:border-slate-800">
        <div>
          <h2 className="text-dialog-title text-slate-900 dark:text-slate-50">New Document</h2>
          <p className="mt-1 text-body text-slate-500 dark:text-slate-300">
            What are you making today?
          </p>
        </div>
        <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-0.5">
          <HelpArticleLink
            article="templates"
            className="!size-field !rounded-control !border-0 !text-body !text-slate-500 hover:!bg-slate-100 hover:!text-slate-700 dark:!text-slate-400 dark:hover:!bg-slate-800 dark:hover:!text-slate-200"
          />
          <button
            type="button"
            // The X backs out as Escape does, creating nothing (new-document-route.md "Escape backs out").
            onClick={() => {
              if (!busy) onBackOut();
            }}
            aria-label="Close"
            className="flex size-field shrink-0 items-center justify-center rounded-menu text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
        <NewDocumentModeStep selected={mode} creating={busy} onChoose={create} />
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
        {onOpenExisting ? (
          <button
            type="button"
            onClick={onOpenExisting}
            className="mr-auto inline-flex items-center gap-2 rounded-menu px-3 py-2 text-body text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <FolderOpenIcon />
            Open Existing Document
          </button>
        ) : (
          <span className="mr-auto" />
        )}
        <Button
          variant="secondary"
          size="xs"
          onClick={onSkip}
          disabled={busy}
          className="rounded-menu py-2"
        >
          Skip
        </Button>
        <Button
          size="xs"
          onClick={() => create(mode)}
          disabled={busy}
          className="gap-2 rounded-menu px-4 py-2 shadow-sm"
        >
          {busy ? <Spinner /> : <SparkleIcon />}
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </CanvasModalCard>
  );
}
