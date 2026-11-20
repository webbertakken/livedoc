'use client';

// The office shell's title row (docs/specs/004-interface-design/office-shell.md "Parts"): the name with the format it
// keeps, the menu bar from the kind's catalogue under it, the tool finder over that, and the shortcut layer over the
// kind's surface. Every kind outside the canvas draws this one; its look is the shell's tokens (`office-shell.css`).
import { useCallback, useMemo, useState, type RefObject } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import { Tooltip } from '@livedoc/ui';
import {
  catalogueItems,
  visibleMenus,
  type OfficeActions,
  type OfficeCatalogue,
} from '@/lib/office/office-catalogue';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import type { ShortcutKeys } from '@/lib/office/shortcut-matcher';
import { shortcutTextOf } from '@/lib/office/shortcut-notation';
import { track } from '@/lib/telemetry';
import { OfficeMenuBar, type OpenMenu } from './OfficeMenuBar';
import { OfficeToolFinder } from './OfficeToolFinder';
import { useOfficeShortcuts, type ShortcutRun } from './useOfficeShortcuts';

// The registry rows the shell itself runs: `<menu>-menu` opens that menu (its access key), and the tool finder.
const TOOL_FINDER = 'tool-finder';
const accessKeyOf = (menuId: string) => `${menuId}-menu`;

export type OfficeFileOpening = {
  // The file picker's types, and what opening a picked file does.
  accept: string;
  onFile: (file: File) => void;
};

export function OfficeTitleRow({
  name,
  format,
  formatTitle,
  problem,
  catalogue,
  level,
  actions,
  shortcuts,
  keyScope,
  opening,
  telemetryKind,
}: {
  name: string;
  // The format's pill (".ODT") and what it is called ("OpenDocument format").
  format: string;
  formatTitle: string;
  problem: string | null;
  catalogue: OfficeCatalogue;
  level: AccessLevel;
  actions: OfficeActions;
  shortcuts: readonly { id: string; keys: ShortcutKeys }[];
  // The surface whose keys the shortcut layer hears.
  keyScope: RefObject<HTMLElement | null>;
  // File > Open's picker: binds the item `open`.
  opening?: OfficeFileOpening;
  // `TextDocument` sends `UI · Opened · TextDocumentMenu<Name>` and `UI · Used · TextDocumentToolFinder`.
  telemetryKind?: 'TextDocument';
}) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [finding, setFinding] = useState(false);
  const [picker, setPicker] = useState<HTMLInputElement | null>(null);

  const menus = useMemo(() => visibleMenus(catalogue, level), [catalogue, level]);
  const items = useMemo(() => catalogueItems(menus), [menus]);
  const shortcutOf = useMemo(() => shortcutTextOf(shortcuts, currentOfficePlatform()), [shortcuts]);

  const allActions: OfficeActions = useMemo(
    () => ({
      ...actions,
      ...(opening ? { open: { run: () => picker?.click() } } : {}),
      'search-the-menus': { run: () => setFinding(true) },
    }),
    [actions, opening, picker],
  );

  const onOpenMenu = useCallback(
    (next: OpenMenu) => {
      setOpenMenu(next);
      const label = next ? menus.find((m) => m.id === next.id)?.label : null;
      if (label && telemetryKind) track('UI', 'Opened', `${telemetryKind}Menu${label}`);
    },
    [menus, telemetryKind],
  );

  // What each registry row runs: the menus' access keys, the finder, and every built, bound item's shortcut.
  const runs = useMemo(() => {
    const out: Record<string, ShortcutRun> = {
      [TOOL_FINDER]: () => {
        setOpenMenu(null);
        setFinding(true);
      },
    };
    for (const menu of menus)
      out[accessKeyOf(menu.id)] = () => onOpenMenu({ id: menu.id, focus: 'first' });
    for (const { item } of items) {
      const action = allActions[item.id];
      if (item.shortcut && item.status === 'built' && action && !action.disabled)
        out[item.shortcut] ??= () => action.run();
    }
    return out;
  }, [menus, items, allActions, onOpenMenu]);
  useOfficeShortcuts({ scope: keyScope, rows: shortcuts, runs });

  return (
    <header className="office-shell flex items-start gap-3 bg-(--office-chrome) px-4 pt-2 pb-1 text-(--office-ink)">
      <div className="relative flex min-w-0 flex-col">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-lg">{name}</h1>
          <Tooltip label={formatTitle}>
            <span
              role="img"
              aria-label={formatTitle}
              className="rounded border border-(--office-line) px-1.5 text-xs font-medium text-(--office-muted)"
            >
              {format}
            </span>
          </Tooltip>
          {problem ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {problem}
            </p>
          ) : null}
        </div>
        <div className="-ml-2">
          <OfficeMenuBar
            menus={menus}
            actions={allActions}
            shortcutOf={shortcutOf}
            openMenu={openMenu}
            onOpenMenu={onOpenMenu}
            onCloseMenu={(id) => setOpenMenu((current) => (current?.id === id ? null : current))}
            label="Menu bar"
          />
        </div>
        {finding ? (
          <OfficeToolFinder
            items={items}
            actions={allActions}
            shortcutOf={shortcutOf}
            onClose={() => setFinding(false)}
            onRan={() => {
              if (telemetryKind) track('UI', 'Used', `${telemetryKind}ToolFinder`);
            }}
          />
        ) : null}
      </div>
      {opening ? (
        <input
          ref={setPicker}
          type="file"
          accept={opening.accept}
          aria-label="Open a file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) opening.onFile(file);
          }}
        />
      ) : null}
    </header>
  );
}
