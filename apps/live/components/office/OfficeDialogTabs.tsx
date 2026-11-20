'use client';

// An office dialog's tabs (docs/specs/004-interface-design/office-shell.md "Dialogs"): Google's underlined tabs across
// the dialog's width, the chosen one in the primary colour; arrow keys move between them and choose. Each panel is
// labelled by its tab through `officeTabPanel(id, value)`.
import { useRef, type KeyboardEvent } from 'react';

/** The ids and roles a tab's panel takes, so its tab labels it. */
export const officeTabPanel = (id: string, value: string) => ({
  role: 'tabpanel' as const,
  id: `${id}-${value}`,
  'aria-labelledby': `${id}-${value}-tab`,
});

export function OfficeDialogTabs<T extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
}: {
  // The dialog's own id (useId), prefixing each tab's and panel's.
  id: string;
  label: string;
  tabs: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next]![0]);
    buttons.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex border-b border-(--office-line)">
      {tabs.map(([tab, name], index) => (
        <button
          key={tab}
          ref={(el) => {
            buttons.current[index] = el;
          }}
          type="button"
          role="tab"
          id={`${id}-${tab}-tab`}
          aria-selected={value === tab}
          aria-controls={`${id}-${tab}`}
          tabIndex={value === tab ? 0 : -1}
          onClick={() => onChange(tab)}
          onKeyDown={(e) => onKey(e, index)}
          className="relative flex-1 px-4 py-2 text-sm font-medium text-(--office-muted) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-selected:text-(--office-primary) aria-selected:after:absolute aria-selected:after:inset-x-4 aria-selected:after:bottom-0 aria-selected:after:h-[3px] aria-selected:after:rounded-t aria-selected:after:bg-(--office-primary)"
        >
          {name}
        </button>
      ))}
    </div>
  );
}
