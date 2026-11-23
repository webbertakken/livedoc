'use client';

// Insert special characters (docs/specs/034-text-documents/objects.md "Special characters"): Unicode's characters,
// browsed by category and block or searched by name words or codepoint; a press hands the character to the caller and
// the dialog stays open for more. The catalogue is fetched the first time a dialog opens, never with the editor.
import { memo, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { debugLog } from '@/lib/debug-log';
import { GRID_KEYS, gridStep, type GridKey } from '@/lib/office/grid-step';
import {
  SPECIAL_CHARACTER_CATEGORIES,
  blocksIn,
  characterName,
  characterText,
  codepointLabel,
  groupOf,
  loadSpecialCharacters,
  searchCharacters,
  type SpecialCharacter,
  type SpecialCharacterCategory,
  type SpecialCharacters,
} from '@/lib/office/special-characters';
import { OfficeDialog } from './OfficeDialog';
import { OfficeDialogMessage, OfficeDialogSearch, OfficeDialogSelect } from './OfficeDialogFields';

type Catalogue =
  { state: 'loading' } | { state: 'ready'; catalogue: SpecialCharacters } | { state: 'failed' };

type Browse = { category: SpecialCharacterCategory; block: string };

/** Where the dialog opens (default): Symbol, Arrows; then where it was last left while the page is open. */
export const SPECIAL_CHARACTERS_START: Browse = { category: 'Symbol', block: 'Arrows' };
let lastBrowse: Browse = SPECIAL_CHARACTERS_START;

// A combining mark is shown on a dotted circle, so it has something to sit on.
const DOTTED_CIRCLE = '\u25CC';

function Glyph({ character }: { character: SpecialCharacter }) {
  const { look } = character;
  if (look.kind === 'abbreviation')
    return (
      <span className="rounded-sm border border-dashed border-(--office-muted) px-0.5 text-[9px] leading-3 font-medium tracking-tight">
        {look.text}
      </span>
    );
  const text = characterText(character.codepoint);
  return <>{look.kind === 'mark' ? `${DOTTED_CIRCLE}${text}` : text}</>;
}

export function OfficeSpecialCharactersDialog({
  onClose,
  onPick,
  catalogue: readCatalogue = loadSpecialCharacters,
}: {
  onClose: () => void;
  // A character pressed, as text.
  onPick: (text: string) => void;
  catalogue?: () => Promise<SpecialCharacters>;
}) {
  const [catalogue, setCatalogue] = useState<Catalogue>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [browse, setBrowse] = useState<Browse>(lastBrowse);
  const [query, setQuery] = useState('');
  // The character the preview shows: the one hovered or focused last.
  const [shown, setShown] = useState<SpecialCharacter | null>(null);
  // The name of the character last put in, announced; cleared by a new search or block.
  const [picked, setPicked] = useState('');

  useEffect(() => {
    let live = true;
    readCatalogue().then(
      (read) => {
        if (live) setCatalogue({ state: 'ready', catalogue: read });
      },
      (error: unknown) => {
        debugLog(`[special-characters] catalogue not loaded ${String(error)}`);
        if (live) setCatalogue({ state: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [readCatalogue, attempt]);

  const ready = catalogue.state === 'ready' ? catalogue.catalogue : null;
  const blocks = useMemo(() => (ready ? blocksIn(ready, browse.category) : []), [ready, browse]);
  const searching = query.trim() !== '';
  const characters = useMemo(() => {
    if (!ready) return [];
    return searching
      ? searchCharacters(ready, query)
      : groupOf(ready, browse.category, browse.block);
  }, [ready, searching, query, browse]);

  const choose = (next: Browse) => {
    lastBrowse = next;
    setBrowse(next);
    setPicked('');
  };
  const search = useCallback((text: string) => {
    setQuery(text);
    setPicked('');
  }, []);
  const chooseCategory = (category: SpecialCharacterCategory) =>
    choose({ category, block: ready ? (blocksIn(ready, category)[0] ?? '') : '' });

  const pick = useCallback(
    (character: SpecialCharacter) => {
      onPick(characterText(character.codepoint));
      setPicked(characterName(character.name));
    },
    [onPick],
  );

  return (
    <OfficeDialog open onClose={onClose} title="Insert special characters" wide>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <OfficeDialogSearch label="Search by name or codepoint" value={query} onChange={search} />
        <OfficeDialogSelect
          label="Category"
          hideLabel
          value={browse.category}
          options={SPECIAL_CHARACTER_CATEGORIES}
          onChange={chooseCategory}
          disabled={searching || !ready}
        />
        <OfficeDialogSelect
          label="Block"
          hideLabel
          value={browse.block}
          options={blocks.length > 0 ? blocks : [browse.block]}
          onChange={(block) => choose({ ...browse, block })}
          width="w-44"
          disabled={searching || !ready}
        />
      </div>
      <div className="mt-3 flex min-h-0 flex-1 gap-4 sm:h-[400px] sm:flex-none max-sm:flex-col">
        {ready ? (
          <>
            <p role="status" aria-live="polite" className="sr-only">
              {picked
                ? `Inserted ${picked}`
                : characters.length === 1
                  ? '1 character'
                  : `${characters.length} characters`}
            </p>
            {characters.length === 0 ? (
              <OfficeDialogMessage>No characters match</OfficeDialogMessage>
            ) : (
              <CharacterGrid
                // A new search or block is a new grid, starting at its top with its first cell the Tab stop.
                key={searching ? `search\n${query}` : `${browse.category}\n${browse.block}`}
                characters={characters}
                onPick={pick}
                onShow={setShown}
              />
            )}
            <Preview character={shown} />
          </>
        ) : catalogue.state === 'loading' ? (
          <OfficeDialogMessage>
            <span role="status">Loading characters…</span>
          </OfficeDialogMessage>
        ) : (
          <OfficeDialogMessage>
            <span role="alert">The characters could not load.</span>
            <button
              type="button"
              onClick={() => {
                setCatalogue({ state: 'loading' });
                setAttempt((n) => n + 1);
              }}
              className="touch-target relative mt-2 rounded-full px-4 py-2 text-sm font-medium text-(--office-primary) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
            >
              Try again
            </button>
          </OfficeDialogMessage>
        )}
      </div>
    </OfficeDialog>
  );
}

// The grid of characters, drawn again only when its characters change, not as the preview follows the pointer.
const CharacterGrid = memo(function CharacterGrid({
  characters,
  onPick,
  onShow,
}: {
  characters: readonly SpecialCharacter[];
  onPick: (character: SpecialCharacter) => void;
  onShow: (character: SpecialCharacter) => void;
}) {
  // The cell that is the grid's one Tab stop.
  const [active, setActive] = useState(0);
  // The arrows move by a cell and a row, Home and End to the first and last.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = [...GRID_KEYS, 'Home', 'End'];
    if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const cells = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const at = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    // The cells of the first row, as the grid lays them out at its width now.
    const top = cells[0]?.offsetTop;
    const wrapped = cells.findIndex((cell) => cell.offsetTop !== top);
    const columns = wrapped > 0 ? wrapped : cells.length;
    const to =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? cells.length - 1
          : gridStep(at, cells.length, columns, e.key as GridKey);
    setActive(to);
    cells[to]?.focus();
  };
  return (
    <div
      role="group"
      aria-label="Characters"
      onKeyDown={onKeyDown}
      className="grid min-h-0 min-w-0 flex-1 auto-rows-[2.5rem] grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] content-start overflow-y-auto rounded border border-(--office-line) p-1"
    >
      {characters.map((character, index) => (
        <button
          key={character.codepoint}
          type="button"
          tabIndex={index === active ? 0 : -1}
          aria-label={characterName(character.name)}
          data-codepoint={codepointLabel(character.codepoint)}
          onClick={() => {
            setActive(index);
            onPick(character);
          }}
          onMouseEnter={() => onShow(character)}
          onFocus={() => onShow(character)}
          className="flex items-center justify-center rounded text-xl text-(--office-ink) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-inset"
        >
          <Glyph character={character} />
        </button>
      ))}
    </div>
  );
});

// The character hovered or focused, large, with its name and codepoint; read through the cell's own name instead.
function Preview({ character }: { character: SpecialCharacter | null }) {
  return (
    <div
      aria-hidden="true"
      data-special-character-preview
      className="flex shrink-0 items-center gap-3 sm:w-44 sm:flex-col sm:justify-center sm:gap-2 sm:text-center max-sm:min-h-12"
    >
      {character ? (
        <>
          <span className="flex size-12 shrink-0 items-center justify-center text-3xl sm:size-24 sm:text-6xl">
            <Glyph character={character} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm text-(--office-ink) [overflow-wrap:anywhere]">
              {characterName(character.name)}
            </span>
            <span className="font-mono text-xs text-(--office-muted)">
              {codepointLabel(character.codepoint)}
            </span>
          </span>
        </>
      ) : null}
    </div>
  );
}
