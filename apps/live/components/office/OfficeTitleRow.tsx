'use client';

// The office shell's title row (docs/specs/004-interface-design/office-shell.md "Parts", "Title row"): the mark, the
// name with the format it keeps, star and move, the menu bar from the kind's catalogue under them, the tool finder over
// that, and on the right Settings, Share, the people here and the account; the shortcut layer listens over the kind's
// surface. Every kind outside the canvas draws this one; its look is the shell's tokens (`office-shell.css`).
import { useCallback, useMemo, useState, type RefObject } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import { Brand, Tooltip, useMediaQuery } from '@livedoc/ui';
import { PHONE_MEDIA_QUERY } from '@/lib/responsive';
import { OfficePhoneMore } from './OfficePhoneMore';
import { EXPLORER_LANDING_PATH } from '@/lib/explorer-landing';
import {
  catalogueItems,
  visibleMenus,
  type OfficeActions,
  type OfficeCatalogue,
} from '@/lib/office/office-catalogue';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import type { ShortcutRow } from '@/lib/office/shortcut-registry';
import { shortcutTextOf } from '@/lib/office/shortcut-notation';
import { track } from '@/lib/telemetry';
import type { OfficeChrome, OfficePerson } from './office-chrome';
import { OfficeMoveIcon, OfficeStarIcon } from './office-icons';
import { OfficeMenuBar, type OpenMenu } from './OfficeMenuBar';
import { OfficeModeSwitch, type OfficeModeChoice } from './OfficeModeSwitch';
import { OfficeNameField } from './OfficeNameField';
import { OfficeToolbar } from './OfficeToolbar';
import type { OfficeZoom } from './OfficeZoomField';
import type { OfficeFontSize } from './OfficeFontSizeField';
import type { OfficeFontFamily } from './OfficeFontMenu';
import type { OfficeColours } from './OfficeColourControl';
import type { OfficeChoices } from './OfficeChoiceMenu';
import {
  visibleToolbar,
  type OfficeToolbar as OfficeToolbarData,
} from '@/lib/office/office-toolbar';
import type { OfficeSaveStatusSource } from './office-save-status';
import { OfficeSaveStatusShown } from './OfficeSaveStatus';
import { OfficeIconButton, OfficeTitleActions } from './OfficeTitleActions';
import { OfficeContextMenu, type OfficeContextMenuSource } from './OfficeContextMenu';
import { OfficeShortcutsDialog } from './OfficeShortcutsDialog';
import { useOfficeContextMenu, type OfficeTelemetryKind } from './useOfficeContextMenu';
import { OfficeToolFinder } from './OfficeToolFinder';
import { useOfficeShortcuts, type ShortcutRun } from './useOfficeShortcuts';

// The registry rows the shell itself runs: `<menu>-menu` opens that menu (its access key), and the tool finder.
const TOOL_FINDER = 'tool-finder';
const CONTEXT_MENU = 'context-right-click-menu';
const accessKeyOf = (menuId: string) => `${menuId}-menu`;
const NO_TOOLBAR: OfficeToolbarData = [];

export type OfficeFileOpening = {
  // The file picker's types, and what opening a picked file does.
  accept: string;
  onFile: (file: File) => void;
};

/** A bare title row's one button: its words ("Leave read mode") and what it does. */
export type OfficeBareTitleRow = { leave: string; onLeave: () => void };

export function OfficeTitleRow({
  name,
  format,
  formatTitle,
  problem,
  notice = null,
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
  saveStatus = null,
  toolbar = NO_TOOLBAR,
  zoom = null,
  fontSize = null,
  fontFamily = null,
  colours = null,
  choices = null,
  refresh,
  mode = null,
  contextMenu = null,
  bare = null,
}: {
  name: string;
  // The format's pill (".ODT") and what it is called ("OpenDocument format").
  format: string;
  formatTitle: string;
  problem: string | null;
  // What is under way (a file being opened), said politely beside the name.
  notice?: string | null;
  catalogue: OfficeCatalogue;
  level: AccessLevel;
  actions: OfficeActions;
  // The kind's shortcut registry: what the layer matches and the Keyboard shortcuts dialog lists.
  shortcuts: readonly ShortcutRow[];
  // The surface whose keys the shortcut layer hears.
  keyScope: RefObject<HTMLElement | null>;
  // File > Open's picker: binds the item `open`.
  opening?: OfficeFileOpening;
  // `TextDocument` sends `UI · Opened · TextDocumentMenu<Name>`, `UI · Used · TextDocumentToolFinder`, ...
  telemetryKind?: OfficeTelemetryKind;
  // The document's own parts, from the editor page; null outside it (a test), where the name is text alone.
  chrome?: OfficeChrome | null;
  // The tab this surface shows, and how it brings a person's selection here into view (false: not found).
  tabId?: string;
  onFollow?: (personId: string) => boolean;
  // The kind's save status; none for a session that saves nothing.
  saveStatus?: OfficeSaveStatusSource | null;
  // The kind's toolbar, and the zoom its zoom field works (null: no zoom field).
  toolbar?: OfficeToolbarData;
  zoom?: OfficeZoom | null;
  // The toolbar's font size field, and when what the toolbar shows may have changed.
  fontSize?: OfficeFontSize | null;
  fontFamily?: OfficeFontFamily | null;
  // The toolbar's colour controls, by id.
  colours?: OfficeColours | null;
  // The toolbar's choice controls (the Styles control), by id.
  choices?: OfficeChoices | null;
  refresh?: (listener: () => void) => () => void;
  // The person's editing mode and the modes their level allows (review.md "Editing modes").
  mode?: OfficeModeChoice | null;
  // The document's context menu (office-shell.md "Context menus"); none: the browser's own.
  contextMenu?: OfficeContextMenuSource | null;
  // The title row drawn bare (office-shell.md "Title row"): the name line and one button to leave; keys still heard.
  bare?: OfficeBareTitleRow | null;
}) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  // A phone (office-shell.md "Phone and tablet"): the toolbar is one scrolling row, the menus live in More.
  const phone = useMediaQuery(PHONE_MEDIA_QUERY);
  const [finding, setFinding] = useState(false);
  const [showingShortcuts, setShowingShortcuts] = useState(false);
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
      'keyboard-shortcuts': {
        run: () => {
          if (telemetryKind) track('UI', 'Opened', `${telemetryKind}Shortcuts`);
          setOpenMenu(null);
          setShowingShortcuts(true);
        },
      },
    }),
    [actions, opening, picker, rename, share, openMove, telemetryKind],
  );

  const menus = useMemo(
    () => visibleMenus(catalogue, level, allActions),
    [catalogue, level, allActions],
  );
  const items = useMemo(() => catalogueItems(menus), [menus]);
  const closeMenus = useCallback(() => setOpenMenu(null), []);
  const context = useOfficeContextMenu({
    scope: keyScope,
    source: contextMenu,
    level,
    actions: allActions,
    telemetryKind,
    onOpen: closeMenus,
  });
  const { openAtCaret } = context;
  const bar = useMemo(
    () =>
      visibleToolbar(
        toolbar,
        level,
        allActions,
        {
          zoom: zoom !== null && !phone,
          fontSize: fontSize !== null,
          font: fontFamily !== null,
          colour: colours !== null,
          choice: choices !== null,
        },
        Object.keys(choices ?? {}),
      ),
    [toolbar, level, allActions, zoom, fontSize, fontFamily, colours, choices, phone],
  );
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
    if (openAtCaret) out[CONTEXT_MENU] = openAtCaret;
    // A bare row has no menu bar to open a menu in.
    if (!bare)
      for (const menu of menus)
        out[accessKeyOf(menu.id)] = () => onOpenMenu({ id: menu.id, focus: 'first' });
    // A row of several items (`[1-6]`) runs the one its keys' argument names.
    const byArg: Record<string, Record<string, () => void>> = {};
    // Keys left to the browser (Copy, Paste) are never bound: its own clipboard events reach the kind. Nor are keys the
    // surface hears itself (the grid's), which knows when a field has them.
    const passedOn = new Set(
      shortcuts
        .filter((row) => row.status === 'browser' || row.status === 'surface')
        .map((row) => row.id),
    );
    for (const { item } of items) {
      const action = allActions[item.id];
      if (!item.shortcut || passedOn.has(item.shortcut)) continue;
      if (item.status !== 'built' || !action || action.disabled) continue;
      if (item.shortcutArg === undefined) out[item.shortcut] ??= () => action.run();
      else (byArg[item.shortcut] ??= {})[item.shortcutArg] = () => action.run();
    }
    for (const [shortcut, runsByArg] of Object.entries(byArg))
      out[shortcut] ??= (arg) => runsByArg[arg ?? '']?.();
    // A shortcut no item or control names runs what the kind binds under its own id (office-shell.md "Shortcut layer").
    const named = new Set([
      ...catalogueItems(catalogue).map(({ item }) => item.shortcut),
      ...toolbar.flatMap((group) => group.controls.map((control) => control.shortcut)),
    ]);
    for (const { id } of shortcuts) {
      const action = allActions[id];
      if (named.has(id) || passedOn.has(id)) continue;
      if (action && !action.disabled) out[id] ??= () => action.run();
    }
    return out;
  }, [menus, items, allActions, onOpenMenu, openAtCaret, catalogue, toolbar, shortcuts, bare]);
  useOfficeShortcuts({ scope: keyScope, rows: shortcuts, runs });

  return (
    <header data-region="header" className="office-shell bg-(--office-chrome) text-(--office-ink)">
      <div className="flex items-start gap-1 pt-2 pr-4 pl-2 phone:items-center phone:py-1 phone:pr-1">
        {chrome ? <OfficeMark back={chrome.back} /> : null}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-(--text-name--line-height) min-w-0 items-center gap-1">
            <OfficeNameField
              name={name}
              onRename={chrome?.rename ?? null}
              focusNonce={renameNonce + (chrome?.renameNonce ?? 0)}
            />
            <Tooltip label={formatTitle}>
              <span
                role="img"
                aria-label={formatTitle}
                className="shrink-0 rounded-control border border-(--office-line) px-2 text-supporting text-(--office-muted) phone:hidden"
              >
                {format}
              </span>
            </Tooltip>
            {chrome?.star ? (
              <OfficeIconButton
                className="phone:hidden"
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
              <OfficeIconButton className="phone:hidden" label="Move" onClick={openMove}>
                <OfficeMoveIcon />
              </OfficeIconButton>
            ) : null}
            {saveStatus ? <OfficeSaveStatusShown source={saveStatus} /> : null}
            {notice ? (
              <p role="status" className="truncate text-body text-slate-600 dark:text-slate-300">
                {notice}
              </p>
            ) : null}
            {problem ? (
              <p role="alert" className="truncate text-body text-red-700 dark:text-red-300">
                {problem}
              </p>
            ) : null}
          </div>
          {bare ? (
            <div className="py-0.5">
              <button
                type="button"
                onClick={bare.onLeave}
                className="relative rounded-control px-2 py-1 text-body touch-target-y text-(--office-primary) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
              >
                {bare.leave}
              </button>
            </div>
          ) : null}
          <div className="-ml-0.5 phone:hidden" hidden={bare !== null}>
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
            <OfficeTitleActions chrome={chrome} onFollow={follow} mode={mode} />
          </div>
        ) : mode ? (
          <div className="self-center">
            <OfficeModeSwitch {...mode} />
          </div>
        ) : null}
        <div className="self-center" hidden={bare !== null}>
          <OfficePhoneMore
            menus={menus}
            chrome={chrome}
            actions={allActions}
            shortcutOf={shortcutOf}
          />
        </div>
      </div>
      {bar.length > 0 && !bare ? (
        <OfficeToolbar
          groups={bar}
          actions={allActions}
          shortcutOf={shortcutOf}
          zoom={phone ? null : zoom}
          fontSize={fontSize}
          fontFamily={fontFamily}
          colours={colours}
          choices={choices}
          refresh={refresh}
          phone={phone}
        />
      ) : null}
      {context.at ? (
        <OfficeContextMenu
          entries={context.entries}
          at={context.at}
          actions={allActions}
          shortcutOf={shortcutOf}
          onClose={context.close}
        />
      ) : null}
      {showingShortcuts ? (
        <OfficeShortcutsDialog rows={shortcuts} onClose={() => setShowingShortcuts(false)} />
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
    markClassName: 'size-field',
    className:
      'relative flex size-10 shrink-0 items-center justify-center rounded-full outline-none touch-target hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)',
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
