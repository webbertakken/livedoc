'use client';

// Insert emoji using the colon character (docs/specs/034-text-documents/objects.md "Emoji"): the list under the caret
// of the emoji whose shortcodes or name words begin with what was typed after `:`, each in the skin tone chosen. Up and
// Down move through it, Enter, Tab or a press put the one chosen in place of what was typed, Escape sends it away; the
// writing keeps the focus, the option chosen its active descendant.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { OfficePopup } from '@/components/office/OfficePopup';
import { debugLog } from '@/lib/debug-log';
import {
  colonMatches,
  emojiName,
  inTone,
  loadEmoji,
  type Emoji,
  type Emojis,
} from '@/lib/office/emoji';
import { noteRecentEmoji, readEmojiTone } from '@/lib/office/emoji-preferences';
import { track } from '@/lib/telemetry';
import {
  emojiColon,
  replaceColonQuery,
  type ColonQuery,
} from '@/lib/text-document/text-document-emoji-colon';
import { startUndoStep } from '@/lib/text-document/text-document-undo';

export function useTextDocumentEmojiColon(enabled: () => boolean) {
  const [query, setQuery] = useState<ColonQuery | null>(null);
  // The plugin, made once, before the editor that takes it.
  const [colon] = useState(() => emojiColon({ enabled, onQuery: setQuery }));
  const [catalogue, setCatalogue] = useState<Emojis | null>(null);
  // The option chosen, for the word it was chosen in.
  const [chosen, setChosen] = useState({ typed: '', index: 0 });

  // The catalogue is fetched the first time the list is asked for.
  const asked = query !== null;
  useEffect(() => {
    if (!asked || catalogue) return;
    let live = true;
    loadEmoji().then(
      (read) => {
        if (live) setCatalogue(read);
      },
      (error: unknown) => debugLog(`[emoji] colon list not loaded ${String(error)}`),
    );
    return () => {
      live = false;
    };
  }, [asked, catalogue]);

  const matches = useMemo(
    () => (catalogue && query ? colonMatches(catalogue, query.typed) : []),
    [catalogue, query],
  );
  const tone = useMemo(() => (query ? readEmojiTone() : null), [query]);
  const index = query && chosen.typed === query.typed ? chosen.index : 0;

  const choose = useCallback(
    (view: EditorView, emoji: Emoji) => {
      if (!query || view.isDestroyed) return;
      const text = inTone(emoji, tone);
      startUndoStep(view);
      view.dispatch(replaceColonQuery(view.state, query, text));
      startUndoStep(view);
      noteRecentEmoji(text);
      track('Element', 'Added', 'TextDocumentEmoji');
      debugLog('[text-document] character inserted', { from: 'emoji-colon' });
      view.focus();
    },
    [query, tone],
  );

  return { plugin: colon.plugin, colon, query, matches, index, tone, choose, setChosen };
}

export function TextDocumentEmojiColonList({
  view,
  list,
}: {
  view: EditorView | null;
  list: ReturnType<typeof useTextDocumentEmojiColon>;
}) {
  const id = useId();
  const { colon, query, matches, index, tone, choose, setChosen } = list;
  const open = view !== null && query !== null && matches.length > 0;

  // The keys, handed to the plugin while the list is shown; Enter on no list stays the writing's.
  const latest = useRef({ index, matches, choose, view, query });
  useEffect(() => {
    latest.current = { index, matches, choose, view, query };
  });
  useEffect(() => {
    if (!open) {
      colon.setKeys(null);
      return;
    }
    colon.setKeys((event) => {
      const now = latest.current;
      if (!now.view || !now.query || now.matches.length === 0) return false;
      const step = (by: number) =>
        setChosen({
          typed: now.query!.typed,
          index: (now.index + by + now.matches.length) % now.matches.length,
        });
      if (event.key === 'ArrowDown') step(1);
      else if (event.key === 'ArrowUp') step(-1);
      else if (event.key === 'Enter' || event.key === 'Tab')
        now.choose(now.view, now.matches[now.index]!);
      else if (event.key === 'Escape') colon.dismiss();
      else return false;
      event.preventDefault();
      return true;
    });
    return () => colon.setKeys(null);
  }, [open, colon, setChosen]);

  // The writing keeps the focus; the option chosen is its active descendant.
  const active = open ? `${id}-${index}` : null;
  useEffect(() => {
    const dom = view?.dom;
    if (!dom || !active) return;
    dom.setAttribute('aria-activedescendant', active);
    dom.setAttribute('aria-controls', `${id}-list`);
    dom.setAttribute('aria-expanded', 'true');
    return () => {
      dom.removeAttribute('aria-activedescendant');
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-expanded');
    };
  }, [view, active, id]);

  const anchor = useMemo(() => {
    if (!open || !query || view.isDestroyed) return null;
    const at = view.coordsAtPos(query.from);
    return { left: at.left, top: at.top, bottom: at.bottom };
  }, [open, query, view]);
  if (!open || !anchor) return null;
  return (
    <OfficePopup anchor={anchor}>
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label="Emoji"
        data-emoji-colon-list
        className="w-64 rounded-control border border-(--office-line) bg-(--office-menu) py-1 text-body text-(--office-ink) shadow-lg"
      >
        {matches.map((emoji, at) => (
          <li
            key={emoji.emoji}
            id={`${id}-${at}`}
            role="option"
            aria-selected={at === index}
            aria-label={emojiName(emoji.name)}
            // A press chooses without taking the focus from the writing.
            onMouseDown={(e) => {
              e.preventDefault();
              choose(view, emoji);
            }}
            onMouseEnter={() => setChosen({ typed: query.typed, index: at })}
            className="flex h-field cursor-default items-center gap-3 px-3 aria-selected:bg-(--office-menu-hover)"
          >
            <span aria-hidden="true" className="text-name leading-none">
              {inTone(emoji, tone)}
            </span>
            <span aria-hidden="true" className="min-w-0 truncate">
              :{emoji.shortcodes[0] ?? emoji.name}:
            </span>
          </li>
        ))}
      </ul>
    </OfficePopup>
  );
}
