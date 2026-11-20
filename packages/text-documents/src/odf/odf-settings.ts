// Pageless in an ODF file (docs/specs/034-text-documents/standard-mapping.md "Extensions"): a config item
// `livedoc:pageless` in a `livedoc:settings` set of `settings.xml`, which other suites keep or drop as any
// application's settings. The model holds the value, so the kept settings leave the set out and writing adds it back.
import {
  attributeOf,
  childElements,
  keptXmlOf,
  serializeXml,
  textContent,
  type KeptXml,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import { CONFIG_NS } from './odf-tabs';

export const LIVEDOC_SETTINGS = 'livedoc:settings';
export const PAGELESS_ITEM = 'livedoc:pageless';

const PAGELESS_SET = `<config:config-item-set xmlns:config="${CONFIG_NS}" config:name="${LIVEDOC_SETTINGS}"><config:config-item config:name="${PAGELESS_ITEM}" config:type="boolean">true</config:config-item></config:config-item-set>`;

const isConfig = (e: XmlElement, local: string, name: string) =>
  e.uri === CONFIG_NS && e.local === local && attributeOf(e, CONFIG_NS, 'name') === name;

const isLivedocSet = (e: XmlElement) => isConfig(e, 'config-item-set', LIVEDOC_SETTINGS);

/** Whether a file's settings make the document pageless. */
export function pagelessIn(settings: XmlElement | undefined): boolean {
  const set = settings && childElements(settings).find(isLivedocSet);
  const item = set && childElements(set).find((e) => isConfig(e, 'config-item', PAGELESS_ITEM));
  return item !== undefined && textContent(item).trim() === 'true';
}

/** A file's settings as kept: as they came, or without LiveDoc's own set where they hold it. */
export function keptSettings(parsed: XmlParsed, settings: XmlElement): KeptXml {
  const kept = keptXmlOf(parsed, settings);
  return childElements(settings).some(isLivedocSet)
    ? { ...kept, xml: serializeXml(settings, isLivedocSet) }
    : kept;
}

/** The settings element written with pageless on: LiveDoc's set added at its end, or settings made to hold it. */
export function withPageless(settings: string, on: boolean | undefined): string {
  if (!on) return settings;
  if (settings === '') return `<office:settings>${PAGELESS_SET}</office:settings>`;
  const selfClosing = /\/>\s*$/.exec(settings);
  if (selfClosing) {
    const name = /^<([^\s/>]+)/.exec(settings)![1];
    return `${settings.slice(0, selfClosing.index)}>${PAGELESS_SET}</${name}>`;
  }
  const close = settings.lastIndexOf('</');
  return `${settings.slice(0, close)}${PAGELESS_SET}${settings.slice(close)}`;
}
