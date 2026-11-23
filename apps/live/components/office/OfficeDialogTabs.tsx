'use client';

// An office dialog's tabs (docs/specs/004-interface-design/office-shell.md "Dialogs"): Google's underlined tabs across
// the dialog's width, the chosen one in the primary colour; arrow keys move between them and choose. Each panel is
// labelled by its tab through `officeTabPanel(id, value)`. A tab given an icon shows the icon, its name read instead
// (the emoji dialog's groups), where names would not fit across.
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

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
  disabled = [],
}: {
  // The dialog's own id (useId), prefixing each tab's and panel's.
  id: string;
  label: string;
  tabs: readonly (readonly [T, string] | readonly [T, string, ReactNode])[];
  value: T;
  onChange: (value: T) => void;
  // Tabs not yet built: drawn dimmed, never chosen, passed over by the arrow keys.
  disabled?: readonly T[];
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    let next = (index + step + tabs.length) % tabs.length;
    while (disabled.includes(tabs[next]![0]) && next !== index)
      next = (next + step + tabs.length) % tabs.length;
    onChange(tabs[next]![0]);
    buttons.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex border-b border-(--office-line)">
      {tabs.map(([tab, name, icon], index) => (
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
          aria-disabled={disabled.includes(tab) || undefined}
          onClick={() => {
            if (!disabled.includes(tab)) onChange(tab);
          }}
          onKeyDown={(e) => onKey(e, index)}
          className="relative flex-1 py-2 text-sm font-medium text-(--office-muted) outline-none hover:bg-(--office-hover) aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-selected:text-(--office-primary) aria-selected:after:absolute aria-selected:after:inset-x-4 aria-selected:after:bottom-0 aria-selected:after:h-[3px] aria-selected:after:rounded-t aria-selected:after:bg-(--office-primary)"
        >
          {icon === undefined ? (
            <span className="px-4">{name}</span>
          ) : (
            <>
              <span aria-hidden="true" className="text-lg leading-none">
                {icon}
              </span>
              <span className="sr-only">{name}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
