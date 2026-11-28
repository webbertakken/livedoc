'use client';

// The fields office dialogs that browse a catalogue share (docs/specs/004-interface-design/fonts.md "More fonts",
// docs/specs/034-text-documents/objects.md "Special characters"): a search field whose Escape clears it before the
// dialog closes, a labelled select, and the message a list shows while it loads, fails or is empty.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { ChevronDownIcon, SearchIcon } from '@livedoc/ui';

export function OfficeDialogSearch({
  label,
  value,
  onChange,
  field,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  field?: RefObject<HTMLInputElement | null>;
}) {
  const own = useRef<HTMLInputElement | null>(null);
  const input = field ?? own;
  // Escape in a search with text clears it and goes no further, so the dialog stays (escape.md "A field leaves by its
  // own rule"). On the field itself, so it runs before the dialog's own Escape on the document.
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || element.value === '') return;
      e.stopPropagation();
      e.preventDefault();
      onChange('');
    };
    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, [input, onChange]);
  return (
    <div className="flex min-w-48 flex-1 items-center gap-2 rounded-full bg-(--office-toolbar) px-4 focus-within:ring-2 focus-within:ring-(--office-focus)">
      <span aria-hidden="true" className="text-(--office-icon)">
        <SearchIcon size={18} />
      </span>
      <input
        ref={input}
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-field min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-(--office-muted)"
      />
    </div>
  );
}

export function OfficeDialogSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  disabled = false,
  width,
  labelOf,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  // The label read, not shown, where the options speak for themselves.
  hideLabel?: boolean;
  disabled?: boolean;
  // A fixed width (a Tailwind class), where the longest option would otherwise size the select.
  width?: string;
  // What each option reads as, where its value is an id or a code (a locale's name); the value itself otherwise.
  labelOf?: (option: T) => string;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-body text-(--office-muted)">
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      <span className={`relative inline-flex min-w-0 ${width ?? ''}`}>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as T)}
          className="h-field w-full min-w-0 cursor-pointer appearance-none truncate rounded-control border border-(--office-line) bg-transparent pr-6 pl-3 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) disabled:cursor-default disabled:opacity-40 [&>option]:bg-(--office-menu)"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {labelOf ? labelOf(option) : option}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-(--office-icon)"
        >
          <ChevronDownIcon size={14} />
        </span>
      </span>
    </label>
  );
}

export function OfficeDialogMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-control border border-(--office-line) text-body text-(--office-muted) max-sm:py-8">
      {children}
    </div>
  );
}
