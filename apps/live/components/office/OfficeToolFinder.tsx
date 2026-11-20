'use client';

// The tool finder (docs/specs/004-interface-design/office-shell.md "Tool finder"): a search field over the menu bar
// that finds any menu item by its label, keywords or menu path, and runs the one chosen. A combobox owning a listbox;
// Escape closes it and focus goes back where it was.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { SearchIcon } from '@livedoc/ui';
import type { FoundItem, OfficeActions } from '@/lib/office/office-catalogue';
import { findTools, TOOL_FINDER_MAX_RESULTS } from '@/lib/office/tool-finder';
import type { ShortcutText } from '@/lib/office/shortcut-notation';

export function OfficeToolFinder({
  items,
  actions,
  shortcutOf,
  onClose,
  onRan,
}: {
  items: readonly FoundItem[];
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
  onClose: () => void;
  // A result ran (for telemetry).
  onRan: (item: FoundItem) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const listId = useId();
  const results = useMemo(() => findTools(items, query, TOOL_FINDER_MAX_RESULTS), [items, query]);
  const runnable = (found: FoundItem) => found.item.status === 'built' && actions[found.item.id];

  useEffect(() => {
    returnTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    field.current?.focus();
    return () => {
      if (returnTo.current?.isConnected) returnTo.current.focus({ preventScroll: true });
    };
  }, []);

  const choose = (found: FoundItem | undefined) => {
    if (!found) return;
    const action = runnable(found);
    if (!action || action.disabled) return;
    onClose();
    onRan(found);
    action.run();
  };

  return (
    <div className="absolute top-0 left-0 z-40 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-(--office-line) bg-(--office-menu) text-(--office-ink) shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <span aria-hidden="true" className="text-(--office-icon)">
          <SearchIcon size={18} />
        </span>
        <input
          ref={field}
          role="combobox"
          aria-label="Search the menus"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          placeholder="Search the menus"
          value={query}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--office-muted)"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.parentElement?.contains(e.relatedTarget)) onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (results.length === 0) return;
              const by = e.key === 'ArrowDown' ? 1 : -1;
              setActive((i) => (i + by + results.length) % results.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(results[active]);
            }
          }}
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Menu items"
        className={results.length > 0 ? 'border-t border-(--office-line) py-1' : 'hidden'}
      >
        {results.map((found, index) => {
          const soon = !runnable(found);
          const shortcut = found.item.shortcut ? shortcutOf(found.item.shortcut) : null;
          return (
            <li
              key={found.item.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              aria-disabled={soon || undefined}
              data-office-result={found.item.id}
              className={`flex cursor-default items-baseline gap-3 px-3 py-1.5 text-sm ${index === active ? 'bg-(--office-menu-hover)' : ''} ${soon ? 'opacity-50' : ''}`}
              onPointerDown={(e) => e.preventDefault()}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(found)}
            >
              <span className="whitespace-nowrap">{found.item.label}</span>
              <span className="flex-1 truncate text-xs text-(--office-muted)">
                {found.path.join(' › ')}
              </span>
              <span className="whitespace-nowrap text-xs text-(--office-muted)">
                {soon ? 'Coming soon' : (shortcut?.shown ?? '')}
              </span>
            </li>
          );
        })}
      </ul>
      <p role="status" className="sr-only">
        {query.trim() === ''
          ? ''
          : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
      </p>
    </div>
  );
}
