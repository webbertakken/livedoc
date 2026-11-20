'use client';

// Tools > Preferences (docs/specs/034-text-documents/tools.md "Preferences"): the typing aids on the General tab, the
// substitutions on the Substitutions tab, as Google's dialog has them; nothing changes until OK.
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { CloseIcon } from '@livedoc/ui';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import {
  isKeepable,
  REPLACE_MAX,
  SUBSTITUTIONS_OWN_MAX,
  TypingAids,
  WITH_MAX,
  type Substitution,
  type TypingAidSwitch,
} from '@/lib/text-document/text-document-typing-aids';

const GENERAL: readonly [TypingAidSwitch, string][] = [
  ['capitalise', 'Automatically capitalise words'],
  ['smartQuotes', 'Use smart quotes'],
  ['links', 'Automatically detect links'],
  ['lists', 'Automatically detect lists'],
  ['markdown', 'Automatically detect Markdown'],
];

type Tab = 'general' | 'substitutions';
const TABS: readonly [Tab, string][] = [
  ['general', 'General'],
  ['substitutions', 'Substitutions'],
];

const CHECKBOX = 'size-4 shrink-0 accent-(--office-primary)';
const FIELD =
  'h-8 min-w-0 flex-1 rounded border border-(--office-line) bg-transparent px-2 text-sm text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';

export const TOO_MANY_SUBSTITUTIONS = 'Remove a substitution to add another.';
export const UNKEEPABLE_SUBSTITUTION = `Fill in Replace (no spaces, up to ${REPLACE_MAX} characters) and With (up to ${WITH_MAX}).`;

export function TextDocumentPreferencesDialog({
  open,
  aids,
  onSave,
  onClose,
}: {
  open: boolean;
  // What the dialog opens with: the person's aids now.
  aids: TypingAids;
  onSave: (aids: TypingAids) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [tab, setTab] = useState<Tab>('general');
  const [draft, setDraft] = useState(aids);
  const [replace, setReplace] = useState('');
  const [withText, setWithText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const setPair = (index: number, next: Partial<Substitution>) =>
    setDraft((d) => ({
      ...d,
      pairs: d.pairs.map((p, i) => (i === index ? { ...p, ...next } : p)),
    }));
  const add = () => {
    if (replace === '' && withText === '') return;
    if (!isKeepable(replace, withText)) return setProblem(UNKEEPABLE_SUBSTITUTION);
    if (TypingAids.ownCount(draft) >= SUBSTITUTIONS_OWN_MAX)
      return setProblem(TOO_MANY_SUBSTITUTIONS);
    setDraft((d) => ({ ...d, pairs: [{ replace, with: withText, on: true }, ...d.pairs] }));
    setReplace('');
    setWithText('');
    setProblem(null);
  };
  const onTabKey = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next]![0]);
    tabs.current[next]?.focus();
  };

  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Preferences"
      primary={{
        label: 'OK',
        onPress: () =>
          onSave({ ...draft, pairs: draft.pairs.filter((p) => isKeepable(p.replace, p.with)) }),
      }}
    >
      <div
        role="tablist"
        aria-label="Preferences"
        className="mb-4 flex border-b border-(--office-line)"
      >
        {TABS.map(([value, label], index) => (
          <button
            key={value}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-${value}-tab`}
            aria-selected={tab === value}
            aria-controls={`${id}-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(e) => onTabKey(e, index)}
            className="relative flex-1 px-4 py-2 text-sm font-medium text-(--office-muted) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-selected:text-(--office-primary) aria-selected:after:absolute aria-selected:after:inset-x-4 aria-selected:after:bottom-0 aria-selected:after:h-[3px] aria-selected:after:rounded-t aria-selected:after:bg-(--office-primary)"
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'general' ? (
        <div
          role="tabpanel"
          id={`${id}-general`}
          aria-labelledby={`${id}-general-tab`}
          className="flex flex-col gap-3"
        >
          {GENERAL.map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
      ) : (
        <div
          role="tabpanel"
          id={`${id}-substitutions`}
          aria-labelledby={`${id}-substitutions-tab`}
          className="flex min-h-0 flex-col gap-3"
        >
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={draft.substitution}
              onChange={(e) => setDraft((d) => ({ ...d, substitution: e.target.checked }))}
            />
            Automatic substitution
          </label>
          <div className="flex items-end gap-2 pl-7">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-(--office-muted)">
              Replace
              <input
                className={FIELD}
                value={replace}
                maxLength={REPLACE_MAX}
                onChange={(e) => setReplace(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-(--office-muted)">
              With
              <input
                className={FIELD}
                value={withText}
                maxLength={WITH_MAX}
                aria-describedby={problem ? `${id}-problem` : undefined}
                onChange={(e) => setWithText(e.target.value)}
                onBlur={add}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  add();
                }}
              />
            </label>
            <span className="w-8 shrink-0" />
          </div>
          {problem ? (
            <p
              id={`${id}-problem`}
              role="alert"
              className="pl-7 text-xs text-red-700 dark:text-red-300"
            >
              {problem}
            </p>
          ) : null}
          <ul
            aria-label="Substitutions"
            className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1"
          >
            {draft.pairs.map((pair, index) => (
              <li key={`${index}-${pair.replace}`} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className={`${CHECKBOX} mx-1.5`}
                  aria-label={`Use substitution ${pair.replace}`}
                  checked={pair.on}
                  disabled={!draft.substitution}
                  onChange={(e) => setPair(index, { on: e.target.checked })}
                />
                <input
                  className={FIELD}
                  aria-label={`Replace ${pair.replace}`}
                  value={pair.replace}
                  maxLength={REPLACE_MAX}
                  onChange={(e) => setPair(index, { replace: e.target.value })}
                />
                <input
                  className={FIELD}
                  aria-label={`With for ${pair.replace}`}
                  value={pair.with}
                  maxLength={WITH_MAX}
                  onChange={(e) => setPair(index, { with: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Remove substitution ${pair.replace}`}
                  onClick={() =>
                    setDraft((d) => ({ ...d, pairs: d.pairs.filter((_, i) => i !== index) }))
                  }
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-(--office-icon) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
                >
                  <CloseIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </OfficeDialog>
  );
}
