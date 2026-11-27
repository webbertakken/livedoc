'use client';

// Naming a version in place on its row (docs/specs/034-text-documents/review.md "Version history"): a text field over
// the row's title, the time as its placeholder; Enter keeps the name, and so does pressing elsewhere (default); Escape
// leaves it unchanged. An empty name removes it. Its keys never reach the list or the frame.
import { useEffect, useRef, useState } from 'react';

export function OfficeVersionNameField({
  initial,
  placeholder,
  maxLength,
  onKeep,
  onLeave,
}: {
  initial: string;
  placeholder: string;
  maxLength: number;
  onKeep: (name: string) => void;
  onLeave: () => void;
}) {
  const [value, setValue] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  // Kept or left once: the blur after Enter or Escape changes nothing more.
  const done = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    if (keep) onKeep(value.trim());
    else onLeave();
  };
  return (
    <input
      ref={field}
      type="text"
      aria-label="Version name"
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="h-field w-full rounded-control border border-(--office-line) bg-(--office-dialog) px-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
    />
  );
}
