// Rich Text's groups as a tree (docs/specs/034-text-documents/files-and-print.md "Opening"): each `{...}` a group of
// tokens and groups, so a destination is known by its first control word. Built without recursion; a file nested
// past the limit is refused as damaged.
import { rtfTokens, type RtfToken } from './rtf-tokens';

export type RtfGroup = { readonly items: (RtfToken | RtfGroup)[] };

/** How deep groups may nest (default: far past any writer's, short of the reader's stack). */
export const RTF_DEPTH_MAX = 200;

export const isGroup = (item: RtfToken | RtfGroup): item is RtfGroup => 'items' in item;

/** The file's outermost group, or none when it nests too deep. Unclosed groups are closed at the end. */
export function rtfTree(source: string): RtfGroup | null {
  const root: RtfGroup = { items: [] };
  const stack: RtfGroup[] = [root];
  for (const token of rtfTokens(source)) {
    if (token.kind === 'open') {
      if (stack.length > RTF_DEPTH_MAX) return null;
      const group: RtfGroup = { items: [] };
      stack.at(-1)!.items.push(group);
      stack.push(group);
    } else if (token.kind === 'close') {
      if (stack.length > 1) stack.pop();
    } else stack.at(-1)!.items.push(token);
  }
  const first = root.items.find(isGroup);
  return first ?? root;
}

/** A group's destination: its first control word, past an ignorable `\*`. */
export function destinationOf(group: RtfGroup): { name: string; ignorable: boolean } | null {
  let ignorable = false;
  for (const item of group.items) {
    if (isGroup(item)) return null;
    if (item.kind === 'symbol' && item.char === '*') {
      ignorable = true;
      continue;
    }
    if (item.kind === 'word') return { name: item.name, ignorable };
    if (item.kind === 'text' && item.text.trim() === '') continue;
    return null;
  }
  return null;
}

/** All the text of a group and the groups in it, as written (hex bytes as Latin-1 characters). */
export function plainTextOf(group: RtfGroup): string {
  return group.items
    .map((item) =>
      isGroup(item)
        ? plainTextOf(item)
        : item.kind === 'text'
          ? item.text
          : item.kind === 'hex'
            ? String.fromCharCode(item.byte)
            : item.kind === 'symbol' && item.char !== '*'
              ? item.char
              : '',
    )
    .join('');
}
