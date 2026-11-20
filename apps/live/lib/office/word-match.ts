// How the office shell's searches match what was typed (docs/specs/004-interface-design/office-shell.md "Tool finder",
// "Keyboard shortcuts dialog"): every word typed must start a word of the text searched, in any case.

export const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

// True when every word of `query` starts a word of `text`; a query of no words matches everything.
export function everyWordStarts(query: string, text: string): boolean {
  const words = wordsOf(text);
  return wordsOf(query).every((typed) => words.some((word) => word.startsWith(typed)));
}
