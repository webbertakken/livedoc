'use client';

// The Keyboard shortcuts dialog (docs/specs/004-interface-design/office-shell.md "Keyboard shortcuts dialog"): the
// kind's registry by group, each row's keys on this platform, filtered as words are typed. Mounted only while open,
// so it always opens on an empty search.
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { SearchIcon } from '@livedoc/ui';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import { shortcutListing, type ShortcutRow } from '@/lib/office/shortcut-registry';
import { OfficeDialog } from './OfficeDialog';

export function OfficeShortcutsDialog({
  rows,
  onClose,
}: {
  rows: readonly ShortcutRow[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement | null>(null);
  const where = useMemo(() => currentOfficePlatform(), []);
  const { groups, count } = useMemo(
    () => shortcutListing(rows, where, query),
    [rows, where, query],
  );
  const idBase = useId();

  // Escape in a search with text clears it and goes no further, so the dialog stays (escape.md "A field leaves by its
  // own rule"). On the field itself, so it runs before the dialog's own Escape on the document.
  useEffect(() => {
    const field = search.current;
    if (!field) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || field.value === '') return;
      e.stopPropagation();
      e.preventDefault();
      setQuery('');
    };
    field.addEventListener('keydown', onKeyDown);
    return () => field.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <OfficeDialog open onClose={onClose} title="Keyboard shortcuts" wide>
      <div className="flex items-center gap-2 rounded-full bg-(--office-toolbar) px-4 focus-within:ring-2 focus-within:ring-(--office-focus)">
        <span aria-hidden="true" className="text-(--office-icon)">
          <SearchIcon size={18} />
        </span>
        <input
          ref={search}
          type="search"
          aria-label="Search keyboard shortcuts"
          placeholder="Search keyboard shortcuts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-field min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-(--office-muted)"
        />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {count === 1 ? '1 shortcut' : `${count} shortcuts`}
      </p>
      <div
        role="group"
        aria-label="Shortcuts"
        tabIndex={0}
        className="mt-3 h-[60vh] min-h-0 overflow-y-auto rounded-control outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) max-sm:h-auto max-sm:flex-1"
      >
        {count === 0 ? (
          <p className="py-6 text-center text-body text-(--office-muted)">
            No shortcuts match “{query.trim()}”
          </p>
        ) : null}
        {groups.map((group, index) => (
          <section key={group.name} aria-labelledby={`${idBase}-${index}`} className="pt-4">
            <h3 id={`${idBase}-${index}`} className="pb-1 text-panel-title">
              {group.name}
            </h3>
            <dl>
              {group.rows.map((row) => (
                <div
                  key={row.id}
                  className={`flex items-baseline justify-between gap-4 border-b border-(--office-line) py-2 text-body ${
                    row.comingSoon ? 'text-(--office-muted)' : ''
                  }`}
                >
                  <dt className="min-w-0">
                    {row.action}
                    {row.comingSoon ? (
                      <span className="ml-2 text-supporting text-(--office-muted)">
                        Coming soon
                      </span>
                    ) : null}
                  </dt>
                  <dd className="shrink-0 text-right">
                    {row.ways.map((way, i) => (
                      <Fragment key={way}>
                        {i > 0 ? <span className="px-1 text-(--office-muted)">or</span> : null}
                        <kbd className="font-sans">{way}</kbd>
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </OfficeDialog>
  );
}
