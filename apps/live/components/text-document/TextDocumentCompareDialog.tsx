'use client';

// Tools > Compare documents' dialog (docs/specs/034-text-documents/review.md "The dialog"): the person's own text
// documents but this one, newest first, narrowed by a search; who the differences are attributed to; whether the
// selected document's comments come with it. Compare waits for a document chosen; a refusal is said with the choices
// kept; once made, Open shows the comparison in a new browser tab.
import { useCallback, useId, useState } from 'react';
import type { DocumentSummary } from '@livedoc/api-schema';
import { Button, TextInput } from '@livedoc/ui';
import { SUGGESTION_AUTHOR_NAME_MAX } from '@livedoc/text-documents';
import { Dialog } from '@/components/dialogs/Dialog';
import { DialogFooter } from '@/components/dialogs/DialogFooter';
import { useOwnDocuments } from '@/components/dialogs/useOwnDocuments';
import {
  COMPARE_REFUSAL_COPY,
  type CompareOutcome,
} from '@/lib/text-document/text-document-compare';

/** What the person chose: the document, the attribution as typed, and whether its comments come. */
export type CompareChoice = {
  selected: { id: string; name: string };
  name: string;
  comments: boolean;
};

/**
 * The documents it may be compared against: the person's own that hold a text document, as their summaries say, but
 * `currentId`, newest first.
 */
export function compareTargets(
  documents: readonly DocumentSummary[],
  currentId: string,
): DocumentSummary[] {
  return documents
    .filter((d) => d.textDocument === true && d.id !== currentId)
    .sort((a, b) => b.savedAt - a.savedAt);
}

type Step =
  | { kind: 'choosing'; refusal: string | null }
  | { kind: 'comparing' }
  | { kind: 'ready'; documentId: string };

export function TextDocumentCompareDialog({
  ownerId,
  currentId,
  documentName,
  defaultName,
  onCompare,
  onOpen,
  onClose,
}: {
  ownerId: string;
  currentId: string;
  documentName: string;
  /** The person's commenting name, the attribution's first value. */
  defaultName: string;
  onCompare: (choice: CompareChoice) => Promise<CompareOutcome>;
  onOpen: (documentId: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const pick = useCallback(
    (documents: readonly DocumentSummary[]) => compareTargets(documents, currentId),
    [currentId],
  );
  const { listing, retry } = useOwnDocuments(ownerId, pick, 'text-document compare');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<DocumentSummary | null>(null);
  const [name, setName] = useState(defaultName);
  const [comments, setComments] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'choosing', refusal: null });
  const wanted = query.trim().toLowerCase();
  const shown =
    listing.state === 'ready'
      ? listing.documents.filter((d) => d.name.toLowerCase().includes(wanted))
      : [];

  const compare = async () => {
    if (!chosen) return;
    setStep({ kind: 'comparing' });
    const outcome = await onCompare({
      selected: { id: chosen.id, name: chosen.name },
      name,
      comments,
    });
    setStep(
      outcome.ok
        ? { kind: 'ready', documentId: outcome.documentId }
        : { kind: 'choosing', refusal: COMPARE_REFUSAL_COPY[outcome.refusal](chosen.name) },
    );
  };

  if (step.kind === 'ready')
    return (
      <Dialog open onClose={onClose} titleId={titleId}>
        <div className="flex flex-col gap-3 px-6 pt-6 pb-4">
          <h2 id={titleId} className="text-dialog-title text-slate-900 dark:text-slate-50">
            Comparison ready
          </h2>
          <p className="text-body text-slate-600 dark:text-slate-300">
            The differences are suggestions in a new document.
          </p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => onOpen(step.documentId)}>
            Open
          </Button>
        </DialogFooter>
      </Dialog>
    );

  const busy = step.kind === 'comparing';
  return (
    <Dialog open onClose={onClose} titleId={titleId}>
      <div className="flex flex-col gap-3 px-6 pt-6 pb-4">
        <h2 id={titleId} className="text-dialog-title text-slate-900 dark:text-slate-50">
          Compare documents
        </h2>
        <p className="text-body text-slate-700 dark:text-slate-200">
          Compare <span className="font-medium">{documentName}</span> against
        </p>
        <TextInput
          aria-label="Search your text documents"
          placeholder="Search your text documents"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {listing.state === 'loading' ? (
          <p role="status" className="text-body text-slate-600 dark:text-slate-300">
            Loading your text documents…
          </p>
        ) : listing.state === 'failed' ? (
          <div
            role="alert"
            className="flex items-center gap-3 text-body text-slate-700 dark:text-slate-200"
          >
            <span>Your text documents could not be listed.</span>
            <Button variant="secondary" size="xs" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-body text-slate-600 dark:text-slate-300">
            {listing.documents.length === 0
              ? 'You have no other text documents yet.'
              : 'No text documents match'}
          </p>
        ) : (
          <fieldset className="max-h-64 overflow-y-auto rounded-menu border border-slate-200 dark:border-slate-700">
            <legend className="sr-only">Your text documents</legend>
            {shown.map((d) => (
              <label
                key={d.id}
                className="flex min-h-row cursor-pointer items-center gap-2 px-3 text-body text-slate-700 hover:bg-slate-50 pointer-coarse:min-h-11 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                <input
                  type="radio"
                  name={`${titleId}-document`}
                  checked={chosen?.id === d.id}
                  onChange={() => setChosen(d)}
                />
                <span className="truncate">{d.name}</span>
              </label>
            ))}
          </fieldset>
        )}
        <label className="flex flex-col gap-1 text-body text-slate-700 dark:text-slate-200">
          Attribute differences to
          <TextInput
            value={name}
            maxLength={SUGGESTION_AUTHOR_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-body text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={comments}
            onChange={(e) => setComments(e.target.checked)}
          />
          Include comments from the selected document
        </label>
        <p className="text-supporting text-slate-500 dark:text-slate-400">
          Suggestions in either document are left out.
        </p>
        {step.kind === 'choosing' && step.refusal ? (
          <p role="alert" className="text-body text-red-700 dark:text-red-300">
            {step.refusal}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!chosen || busy} onClick={() => void compare()}>
          {busy ? 'Comparing…' : 'Compare'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
