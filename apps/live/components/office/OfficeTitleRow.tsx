'use client';

// The office shell's title row (docs/specs/004-interface-design/office-shell.md "Parts", "Title row"): the mark, the
// name with the format it keeps, star and move, the menu bar from the kind's catalogue under them, the tool finder over
// that, and on the right Settings, Share, the people here and the account; the shortcut layer listens over the kind's
// surface. Every kind outside the canvas draws this one; its look is the shell's tokens (`office-shell.css`).
import { useCallback, useMemo, useState, type RefObject } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import { Brand, Tooltip } from '@livedoc/ui';
import { EXPLORER_LANDING_PATH } from '@/lib/explorer-landing';
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
import type { OfficeChrome, OfficePerson } from './office-chrome';
import { OfficeMoveIcon, OfficeStarIcon } from './office-icons';
import { OfficeMenuBar, type OpenMenu } from './OfficeMenuBar';
import { OfficeNameField } from './OfficeNameField';
import { OfficeIconButton, OfficeTitleActions } from './OfficeTitleActions';
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
  chrome = null,
  tabId,
  onFollow,
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
  // The document's own parts, from the editor page; null outside it (a test), where the name is text alone.
  chrome?: OfficeChrome | null;
  // The tab this surface shows, and how it brings a person's selection here into view (false: not found).
  tabId?: string;
  onFollow?: (personId: string) => boolean;
}) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [finding, setFinding] = useState(false);
  const [picker, setPicker] = useState<HTMLInputElement | null>(null);
  const [renameNonce, setRenameNonce] = useState(0);

  const rename = chrome?.rename ?? null;
  const share = chrome?.share ?? null;
  const move = chrome?.move ?? null;
  const openMove = useMemo(() => {
    if (!move) return null;
    return () => {
      if (telemetryKind) track('UI', 'Opened', `${telemetryKind}Move`);
      move();
    };
  }, [move, telemetryKind]);

  // The document's own File items, bound where the session may use them; unbound, they are not drawn.
  const allActions: OfficeActions = useMemo(
    () => ({
      ...actions,
      ...(opening ? { open: { run: () => picker?.click() } } : {}),
      ...(rename ? { rename: { run: () => setRenameNonce((n) => n + 1) } } : {}),
      ...(openMove ? { move: { run: openMove } } : {}),
      ...(share ? { 'share-with-others': { run: share.onOpen } } : {}),
      'search-the-menus': { run: () => setFinding(true) },
    }),
    [actions, opening, picker, rename, share, openMove],
  );

  const menus = useMemo(
    () => visibleMenus(catalogue, level, allActions),
    [catalogue, level, allActions],
  );
  const items = useMemo(() => catalogueItems(menus), [menus]);
  const shortcutOf = useMemo(() => shortcutTextOf(shortcuts, currentOfficePlatform()), [shortcuts]);

  const follow = useCallback(
    (person: OfficePerson) => {
      if (telemetryKind) track('UI', 'Used', `${telemetryKind}Follow`);
      if (person.tabId === tabId) onFollow?.(person.participant.id);
      else chrome?.onOpenTab(person.tabId);
    },
    [chrome, onFollow, telemetryKind, tabId],
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
    <header className="office-shell flex items-start gap-1 bg-(--office-chrome) py-2 pr-4 pl-2 text-(--office-ink)">
      {chrome ? <OfficeMark back={chrome.back} /> : null}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex h-[26px] min-w-0 items-center gap-1">
          <OfficeNameField
            name={name}
            onRename={chrome?.rename ?? null}
            focusNonce={renameNonce + (chrome?.renameNonce ?? 0)}
          />
          <Tooltip label={formatTitle}>
            <span
              role="img"
              aria-label={formatTitle}
              className="shrink-0 rounded border border-(--office-line) px-1.5 text-xs font-medium text-(--office-muted)"
            >
              {format}
            </span>
          </Tooltip>
          {chrome?.star ? (
            <OfficeIconButton
              label={chrome.star.starred ? 'Starred' : 'Star'}
              pressed={chrome.star.starred}
              onClick={() => {
                if (telemetryKind) track('UI', 'Toggled', `${telemetryKind}Star`);
                chrome.star?.onToggle();
              }}
            >
              <OfficeStarIcon className={chrome.star.starred ? 'fill-current' : undefined} />
            </OfficeIconButton>
          ) : null}
          {openMove ? (
            <OfficeIconButton label="Move" onClick={openMove}>
              <OfficeMoveIcon />
            </OfficeIconButton>
          ) : null}
          {problem ? (
            <p role="alert" className="truncate text-sm text-red-700 dark:text-red-300">
              {problem}
            </p>
          ) : null}
        </div>
        <div className="-ml-0.5">
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
      {chrome ? (
        <div className="self-center">
          <OfficeTitleActions chrome={chrome} onFollow={follow} />
        </div>
      ) : null}
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

// The LiveDoc mark, where Google has its Docs icon: home, the Explorer (or the frame's back in a workbench).
function OfficeMark({ back }: { back: OfficeChrome['back'] }) {
  const logo = {
    wordmark: false,
    markClassName: 'size-8',
    className:
      'flex size-10 shrink-0 items-center justify-center rounded-full outline-none touch-target hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)',
    assemble: true,
  } as const;
  if (back.kind === 'frame')
    return (
      <Tooltip label={back.backTitle}>
        <Brand {...logo} label={`Back to ${back.backTitle}`} onClick={back.back} />
      </Tooltip>
    );
  return (
    <Tooltip label="Explorer">
      <Brand
        {...logo}
        href={EXPLORER_LANDING_PATH}
        newTab={back.newTab}
        label={back.newTab ? 'Explorer (opens in a new tab)' : 'Explorer'}
        onClick={() => track('UI', 'Opened', 'BrandBack')}
      />
    </Tooltip>
  );
}
