// The document fonts (docs/specs/004-interface-design/fonts.md "Document fonts"): the families the office kinds draw
// text in, apart from the canvas's eleven. Each row names a family as files write it, its generic family and pitch as
// ODF and OOXML declare them, and either the Fontsource package LiveDoc serves it from or the served family that
// stands in for it. Text draws in the family it names, then its stand-in, then its generic family.

/** ODF's `style:font-family-generic` and OOXML's `w:family`. */
export type DocumentFontGeneric = 'roman' | 'swiss' | 'modern' | 'script' | 'decorative';
export type DocumentFontPitch = 'variable' | 'fixed';
export type DocumentFontStyle = '400-normal' | '400-italic' | '700-normal' | '700-italic';

export type DocumentFont = {
  readonly name: string;
  readonly generic: DocumentFontGeneric;
  readonly pitch: DocumentFontPitch;
  /** Listed in the toolbar's font menu, as Google's default menu lists it. */
  readonly menu: boolean;
  /** Served by LiveDoc: its Fontsource package id and the faces it has. */
  readonly served?: { readonly id: string; readonly styles: readonly DocumentFontStyle[] };
  /** A family LiveDoc cannot ship: the served family drawn in its place, if any is close enough. */
  readonly standIn?: string;
};

const FOUR: readonly DocumentFontStyle[] = ['400-normal', '400-italic', '700-normal', '700-italic'];
const UPRIGHT: readonly DocumentFontStyle[] = ['400-normal', '700-normal'];
const REGULAR: readonly DocumentFontStyle[] = ['400-normal'];

const served = (
  name: string,
  generic: DocumentFontGeneric,
  styles: readonly DocumentFontStyle[],
  { menu = true, pitch = 'variable' }: { menu?: boolean; pitch?: DocumentFontPitch } = {},
): DocumentFont => ({
  name,
  generic,
  pitch,
  menu,
  served: { id: name.toLowerCase().replace(/ /g, '-'), styles },
});

const named = (
  name: string,
  generic: DocumentFontGeneric,
  standIn: string | undefined,
  { menu = false, pitch = 'variable' }: { menu?: boolean; pitch?: DocumentFontPitch } = {},
): DocumentFont => ({ name, generic, pitch, menu, ...(standIn ? { standIn } : {}) });

export const DOCUMENT_FONTS: readonly DocumentFont[] = [
  // The open families of Google Docs' default font menu.
  served('Amatic SC', 'decorative', UPRIGHT),
  served('Caveat', 'script', UPRIGHT),
  served('Comfortaa', 'decorative', UPRIGHT),
  served('EB Garamond', 'roman', FOUR),
  served('Lexend', 'swiss', UPRIGHT),
  served('Lobster', 'decorative', REGULAR),
  served('Lora', 'roman', FOUR),
  served('Merriweather', 'roman', FOUR),
  served('Montserrat', 'swiss', FOUR),
  served('Nunito', 'swiss', FOUR),
  served('Oswald', 'swiss', UPRIGHT),
  served('Pacifico', 'script', REGULAR),
  served('Playfair Display', 'roman', FOUR),
  served('Roboto', 'swiss', FOUR),
  served('Roboto Mono', 'modern', FOUR, { pitch: 'fixed' }),
  served('Roboto Serif', 'roman', FOUR),
  served('Spectral', 'roman', FOUR),
  // The stand-ins: metric-compatible where one exists, else the closest open face.
  served('Arimo', 'swiss', FOUR, { menu: false }),
  served('Tinos', 'roman', FOUR, { menu: false }),
  served('Cousine', 'modern', FOUR, { menu: false, pitch: 'fixed' }),
  served('Carlito', 'swiss', FOUR, { menu: false }),
  served('Caladea', 'roman', FOUR, { menu: false }),
  served('Gelasio', 'roman', FOUR, { menu: false }),
  served('Comic Neue', 'script', FOUR, { menu: false }),
  served('Anton', 'swiss', REGULAR, { menu: false }),
  // Families files name that LiveDoc cannot ship.
  named('Arial', 'swiss', 'Arimo', { menu: true }),
  named('Helvetica', 'swiss', 'Arimo'),
  named('Liberation Sans', 'swiss', 'Arimo'),
  named('Times New Roman', 'roman', 'Tinos', { menu: true }),
  named('Liberation Serif', 'roman', 'Tinos'),
  named('Courier New', 'modern', 'Cousine', { menu: true, pitch: 'fixed' }),
  named('Liberation Mono', 'modern', 'Cousine', { pitch: 'fixed' }),
  named('Calibri', 'swiss', 'Carlito'),
  named('Cambria', 'roman', 'Caladea'),
  named('Georgia', 'roman', 'Gelasio', { menu: true }),
  named('Comic Sans MS', 'script', 'Comic Neue', { menu: true }),
  named('Impact', 'swiss', 'Anton', { menu: true }),
  named('Trebuchet MS', 'swiss', undefined, { menu: true }),
  named('Verdana', 'swiss', undefined, { menu: true }),
];

/** The family a document draws in when it names none, or one the catalogue does not know (Google Docs' default). */
export const DOCUMENT_DEFAULT_FONT = 'Arial';

const CSS_GENERIC: Record<DocumentFontGeneric, string> = {
  roman: 'serif',
  swiss: 'sans-serif',
  modern: 'monospace',
  script: 'cursive',
  decorative: 'sans-serif',
};

const byName = new Map(DOCUMENT_FONTS.map((font) => [font.name.toLowerCase(), font]));
const quoted = (family: string) => `"${family.replace(/["\\]/g, '')}"`;

export const DocumentFonts = {
  /** The catalogue's row for a family, matched without regard to case. */
  find: (name: string): DocumentFont | undefined => byName.get(name.trim().toLowerCase()),
  /** The served family a family draws in: itself when served, its stand-in, or none. */
  drawnIn: (name: string): string | undefined => {
    const font = DocumentFonts.find(name);
    if (!font) return undefined;
    return font.served ? font.name : font.standIn;
  },
  /**
   * The CSS stack text in this family draws with: the family itself (a computer that has it draws it), its stand-in,
   * its generic family. A family the catalogue does not know falls back to the default family's.
   */
  stack: (name: string): string => {
    const font = DocumentFonts.find(name);
    const fallback = font ?? DocumentFonts.find(DOCUMENT_DEFAULT_FONT)!;
    const families = [quoted(name.trim() || DOCUMENT_DEFAULT_FONT)];
    const standIn = fallback.served ? undefined : fallback.standIn;
    if (!font) families.push(quoted(fallback.name));
    if (standIn) families.push(quoted(standIn));
    families.push(CSS_GENERIC[fallback.generic]);
    return families.join(', ');
  },
  /** The font menu's families, in alphabetical order. */
  menu: (): readonly string[] =>
    DOCUMENT_FONTS.filter((f) => f.menu)
      .map((f) => f.name)
      .sort((a, b) => a.localeCompare(b, 'en')),
  /** The served families, with their Fontsource ids and faces. */
  served: (): readonly (DocumentFont & { served: NonNullable<DocumentFont['served']> })[] =>
    DOCUMENT_FONTS.filter(
      (f): f is DocumentFont & { served: NonNullable<DocumentFont['served']> } =>
        f.served !== undefined,
    ),
} as const;
