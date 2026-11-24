'use client';

// Insert special characters (docs/specs/034-text-documents/objects.md "Special characters"): Unicode's characters,
// browsed by category and block or searched by name words or codepoint; a press hands the character to the caller and
// the dialog stays open for more. The catalogue is fetched the first time a dialog opens, never with the editor.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { debugLog } from '@/lib/debug-log';
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
import { OfficeGlyphGrid } from './OfficeGlyphGrid';
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
      <span className="rounded-control border border-dashed border-(--office-muted) px-0.5 text-[9px] leading-3 font-medium">
        {look.text}
      </span>
    );
  const text = characterText(character.codepoint);
  return <>{look.kind === 'mark' ? `${DOTTED_CIRCLE}${text}` : text}</>;
}

const codepointOf = (character: SpecialCharacter) => character.codepoint;
const nameOf = (character: SpecialCharacter) => characterName(character.name);
const draw = (character: SpecialCharacter) => <Glyph character={character} />;

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
              <OfficeGlyphGrid
                // A new search or block is a new grid, starting at its top with its first cell the Tab stop.
                key={searching ? `search\n${query}` : `${browse.category}\n${browse.block}`}
                label="Characters"
                items={characters}
                keyOf={codepointOf}
                nameOf={nameOf}
                draw={draw}
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
            <span className="text-body text-(--office-ink) [overflow-wrap:anywhere]">
              {characterName(character.name)}
            </span>
            <span className="font-mono text-supporting text-(--office-muted)">
              {codepointLabel(character.codepoint)}
            </span>
          </span>
        </>
      ) : null}
    </div>
  );
}
