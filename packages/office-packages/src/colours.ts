// Colours (docs/specs/020-import-export/office-packages.md "Common pieces"): the model holds `#rrggbb`; ODF writes
// `#rrggbb`, OOXML `RRGGBB` or `auto`, and its highlight is one of sixteen names.

/** An ODF colour as the model's `#rrggbb`, or undefined (`transparent`, malformed). */
export function odfColour(value: string | undefined): string | undefined {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

/** An OOXML colour (`RRGGBB`) as `#rrggbb`; `auto` and malformed values are undefined. */
export function ooxmlColour(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : undefined;
}

export const colourToOoxml = (colour: string): string => colour.slice(1).toUpperCase();

/** OOXML's highlight names (ST_HighlightColor) and the colours they stand for. */
export const OOXML_HIGHLIGHTS: Readonly<Record<string, string>> = {
  black: '#000000',
  blue: '#0000ff',
  cyan: '#00ffff',
  green: '#00ff00',
  magenta: '#ff00ff',
  red: '#ff0000',
  yellow: '#ffff00',
  white: '#ffffff',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#c0c0c0',
};

/** The highlight name standing for this colour, if one does. */
export function ooxmlHighlightName(colour: string): string | undefined {
  return Object.entries(OOXML_HIGHLIGHTS).find(([, hex]) => hex === colour)?.[0];
}
