'use client';

// Insert emoji (docs/specs/034-text-documents/objects.md "Emoji"): Unicode's emoji by group, Recently used first, or
// searched by name, tags and shortcodes; shown and inserted in the skin tone chosen. A press hands the emoji to the
// caller and the dialog stays open for more. The catalogue is fetched the first time a dialog opens.
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { debugLog } from '@/lib/debug-log';
import {
  EMOJI_GROUPS,
  SKIN_TONES,
  emojiName,
  emojiOf,
  inGroup,
  inTone,
  loadEmoji,
  searchEmoji,
  type Emoji,
  type EmojiGroup,
  type Emojis,
  type SkinTone,
} from '@/lib/office/emoji';
import {
  noteRecentEmoji,
  readEmojiTone,
  readRecentEmoji,
  saveEmojiTone,
} from '@/lib/office/emoji-preferences';
import { OfficeDialog } from './OfficeDialog';
import { OfficeDialogMessage, OfficeDialogSearch, OfficeDialogSelect } from './OfficeDialogFields';
import { OfficeDialogTabs, officeTabPanel } from './OfficeDialogTabs';
import { OfficeGlyphGrid } from './OfficeGlyphGrid';

type Catalogue = { state: 'loading' } | { state: 'ready'; catalogue: Emojis } | { state: 'failed' };

const RECENT = 'Recently used' as const;
type Tab = typeof RECENT | EmojiGroup;

// Each tab's icon, an emoji of its own group (a clock for Recently used).
const TAB_ICONS: Record<Tab, string> = {
  [RECENT]: '🕘',
  'Smileys & emotion': '😀',
  'People & body': '👋',
  'Animals & nature': '🐻',
  'Food & drink': '🍔',
  'Travel & places': '✈️',
  Activities: '⚽',
  Objects: '💡',
  Symbols: '🔣',
  Flags: '🏁',
};
const TABS = ([RECENT, ...EMOJI_GROUPS] as const).map(
  (tab: Tab) => [tab, tab, TAB_ICONS[tab]] as const,
);

// The skin tone menu: the default yellow, then the five tones.
const DEFAULT_TONE = 'Default';
const TONE_NAMES: Record<SkinTone, string> = {
  light: 'Light',
  'medium-light': 'Medium light',
  medium: 'Medium',
  'medium-dark': 'Medium dark',
  dark: 'Dark',
};
const TONE_OPTIONS = [DEFAULT_TONE, ...SKIN_TONES.map((t) => TONE_NAMES[t])];
const toneOf = (name: string): SkinTone | null =>
  SKIN_TONES.find((t) => TONE_NAMES[t] === name) ?? null;

// A cell: the emoji as it is shown and inserted, in its tone.
type Cell = { readonly emoji: Emoji; readonly text: string };

const keyOf = (cell: Cell) => cell.text;
const nameOf = (cell: Cell) => emojiName(cell.emoji.name);
const draw = (cell: Cell) => cell.text;

export function OfficeEmojiDialog({
  onClose,
  onPick,
  catalogue: readCatalogue = loadEmoji,
}: {
  onClose: () => void;
  // An emoji pressed, as text.
  onPick: (text: string) => void;
  catalogue?: () => Promise<Emojis>;
}) {
  const id = useId();
  const [catalogue, setCatalogue] = useState<Catalogue>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [recent, setRecent] = useState(readRecentEmoji);
  const [tab, setTab] = useState<Tab>(() =>
    readRecentEmoji().length > 0 ? RECENT : EMOJI_GROUPS[0],
  );
  const [tone, setTone] = useState(readEmojiTone);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<Cell | null>(null);
  // The name of the emoji last put in, announced; cleared by a new search or tab.
  const [picked, setPicked] = useState('');

  useEffect(() => {
    let live = true;
    readCatalogue().then(
      (read) => {
        if (live) setCatalogue({ state: 'ready', catalogue: read });
      },
      (error: unknown) => {
        debugLog(`[emoji] catalogue not loaded ${String(error)}`);
        if (live) setCatalogue({ state: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [readCatalogue, attempt]);

  const ready = catalogue.state === 'ready' ? catalogue.catalogue : null;
  const searching = query.trim() !== '';
  const cells = useMemo((): Cell[] => {
    if (!ready) return [];
    if (!searching && tab === RECENT)
      return recent.flatMap((text) => {
        const emoji = emojiOf(ready, text);
        return emoji ? [{ emoji, text }] : [];
      });
    const emoji = searching ? searchEmoji(ready, query) : inGroup(ready, tab as EmojiGroup);
    return emoji.map((e) => ({ emoji: e, text: inTone(e, tone) }));
  }, [ready, searching, query, tab, tone, recent]);

  const search = useCallback((text: string) => {
    setQuery(text);
    setPicked('');
  }, []);
  const pick = useCallback(
    (cell: Cell) => {
      onPick(cell.text);
      noteRecentEmoji(cell.text);
      setPicked(emojiName(cell.emoji.name));
    },
    [onPick],
  );
  // Recently used is read again as its tab is opened, so it starts with what was just put in.
  const chooseTab = (next: Tab) => {
    setTab(next);
    setPicked('');
    if (next === RECENT) setRecent(readRecentEmoji());
  };
  const chooseTone = (name: string) => {
    const next = toneOf(name);
    setTone(next);
    saveEmojiTone(next);
  };

  return (
    <OfficeDialog open onClose={onClose} title="Insert emoji" wide>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <OfficeDialogSearch label="Search emoji" value={query} onChange={search} />
        <OfficeDialogSelect
          label="Skin tone"
          value={tone ? TONE_NAMES[tone] : DEFAULT_TONE}
          options={TONE_OPTIONS}
          onChange={chooseTone}
        />
      </div>
      <div className="mt-3">
        <OfficeDialogTabs
          id={id}
          label="Emoji groups"
          tabs={TABS}
          value={tab}
          onChange={chooseTab}
          disabled={searching ? TABS.map(([t]) => t) : []}
        />
      </div>
      <div
        {...officeTabPanel(id, tab)}
        className="flex min-h-0 flex-1 gap-4 sm:h-[340px] sm:flex-none max-sm:flex-col"
      >
        {ready ? (
          <>
            <p role="status" aria-live="polite" className="sr-only">
              {picked
                ? `Inserted ${picked}`
                : cells.length === 1
                  ? '1 emoji'
                  : `${cells.length} emoji`}
            </p>
            {cells.length === 0 ? (
              <OfficeDialogMessage>
                {searching ? 'No emoji match' : 'Emoji you insert show here'}
              </OfficeDialogMessage>
            ) : (
              <OfficeGlyphGrid
                // A new search or tab is a new grid, starting at its top with its first cell the Tab stop.
                key={searching ? `search\n${query}` : tab}
                label="Emoji"
                items={cells}
                keyOf={keyOf}
                nameOf={nameOf}
                draw={draw}
                onPick={pick}
                onShow={setShown}
                size="text-2xl"
              />
            )}
            <Preview cell={shown} />
          </>
        ) : catalogue.state === 'loading' ? (
          <OfficeDialogMessage>
            <span role="status">Loading emoji…</span>
          </OfficeDialogMessage>
        ) : (
          <OfficeDialogMessage>
            <span role="alert">The emoji could not load.</span>
            <button
              type="button"
              onClick={() => {
                setCatalogue({ state: 'loading' });
                setAttempt((n) => n + 1);
              }}
              className="touch-target relative mt-2 rounded-full px-4 py-2 text-body font-medium text-(--office-primary) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
            >
              Try again
            </button>
          </OfficeDialogMessage>
        )}
      </div>
    </OfficeDialog>
  );
}

// The emoji hovered or focused, large, with its name and first shortcode; read through the cell's own name instead.
function Preview({ cell }: { cell: Cell | null }) {
  const shortcode = cell?.emoji.shortcodes[0];
  return (
    <div
      aria-hidden="true"
      data-emoji-preview
      className="flex shrink-0 items-center gap-3 sm:w-44 sm:flex-col sm:justify-center sm:gap-2 sm:text-center max-sm:min-h-12"
    >
      {cell ? (
        <>
          <span className="flex size-12 shrink-0 items-center justify-center text-3xl sm:size-24 sm:text-6xl">
            {cell.text}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body text-(--office-ink) [overflow-wrap:anywhere]">
              {emojiName(cell.emoji.name)}
            </span>
            {shortcode ? (
              <span className="font-mono text-supporting text-(--office-muted)">:{shortcode}:</span>
            ) : null}
          </span>
        </>
      ) : null}
    </div>
  );
}
