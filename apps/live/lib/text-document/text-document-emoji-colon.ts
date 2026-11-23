// Insert emoji using the colon character (docs/specs/034-text-documents/objects.md "Emoji"): `:` typed at a word's
// start and then two or more letters, digits, `_`, `+` or `-` asks for the emoji list; Escape keeps the list away
// until the word is left; a choice replaces what was typed. The list itself is drawn by the surface, which this
// plugin tells what is typed and hands the keys to while it is asked for.
import { Plugin, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/** What was typed after `:`, and the stretch from the `:` to the caret that a choice replaces. */
export type ColonQuery = { readonly from: number; readonly to: number; readonly typed: string };

// The word before the caret: `:` at the paragraph's start or after a space, then two or more name characters.
const QUERY = /(?:^|\s):([\w+-]{2,})$/;

/** The query at the caret; null for a selection, or no such word right before the caret. */
export function colonQueryAt(state: EditorState): ColonQuery | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $caret = selection.$from;
  if (!$caret.parent.isTextblock) return null;
  // Anything not text (a picture, a break) stands in as a character that ends a word.
  const before = $caret.parent.textBetween(0, $caret.parentOffset, undefined, '\uFFFC');
  const match = QUERY.exec(before);
  if (!match) return null;
  const typed = match[1]!;
  return { from: $caret.pos - typed.length - 1, to: $caret.pos, typed };
}

/** The emoji in place of what was typed, the caret after it, in the caret's formatting. */
export function replaceColonQuery(
  state: EditorState,
  query: ColonQuery,
  emoji: string,
): Transaction {
  return state.tr.insertText(emoji, query.from, query.to).scrollIntoView();
}

const same = (a: ColonQuery | null, b: ColonQuery | null) =>
  a === b || (!!a && !!b && a.from === b.from && a.to === b.to && a.typed === b.typed);

/**
 * The plugin and its handles: `dismiss` keeps the list away until the word is left; `setKeys` gives the list the
 * keys pressed while it is asked for (true when it took one).
 */
export function emojiColon({
  enabled,
  onQuery,
}: {
  // The preference, read as each change lands.
  enabled: () => boolean;
  onQuery: (query: ColonQuery | null) => void;
}) {
  let current: ColonQuery | null = null;
  // The `:` position of a word the list was sent away from.
  let dismissed: number | null = null;
  let keys: ((event: KeyboardEvent) => boolean) | null = null;

  const report = (view: EditorView) => {
    const found = view.editable && enabled() ? colonQueryAt(view.state) : null;
    if (found?.from !== dismissed) dismissed = null;
    const next = found && found.from !== dismissed ? found : null;
    if (same(next, current)) return;
    current = next;
    onQuery(next);
  };

  const plugin = new Plugin({
    view: (view) => {
      report(view);
      return { update: report };
    },
    props: {
      handleKeyDown: (_view, event) => (current && keys ? keys(event) : false),
    },
  });

  return {
    plugin,
    dismiss: () => {
      if (!current) return;
      dismissed = current.from;
      current = null;
      onQuery(null);
    },
    setKeys: (next: ((event: KeyboardEvent) => boolean) | null) => {
      keys = next;
    },
  };
}
