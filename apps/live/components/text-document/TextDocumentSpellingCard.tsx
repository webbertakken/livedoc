'use client';

// The Spelling and grammar card (docs/specs/034-text-documents/tools.md "Spelling and grammar"): ⌘⌥X's card at the top
// right of the writing, walking its misspellings one at a time: the word, its suggestions to choose from, Accept,
// Ignore, Add to personal dictionary, Previous, Next and Close. The look and copy are (default) until a capture.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { lucideChevronDown, lucideChevronUp, lucideX } from '@livedoc/icons/lucide';
import { Button, lucideGlyph } from '@livedoc/ui';
import { OfficeIconButton } from '@/components/office/OfficeTitleActions';

const PreviousIcon = lucideGlyph(lucideChevronUp, 18);
const NextIcon = lucideGlyph(lucideChevronDown, 18);
const CloseIcon = lucideGlyph(lucideX, 18);

export const NO_SPELLING_SUGGESTIONS = 'No spelling suggestions';
export const NO_SUGGESTIONS = 'No suggestions';

export type SpellingCardWord = { readonly word: string; readonly suggestions: readonly string[] };

export function TextDocumentSpellingCard({
  current,
  onAccept,
  onIgnore,
  onAdd,
  onNext,
  onPrevious,
  onClose,
}: {
  /** The misspelling shown, or null with none left. */
  current: SpellingCardWord | null;
  onAccept: (suggestion: string) => void;
  onIgnore: () => void;
  onAdd: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const card = useRef<HTMLDivElement>(null);
  // The suggestion chosen, by the word it belongs to: a new word starts on its first suggestion.
  const [chosen, setChosen] = useState<{ word: string; suggestion: string } | null>(null);
  const suggestion =
    current && chosen?.word === current.word && current.suggestions.includes(chosen.suggestion)
      ? chosen.suggestion
      : current?.suggestions[0];

  // The card takes the keyboard as it opens and again for each word it shows (what had it may be gone): on the
  // suggestion chosen (arrows choose another, Tab reaches Accept), else on its first button.
  const shownWord = current?.word ?? null;
  useEffect(() => {
    const start =
      card.current?.querySelector<HTMLElement>('input:checked') ??
      card.current?.querySelector<HTMLElement>('button');
    start?.focus();
  }, [shownWord]);

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  };

  return (
    <div
      ref={card}
      role="dialog"
      aria-label="Spelling and grammar"
      onKeyDown={keys}
      className="office-shell absolute top-2 right-4 z-20 flex w-72 flex-col gap-2 rounded-control border border-(--office-line) bg-(--office-dialog) p-3 text-(--office-ink) shadow-lg"
    >
      <div className="flex items-center gap-1">
        <h2 className="min-w-0 flex-1 text-body font-medium">Spelling and grammar</h2>
        {current ? (
          <>
            <OfficeIconButton label="Previous" onClick={onPrevious}>
              <PreviousIcon />
            </OfficeIconButton>
            <OfficeIconButton label="Next" onClick={onNext}>
              <NextIcon />
            </OfficeIconButton>
          </>
        ) : null}
        <OfficeIconButton label="Close" onClick={onClose}>
          <CloseIcon />
        </OfficeIconButton>
      </div>
      {current ? (
        <>
          <p id={`${id}-change`} className="text-body">
            Change <span className="font-medium text-document-misspelt">{current.word}</span> to
          </p>
          {current.suggestions.length > 0 ? (
            <div role="radiogroup" aria-labelledby={`${id}-change`} className="flex flex-col gap-1">
              {current.suggestions.map((s) => (
                <label key={s} className="flex items-center gap-2 text-body">
                  <input
                    type="radio"
                    name={`${id}-suggestion`}
                    checked={s === suggestion}
                    onChange={() => setChosen({ word: current.word, suggestion: s })}
                    className="size-icon-row shrink-0 accent-(--office-primary)"
                  />
                  {s}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-body text-(--office-muted)">{NO_SUGGESTIONS}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => suggestion !== undefined && onAccept(suggestion)}
              disabled={suggestion === undefined}
            >
              Accept
            </Button>
            <Button variant="secondary" onClick={onIgnore}>
              Ignore
            </Button>
            <Button variant="ghost" onClick={onAdd}>
              Add to personal dictionary
            </Button>
          </div>
        </>
      ) : (
        <p role="status" className="text-body text-(--office-muted)">
          {NO_SPELLING_SUGGESTIONS}
        </p>
      )}
    </div>
  );
}
