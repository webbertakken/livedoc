// A one-line name made from a text: its first line, trimmed, cut at a word with an ellipsis when it is longer than
// `max`. An assigned comment's action name (docs/specs/034-text-documents/review.md "Assigning") and a text
// document thread's label in the Inbox (docs/specs/013-workspace/inbox.md §2.7) are made this way.
export function cutAtWord(text: string, max: number): string {
  const line = text.split(/\r?\n/)[0]!.trim();
  if (line.length <= max) return line;
  const room = line.slice(0, max - 1);
  const space = room.lastIndexOf(' ');
  return `${(space > 0 ? room.slice(0, space) : room).trimEnd()}…`;
}
