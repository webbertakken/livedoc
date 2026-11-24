// The bar under a header being edited, over a footer (docs/specs/034-text-documents/page-layout.md "Editing headers and
// footers", "The bar"): Different first page, Link to previous (in a section after the first) and Options, whose menu
// holds Header format, Page numbers and Remove header. A toolbar reached from the header with Alt+F10 and left back
// to it with Escape.
import { useState, type KeyboardEvent, type RefObject } from 'react';
import { ChevronDownIcon } from '@livedoc/ui';
import type { HeaderFooterKind } from '@livedoc/text-documents';
import { noShortcuts, type OfficeActions, type OfficeEntry } from '@/lib/office/office-catalogue';
import { OfficeMenuPanel } from '@/components/office/OfficeMenuPanel';
import { OfficePopup } from '@/components/office/OfficePopup';

/** The Options menu's entries. */
export function headerOptionsEntries(kind: HeaderFooterKind): readonly OfficeEntry[] {
  const name = kind === 'header' ? 'Header' : 'Footer';
  const entry = (id: string, label: string, built: boolean): OfficeEntry => ({
    kind: 'item',
    id,
    label,
    level: 'edit',
    status: built ? 'built' : 'comingSoon',
  });
  return [
    entry(`${kind}-format`, `${name} format`, true),
    entry(`${kind}-page-numbers`, 'Page numbers', true),
    { kind: 'separator' },
    entry(`remove-${kind}`, `Remove ${kind}`, true),
  ];
}

export type TextDocumentHeaderBarProps = {
  kind: HeaderFooterKind;
  differentFirst: boolean;
  /** Shown in a section after the first only. */
  later: boolean;
  linked: boolean;
  onFirst: () => void;
  onLink: () => void;
  onRemove: () => void;
  /** Header format (Footer format): Headers and footers options. */
  onFormat: () => void;
  /** Page numbers: the Page numbers dialog. */
  onPageNumbers: () => void;
  /** Escape: back into the header or footer. */
  onBack: () => void;
  toolbar: RefObject<HTMLDivElement | null>;
};

const CONTROL =
  'flex items-center gap-2 rounded-control px-2 py-1 hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-(--office-focus)';

export function TextDocumentHeaderBar({
  kind,
  differentFirst,
  later,
  linked,
  onFirst,
  onLink,
  onRemove,
  onFormat,
  onPageNumbers,
  onBack,
  toolbar,
}: TextDocumentHeaderBarProps) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const label = kind === 'header' ? 'Header options' : 'Footer options';
  const actions: OfficeActions = {
    [`${kind}-format`]: { run: onFormat },
    [`${kind}-page-numbers`]: { run: onPageNumbers },
    [`remove-${kind}`]: { run: onRemove, disabled: linked },
  };
  // Arrows move along the bar; Escape goes back into the writing.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !open) {
      event.preventDefault();
      event.stopPropagation();
      onBack();
      return;
    }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const controls = [...(toolbar.current?.querySelectorAll<HTMLElement>('input, button') ?? [])];
    const at = controls.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    controls[(at + step + controls.length) % controls.length]?.focus();
  };
  return (
    <div
      ref={toolbar}
      role="toolbar"
      aria-label={label}
      data-header-bar={kind}
      onKeyDown={onKeyDown}
      className={`absolute left-0 flex items-center gap-2 text-supporting text-(--text-document-mark-ink) ${
        kind === 'header' ? 'top-full mt-1' : 'bottom-full mb-1'
      }`}
      style={{ paddingLeft: 'inherit' }}
    >
      <label className={CONTROL}>
        <input
          type="checkbox"
          className="size-3.5 accent-(--office-primary)"
          checked={differentFirst}
          onChange={onFirst}
        />
        Different first page
      </label>
      {later ? (
        <label className={CONTROL}>
          <input
            type="checkbox"
            className="size-3.5 accent-(--office-primary)"
            checked={linked}
            onChange={onLink}
          />
          Link to previous
        </label>
      ) : null}
      <button
        ref={setTrigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={CONTROL}
      >
        Options
        <ChevronDownIcon size={12} />
      </button>
      {open ? (
        <OfficePopup anchor={trigger}>
          <OfficeMenuPanel
            entries={headerOptionsEntries(kind)}
            actions={actions}
            shortcutOf={noShortcuts}
            trigger={trigger}
            initialFocus="first"
            placement="popup"
            label="Options"
            onClose={() => setOpen(false)}
            onDone={() => setOpen(false)}
          />
        </OfficePopup>
      ) : null}
    </div>
  );
}
