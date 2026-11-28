// What a Rich Text file names by number (docs/specs/034-text-documents/files-and-print.md "Downloading"): its fonts and
// its colours, each given an index the first time the writing uses it, written as the tables that open the file.

/** A character as RTF writes it: a backslash and braces escaped, a code unit past ASCII as a Unicode escape. */
export function rtfText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const char = text[i]!;
    if (char === '\\' || char === '{' || char === '}') out += `\\${char}`;
    else if (char === '\t') out += '\\tab ';
    else if (char === '\n') out += '\\line ';
    else if (code < 0x20) continue;
    else if (code < 0x80) out += char;
    // Signed 16 bits, as RTF reads the escape; `?` stands in for a reader without Unicode.
    else out += `\\u${code > 0x7fff ? code - 0x10000 : code}?`;
  }
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;

export type RtfTables = {
  /** The font's index, given it on first use. */
  readonly font: (name: string) => number;
  /** The colour's index (`#rrggbb`), given it on first use; none for anything not a colour. */
  readonly colour: (hex: string | undefined) => number | undefined;
  /** `\fonttbl` and `\colortbl`, as the fonts and colours were used. */
  readonly header: () => string;
};

export function rtfTables(defaultFont: string): RtfTables {
  const fonts = [defaultFont];
  const colours: string[] = [];
  return {
    font: (name) => {
      const at = fonts.indexOf(name);
      if (at >= 0) return at;
      fonts.push(name);
      return fonts.length - 1;
    },
    colour: (hex) => {
      if (!hex || !HEX.test(hex)) return undefined;
      const value = hex.toLowerCase();
      const at = colours.indexOf(value);
      if (at >= 0) return at + 1;
      colours.push(value);
      // Index 0 is the reader's own colour, so the first named colour is 1.
      return colours.length;
    },
    header: () => {
      const fontTable = fonts
        .map((name, i) => `{\\f${i}\\fnil ${rtfText(name.replace(/;/g, ''))};}`)
        .join('');
      const colourTable = colours
        .map((hex) => {
          const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
          return `\\red${r}\\green${g}\\blue${b};`;
        })
        .join('');
      return `{\\fonttbl${fontTable}}\n{\\colortbl;${colourTable}}`;
    },
  };
}
