// Pageless in a Word file (docs/specs/034-text-documents/standard-mapping.md "Extensions"): `<livedoc:pageless/>` in
// `w:settings`, its prefix listed in `mc:Ignorable` so Word passes over it. A new file's settings are written whole;
// an arriving file's stay byte for byte unless pageless changed, then they are rewritten with the mark added or taken.
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
 * An arriving file's `settings.xml` with pageless `on`, or null when it already says so (kept as it came). Null too
 * for settings that do not parse: they are kept and the mark is not written.
 */
export function settingsWithPageless(text: string, on: boolean): string | null {
  const parsed = parseXml(text);
  if (!parsed.ok) return null;
  const root = parsed.root;
  if (root.uri !== W_NS || root.local !== 'settings' || readPageless(root) === on) return null;
  const children = root.children.filter((c) => typeof c === 'string' || !isPagelessMark(c));
  if (!on) return `${XML_HEAD}${serializeXml({ ...root, children })}\n`;
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
  return `${XML_HEAD}${serializeXml({ ...root, declared, attributes, children: [...children, mark] })}\n`;
}

/** The `settings.xml` a new Word file is written with: the default stops' interval, and the pageless mark. */
export const settingsXml = (interval: number | undefined, pageless: boolean): string =>
  `<w:settings xmlns:w="${W_NS}"${pageless ? PAGELESS_DECLARATIONS : ''}><w:defaultTabStop w:val="${ptToTwips(interval ?? DEFAULT_TAB_INTERVAL_PT)}"/>${pageless ? PAGELESS_MARK : ''}</w:settings>`;
