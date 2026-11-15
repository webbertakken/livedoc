// Ctrl F, or Cmd F on a Mac: the Explorer's own find (docs/specs/013-workspace/explorer-structure.md "Find"), since
// in-page find cannot see a long list's rows that are not drawn. Shift or Alt with it is something else.
export function isFindShortcut(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f';
}
