// What Format > Text, the toolbar's text controls and their shortcuts run (docs/specs/034-text-documents/
// text-and-paragraphs.md "Text formatting"): each acts on the editor there is now, says whether it is on as the menu or
// the toolbar draws it, gives the writing focus back, and is counted by its name. Only a session that writes gets them,
// so for anyone else they are not drawn (a built item left unbound).
import type { Command } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import type { OfficeFontSize } from '@/components/office/OfficeFontSizeField';
import type { OfficeFontFamily } from '@/components/office/OfficeFontMenu';
import type { OfficeColours } from '@/components/office/OfficeColourControl';
import { track } from '@/lib/telemetry';
import { readDomSelection } from './text-document-dom-selection';
import {
  capitalise,
  isToggleOn,
  setTextColour,
  setTextFont,
  setTextSize,
  stepTextSize,
  textColourOf,
  textFontOf,
  textSizeOf,
  textValuesOf,
  toggleText,
  toggleVertical,
  type TextFormatting,
  type TextToggle,
} from './text-document-formatting';

/** Each action's name in `Element · Changed · TextDocumentFormat<Name>`. */
export const TEXT_DOCUMENT_FORMAT_TELEMETRY = {
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  superscript: 'Superscript',
  subscript: 'Subscript',
  'small-caps': 'SmallCaps',
  'size-increase': 'Size',
  'size-decrease': 'Size',
  'font-size': 'Size',
  font: 'Font',
  lowercase: 'Lowercase',
  uppercase: 'Uppercase',
  'title-case': 'TitleCase',
  'text-colour': 'TextColour',
  'highlight-colour': 'Highlight',
} as const;
type FormatAction = keyof typeof TEXT_DOCUMENT_FORMAT_TELEMETRY;

// The toolbar's own controls, not items: the font, its size and the colours.
const CONTROLS: readonly FormatAction[] = ['font-size', 'font', 'text-colour', 'highlight-colour'];

/** The menu items bound here. */
export const TEXT_DOCUMENT_FORMAT_ITEMS = (
  Object.keys(TEXT_DOCUMENT_FORMAT_TELEMETRY) as FormatAction[]
).filter((id) => !CONTROLS.includes(id));

const TOGGLES: Partial<Record<FormatAction, TextToggle>> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strike',
  'small-caps': 'smallCaps',
};

export function textDocumentFormatActions(
  view: EditorView | null,
  readFormatting: () => TextFormatting,
  { canEdit }: { canEdit: boolean },
): {
  actions: OfficeActions;
  fontSize: OfficeFontSize | null;
  fontFamily: OfficeFontFamily | null;
  colours: OfficeColours | null;
} {
  if (!view || !canEdit) return { actions: {}, fontSize: null, fontFamily: null, colours: null };
  const run = (id: FormatAction, command: (f: TextFormatting) => Command) => {
    if (view.isDestroyed) return;
    readDomSelection(view);
    if (command(readFormatting())(view.state, view.dispatch))
      track('Element', 'Changed', `TextDocumentFormat${TEXT_DOCUMENT_FORMAT_TELEMETRY[id]}`);
    view.focus();
  };
  const actions: Record<string, OfficeAction> = {};
  for (const [id, toggle] of Object.entries(TOGGLES) as [FormatAction, TextToggle][])
    actions[id] = {
      run: () => run(id, (f) => toggleText(f, toggle)),
      get checked() {
        return isToggleOn(view.state, readFormatting(), toggle);
      },
    };
  for (const [id, place] of [
    ['superscript', 'super'],
    ['subscript', 'sub'],
  ] as const)
    actions[id] = {
      run: () => run(id, (f) => toggleVertical(f, place)),
      get checked() {
        const values = textValuesOf(view.state, readFormatting(), 'vertical');
        return values.length === 1 && values[0] === place;
      },
    };
  actions['size-increase'] = { run: () => run('size-increase', (f) => stepTextSize(f, 1)) };
  actions['size-decrease'] = { run: () => run('size-decrease', (f) => stepTextSize(f, -1)) };
  actions.lowercase = { run: () => run('lowercase', () => capitalise('lowercase')) };
  actions.uppercase = { run: () => run('uppercase', () => capitalise('uppercase')) };
  actions['title-case'] = { run: () => run('title-case', () => capitalise('titleCase')) };
  const fontSize: OfficeFontSize = {
    read: () => (view.isDestroyed ? null : textSizeOf(view.state, readFormatting())),
    set: (pt) => run('font-size', (f) => setTextSize(f, pt)),
  };
  const fontFamily: OfficeFontFamily = {
    read: () => (view.isDestroyed ? null : textFontOf(view.state, readFormatting())),
    set: (family) => run('font', (f) => setTextFont(f, family)),
    telemetryKind: 'TextDocument',
  };
  // Text colour and highlight (text-and-paragraphs.md "Colour"): text with no colour of its own draws in black ink.
  const colourOf = (id: 'text-colour' | 'highlight-colour', property: 'color' | 'highlight') => ({
    read: () => (view.isDestroyed ? null : textColourOf(view.state, readFormatting(), property)),
    set: (hex: string | null) => run(id, (f) => setTextColour(f, property, hex)),
  });
  const colours: OfficeColours = {
    'text-colour': { ...colourOf('text-colour', 'color'), leading: 'Reset', none: '#000000' },
    'highlight-colour': { ...colourOf('highlight-colour', 'highlight'), leading: 'None' },
  };
  return { actions, fontSize, fontFamily, colours };
}
