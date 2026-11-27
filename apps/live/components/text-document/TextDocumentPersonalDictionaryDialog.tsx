'use client';

// Tools > Spelling and grammar > Personal dictionary (docs/specs/034-text-documents/tools.md "Spelling and grammar"):
// a field and Add, then the person's words in alphabetical order, each with its remove button. Each change is kept at
// once, so the dialog has no OK.
import { useId, useState } from 'react';
import { lucideX } from '@livedoc/icons/lucide';
import { Button, lucideGlyph } from '@livedoc/ui';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { OfficeIconButton } from '@/components/office/OfficeTitleActions';
import {
  DICTIONARY_FULL,
  PERSONAL_WORD_MAX,
  type PersonalDictionaryRefusal,
} from '@/lib/spelling/personal-dictionary';

const RemoveIcon = lucideGlyph(lucideX, 16);

export const NO_WORDS = 'No words yet';
export const PERSONAL_WORD_INVALID = `Enter one word, without spaces, up to ${PERSONAL_WORD_MAX} characters.`;
export const PERSONAL_WORD_PRESENT = 'That word is already in your dictionary.';
const REFUSALS: Record<PersonalDictionaryRefusal, string> = {
  invalid: PERSONAL_WORD_INVALID,
  present: PERSONAL_WORD_PRESENT,
  full: DICTIONARY_FULL,
};

const alphabetical = new Intl.Collator(undefined, { sensitivity: 'base' });

export function TextDocumentPersonalDictionaryDialog({
  words,
  onAdd,
  onRemove,
  onClose,
}: {
  words: readonly string[];
  /** Keeps the word; says why not, or null once kept. */
  onAdd: (word: string) => PersonalDictionaryRefusal | null;
  onRemove: (word: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [refusal, setRefusal] = useState<PersonalDictionaryRefusal | null>(null);
  const word = typed.trim();

  const add = () => {
    if (word === '') return;
    const refused = onAdd(word);
    setRefusal(refused);
    if (refused === null) setTyped('');
  };

  return (
    <OfficeDialog open onClose={onClose} title="Personal dictionary">
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex items-center gap-2">
          <input
            type="text"
            aria-label="Word"
            placeholder="Add a word"
            value={typed}
            aria-invalid={refusal !== null}
            aria-describedby={refusal ? `${id}-refusal` : undefined}
            onChange={(event) => {
              setTyped(event.target.value);
              setRefusal(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              add();
            }}
            className="h-field min-w-0 flex-1 rounded-control border border-(--office-line) bg-transparent px-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
          />
          <Button onClick={add} disabled={word === ''}>
            Add
          </Button>
        </div>
        {refusal ? (
          <p
            id={`${id}-refusal`}
            role="alert"
            className="text-caption text-red-700 dark:text-red-300"
          >
            {REFUSALS[refusal]}
          </p>
        ) : null}
        {words.length === 0 ? (
          <p className="text-body text-(--office-muted)">{NO_WORDS}</p>
        ) : (
          <ul aria-label="Your words" className="flex max-h-72 flex-col overflow-y-auto">
            {[...words].sort(alphabetical.compare).map((w) => (
              <li
                key={w}
                className="flex items-center justify-between gap-2 border-b border-(--office-line) py-1 text-body last:border-b-0"
              >
                {w}
                <OfficeIconButton label={`Remove ${w}`} onClick={() => onRemove(w)}>
                  <RemoveIcon />
                </OfficeIconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OfficeDialog>
  );
}
