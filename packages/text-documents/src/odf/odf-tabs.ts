// ODF tab positions (standard-mapping.md "The model", tab stops): LibreOffice counts them from the paragraph's indent
// unless `settings.xml` sets `TabsRelativeToIndent` false; the model counts from the text area's start. Read, the
// indent is added; written, taken off; a paragraph whose indent differs from its style's owns the stops it draws with.
import { attributeOf, childElements, textContent, type XmlElement } from '@livedoc/office-packages';
import type { ListPlace, ListDefinition } from '../model/lists';
import { canonical, type ParagraphProps } from '../model/props';
import { Styles, type Style, type StyleDefaults } from '../model/styles';
import { TabStops, type TabStop } from '../model/tab-stops';

export const CONFIG_NS = 'urn:oasis:names:tc:opendocument:xmlns:config:1.0';

/** The settings a text document made in LiveDoc writes: its tab positions count from the text area's start. */
export const ABSOLUTE_TABS_SETTINGS = `<office:settings xmlns:config="${CONFIG_NS}"><config:config-item-set config:name="ooo:configuration-settings"><config:config-item config:name="TabsRelativeToIndent" config:type="boolean">false</config:config-item></config:config-item-set></office:settings>`;

function* configItems(e: XmlElement): Generator<XmlElement> {
  for (const c of childElements(e)) {
    if (c.uri === CONFIG_NS && c.local === 'config-item') yield c;
    else yield* configItems(c);
  }
}

/** Whether a file's settings count tab positions from the indent: LibreOffice's default, unless set false. */
export function tabsFromIndentIn(settings: XmlElement | undefined): boolean {
  for (const item of settings ? configItems(settings) : [])
    if (attributeOf(item, CONFIG_NS, 'name') === 'TabsRelativeToIndent')
      return textContent(item).trim() !== 'false';
  return true;
}

export type TabContext = {
  readonly styles: readonly Style[];
  readonly defaults: StyleDefaults;
  readonly lists: Readonly<Record<string, ListDefinition>>;
};

/**
 * A paragraph, or a style (its parent as `style`): its formatting, and for a paragraph its list place.
 */
export type TabHolder = {
  readonly style: string | undefined;
  readonly props: ParagraphProps;
  readonly list?: ListPlace;
};

/** Where a style's positions count from: its indent through its parents and the defaults. */
export const styleTabOrigin = (c: TabContext, style: string | undefined): number =>
  Styles.paragraphPropsOf(c.styles, c.defaults, style).indentStart ?? 0;

/** Where a paragraph's positions count from: its own indent, else its list level's, else its style's. */
export function paragraphTabOrigin(c: TabContext, p: TabHolder): number {
  if (p.props.indentStart !== undefined) return p.props.indentStart;
  const level = p.list && c.lists[p.list.id]?.levels[p.list.level];
  if (level?.indent !== undefined) return level.indent;
  return styleTabOrigin(c, p.style);
}

const inheritedStops = (c: TabContext, style: string | undefined): readonly TabStop[] =>
  Styles.paragraphPropsOf(c.styles, c.defaults, style).tabStops ?? [];

// The paragraph's and its style's origins, both 0 in a file counting from the text area's start.
function origins(c: TabContext, p: TabHolder, fromIndent: boolean): { own: number; style: number } {
  return fromIndent
    ? { own: paragraphTabOrigin(c, p), style: styleTabOrigin(c, p.style) }
    : { own: 0, style: 0 };
}

/**
 * A paragraph's or a style's props as read: its own stops from the text area's start; with none of its own, where
 * its indent differs from its style's, the style's stops where LibreOffice draws them, as its own; a list equal to
 * its style's is none of its own.
 */
export function stopsRead(c: TabContext, p: TabHolder, fromIndent: boolean): ParagraphProps {
  const origin = origins(c, p, fromIndent);
  const inherited = inheritedStops(c, p.style);
  const own = p.props.tabStops;
  const drawn = own
    ? TabStops.shift(own, origin.own)
    : inherited.length > 0 && origin.own !== origin.style
      ? TabStops.shift(inherited, origin.own - origin.style)
      : undefined;
  if (drawn !== undefined && !TabStops.equal(drawn, inherited))
    return { ...p.props, tabStops: drawn };
  if (own === undefined) return p.props;
  const { tabStops: _, ...rest } = p.props;
  return rest;
}

/** A paragraph's or a style's props to write: the stops it draws with, less its origin. */
export function stopsWritten(c: TabContext, p: TabHolder, fromIndent: boolean): ParagraphProps {
  const origin = origins(c, p, fromIndent);
  const inherited = inheritedStops(c, p.style);
  const own =
    p.props.tabStops ??
    (inherited.length > 0 && origin.own !== origin.style ? inherited : undefined);
  return own ? { ...p.props, tabStops: TabStops.shift(own, -origin.own) } : p.props;
}

/**
 * The styles and defaults as read (`stopsRead` for each, parents first), each style's kept read again from its
 * values, so a style read unchanged is still written back as it came.
 */
export function stylesStopsRead(
  styles: readonly Style[],
  defaults: StyleDefaults,
  fromIndent: boolean,
): { styles: Style[]; defaults: StyleDefaults } {
  const shiftDefaults = fromIndent && defaults.paragraph.tabStops !== undefined;
  const paragraph = shiftDefaults
    ? {
        ...defaults.paragraph,
        tabStops: TabStops.shift(defaults.paragraph.tabStops, defaults.paragraph.indentStart ?? 0),
      }
    : defaults.paragraph;
  const newDefaults: StyleDefaults = shiftDefaults
    ? {
        ...defaults,
        paragraph,
        ...(defaults.kept
          ? { kept: { ...defaults.kept, read: canonical({ paragraph, text: defaults.text }) } }
          : {}),
      }
    : defaults;
  const out = [...styles];
  const done = new Set<string>();
  const context = (): TabContext => ({ styles: out, defaults: newDefaults, lists: {} });
  const visit = (at: number, seen: Set<string>): void => {
    const style = out[at]!;
    if (done.has(style.id) || seen.has(style.id)) return;
    seen.add(style.id);
    const parent = out.findIndex((s) => s.id === style.parent);
    if (parent !== -1) visit(parent, seen);
    done.add(style.id);
    if (style.family !== 'paragraph') return;
    const props = stopsRead(context(), { style: style.parent, props: style.paragraph }, fromIndent);
    if (props === style.paragraph) return;
    const { kept, ...values } = { ...style, paragraph: props };
    out[at] = { ...values, ...(kept ? { kept: { ...kept, read: canonical(values) } } : {}) };
  };
  out.forEach((_, at) => visit(at, new Set()));
  return { styles: out, defaults: newDefaults };
}
