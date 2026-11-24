'use client';

// A toolbar value field with a list (docs/specs/004-interface-design/office-shell.md "Toolbar", value fields), the
// WAI-ARIA combobox: a typed value applies on Enter, anything else puts the value back. Down or the chevron (else a press on the
// field) opens the list; Up and Down move through it, Enter takes one, Escape closes it, then puts back what was typed. The zoom and the
// font size are two of these.
import { useCallback, useId, useRef, useState } from 'react';
import { ChevronDownIcon, useClickOutside } from '@livedoc/ui';
import { OFFICE_POPUP, OfficePopup } from './OfficePopup';

export type OfficeListOption<T> = { label: string; value: T };

export function OfficeListField<T>({
  label,
  listLabel,
  controlId,
  shown,
  options,
  selected,
  parse,
  onTake,
  tabIndex,
  inputClass,
  chevron = true,
}: {
  // The field's name, and the chevron's.
  label: string;
  listLabel: string;
  // Its toolbar control id.
  controlId: string;
  // The value as text: what the field shows while nothing is typed.
  shown: string;
  options: readonly OfficeListOption<T>[];
  // The option the value is, if any: where the list opens.
  selected: number;
  // A typed value, or null when it is not one.
  parse: (text: string) => T | null;
  onTake: (value: T) => void;
  tabIndex: number;
  inputClass: string;
  // The list opens from a chevron beside the field; without one (the font size), from a press on the field.
  chevron?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // The field, as state too: the list opens from it.
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const attach = useCallback((element: HTMLDivElement | null) => {
    box.current = element;
    setAnchor(element);
  }, []);
  const listId = useId();
  useClickOutside(box, () => setOpen(false), open, OFFICE_POPUP);

  const take = (value: T) => {
    setDraft(null);
    setOpen(false);
    onTake(value);
  };
  const openList = () => {
    setActive(Math.max(0, selected));
    setOpen(true);
  };

  return (
    <div
      ref={attach}
      className="relative flex h-row items-center rounded-control hover:bg-(--office-hover)"
    >
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        tabIndex={tabIndex}
        data-office-control={controlId}
        value={draft ?? shown}
        size={4}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
        onClick={chevron || open ? undefined : openList}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (open) setActive((i) => (i + 1) % options.length);
            else openList();
          } else if (e.key === 'ArrowUp' && open) {
            e.preventDefault();
            setActive((i) => (i - 1 + options.length) % options.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open) take(options[active]!.value);
            else {
              const typed = draft === null ? null : parse(draft);
              if (typed !== null) take(typed);
              else setDraft(null);
            }
          } else if (e.key === 'Escape' && (open || draft !== null)) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setDraft(null);
          }
        }}
        className={`bg-transparent text-body text-(--office-ink) outline-none pointer-coarse:h-11 focus-visible:rounded-control focus-visible:ring-2 focus-visible:ring-(--office-focus) ${inputClass}`}
      />
      {chevron ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={listLabel}
          onClick={() => (open ? setOpen(false) : openList())}
          className="flex h-row w-6 items-center justify-center text-(--office-icon) outline-none pointer-coarse:h-11"
        >
          <ChevronDownIcon size={12} />
        </button>
      ) : null}
      {open ? (
        <OfficePopup anchor={anchor}>
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-80 min-w-24 overflow-y-auto rounded-menu bg-(--office-menu) py-1 text-body text-(--office-ink) shadow-lg"
          >
            {options.map((option, i) => (
              <li
                key={option.label}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === selected}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => take(option.value)}
                className={`flex h-row cursor-default items-center px-4 ${i === active ? 'bg-(--office-menu-hover)' : ''}`}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </OfficePopup>
      ) : null}
    </div>
  );
}
