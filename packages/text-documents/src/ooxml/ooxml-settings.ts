// What a Word file's settings say that LiveDoc maps: pageless (docs/specs/034-text-documents/standard-mapping.md
// "Extensions"), `<livedoc:pageless/>`, its prefix listed in `mc:Ignorable` so Word passes over it; and Different odd
// and even (page-layout.md "Headers and footers"), `<w:evenAndOddHeaders/>`, in its place in the schema's order. A new
// file's settings are written whole; an arriving file's stay byte for byte unless one changed, then they are rewritten
// with it added or taken.
import {
  childElements,
  parseXml,
  ptToTwips,
  serializeXml,
  type XmlAttribute,
  type XmlElement,
} from '@livedoc/office-packages';
import { DEFAULT_TAB_INTERVAL_PT } from '../model/tab-stops';
import { LIVEDOC_NS } from '../odf/odf-names';
import { MC_NS, W_NS, XML_HEAD } from './ooxml-names';
import { readEvenAndOdd } from './ooxml-headers';

/** What the settings say. */
export type SettingsFlags = { pageless: boolean; evenAndOdd: boolean };

// `w:settings` children the schema (CT_Settings) puts after `w:evenAndOddHeaders`.
const AFTER_EVEN_AND_ODD = new Set(
  'bookFoldRevPrinting bookFoldPrinting bookFoldPrintingSheets drawingGridHorizontalSpacing drawingGridVerticalSpacing displayHorizontalDrawingGridEvery displayVerticalDrawingGridEvery doNotUseMarginsForDrawingGridOrigin drawingGridHorizontalOrigin drawingGridVerticalOrigin doNotShadeFormData noPunctuationKerning characterSpacingControl printTwoOnOne strictFirstAndLastChars noLineBreaksAfter noLineBreaksBefore savePreviewPicture doNotValidateAgainstSchema saveInvalidXml ignoreMixedContent alwaysShowPlaceholderText doNotDemarcateInvalidXml saveXmlDataOnly useXSLTWhenSaving saveThroughXslt showXMLTags alwaysMergeEmptyNamespace updateFields hdrShapeDefaults footnotePr endnotePr compat docVars rsids mathPr attachedSchema themeFontLang clrSchemeMapping doNotIncludeSubdocsInStats doNotAutoCompressPictures forceUpgrade captions readModeInkLockDown smartTagType schemaLibrary shapeDefaults doNotEmbedSmartTags decimalSymbol listSeparator'.split(
    ' ',
  ),
);
const isEvenAndOdd = (e: XmlElement) => e.uri === W_NS && e.local === 'evenAndOddHeaders';

const isPagelessMark = (e: XmlElement) => e.uri === LIVEDOC_NS && e.local === 'pageless';

/** Whether a Word file's settings make the document pageless. */
export const readPageless = (settings: XmlElement | undefined): boolean =>
  settings !== undefined && childElements(settings).some(isPagelessMark);

/** The mark and what its root must declare for it, for a new file's settings. */
export const PAGELESS_DECLARATIONS = ` xmlns:mc="${MC_NS}" xmlns:livedoc="${LIVEDOC_NS}" mc:Ignorable="livedoc"`;
export const PAGELESS_MARK = '<livedoc:pageless/>';

/** A prefix bound to `uri` in `scope`, else `wanted`, else `wanted` numbered until free. */
function prefixFor(scope: Readonly<Record<string, string>>, uri: string, wanted: string): string {
  const bound = Object.entries(scope).find(([p, u]) => u === uri && p !== '');
  if (bound) return bound[0];
  let prefix = wanted;
  for (let n = 1; prefix in scope; n += 1) prefix = `${wanted}${n}`;
  return prefix;
}

/**
 * An arriving file's `settings.xml` saying `flags`, or null when it already does (kept as it came). Null too for
 * settings that do not parse: they are kept and nothing is written.
 */
export function settingsWith(text: string, flags: SettingsFlags): string | null {
  const parsed = parseXml(text);
  if (!parsed.ok) return null;
  let root = parsed.root;
  if (root.uri !== W_NS || root.local !== 'settings') return null;
  const pagelessChanged = readPageless(root) !== flags.pageless;
  const evenAndOddChanged = readEvenAndOdd(root) !== flags.evenAndOdd;
  if (!pagelessChanged && !evenAndOddChanged) return null;
  if (evenAndOddChanged) root = withEvenAndOdd(root, flags.evenAndOdd);
  if (pagelessChanged) root = withPageless(root, flags.pageless);
  return `${XML_HEAD}${serializeXml(root)}\n`;
}

/** The settings with `w:evenAndOddHeaders` taken away, or put before what the schema puts after it. */
function withEvenAndOdd(root: XmlElement, on: boolean): XmlElement {
  const children = root.children.filter((c) => typeof c === 'string' || !isEvenAndOdd(c));
  if (!on) return { ...root, children };
  const w = prefixFor(root.scope, W_NS, 'w');
  const mark: XmlElement = {
    uri: W_NS,
    local: 'evenAndOddHeaders',
    prefix: w,
    attributes: [],
    children: [],
    declared: {},
    scope: root.scope,
    start: 0,
    end: 0,
  };
  const at = children.findIndex(
    (c) => typeof c !== 'string' && (c.uri !== W_NS || AFTER_EVEN_AND_ODD.has(c.local)),
  );
  const placed =
    at === -1 ? [...children, mark] : [...children.slice(0, at), mark, ...children.slice(at)];
  return { ...root, children: placed };
}

/** The settings with the pageless mark taken away, or added with what its root must declare for it. */
function withPageless(root: XmlElement, on: boolean): XmlElement {
  const children = root.children.filter((c) => typeof c === 'string' || !isPagelessMark(c));
  if (!on) return { ...root, children };
  const mc = prefixFor(root.scope, MC_NS, 'mc');
  const livedoc = prefixFor(root.scope, LIVEDOC_NS, 'livedoc');
  const declared = { ...root.declared, [mc]: MC_NS, [livedoc]: LIVEDOC_NS };
  const ignorable = root.attributes.find((a) => a.uri === MC_NS && a.local === 'Ignorable');
  const listed = new Set((ignorable?.value ?? '').split(/\s+/).filter(Boolean));
  listed.add(livedoc);
  const attributes: XmlAttribute[] = [
    ...root.attributes.filter((a) => a !== ignorable),
    { uri: MC_NS, prefix: mc, local: 'Ignorable', value: [...listed].join(' ') },
  ];
  const mark: XmlElement = {
    uri: LIVEDOC_NS,
    local: 'pageless',
    prefix: livedoc,
    attributes: [],
    children: [],
    declared: {},
    scope: { ...root.scope, ...declared },
    start: 0,
    end: 0,
  };
  return { ...root, declared, attributes, children: [...children, mark] };
}

/** The `settings.xml` a new Word file is written with: the default stops' interval, odd and even, the pageless mark. */
export const settingsXml = (
  interval: number | undefined,
  { pageless, evenAndOdd }: SettingsFlags,
): string =>
  `<w:settings xmlns:w="${W_NS}"${pageless ? PAGELESS_DECLARATIONS : ''}><w:defaultTabStop w:val="${ptToTwips(interval ?? DEFAULT_TAB_INTERVAL_PT)}"/>${evenAndOdd ? '<w:evenAndOddHeaders/>' : ''}${pageless ? PAGELESS_MARK : ''}</w:settings>`;
