// A watermark in a Word file (docs/specs/034-text-documents/page-layout.md "Watermark", "In the file"): a VML shape whose
// id starts `PowerPlusWaterMarkObject`, its words in a `v:textpath`, in a run of a header paragraph (Word wraps it in a
// `w:sdt` of the Watermarks gallery). Read from the kept element that holds it; made as Word makes one, centred on the
// text area, behind the writing.
import {
  escapeXmlAttribute,
  keptXmlWithin,
  parseXml,
  type XmlElement,
} from '@livedoc/office-packages';
import type { Block, Inline, KeptInline } from '../model/blocks';
import type { PageSetup } from '../model/sections';
import {
  WATERMARK_DEFAULTS,
  WATERMARK_NAME_PREFIX,
  watermarkBox,
  type Watermark,
} from '../model/watermark';
import { W_NS } from './ooxml-names';

export const VML_NS = 'urn:schemas-microsoft-com:vml';
export const VML_OFFICE_NS = 'urn:schemas-microsoft-com:office:office';
export const VML_WORD_NS = 'urn:schemas-microsoft-com:office:word';

// VML's named colours (the HTML 4 sixteen), as a fill colour may name one.
const NAMED_COLOURS: Readonly<Record<string, string>> = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff',
};

/** A VML colour as `#rrggbb`: a hex colour (3 or 6 digits) or a named one, before any `[index]`; else none. */
export function vmlColour(value: string | undefined): string | undefined {
  const token = value?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!token) return undefined;
  if (NAMED_COLOURS[token]) return NAMED_COLOURS[token];
  const hex = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(token)?.[1];
  if (!hex) return undefined;
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex}`;
}

/** A VML fraction: `0.5`, `.5`, `32768f` (65536ths) or `50%`; else none. */
export function vmlFraction(value: string | undefined): number | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  const n = Number.parseFloat(text);
  if (!Number.isFinite(n)) return undefined;
  const fraction = text.endsWith('f') ? n / 65536 : text.endsWith('%') ? n / 100 : n;
  return Math.min(1, Math.max(0, fraction));
}

/** A CSS-like `style` attribute's declarations by name. */
export function styleDeclarations(style: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (style ?? '').split(';')) {
    const at = part.indexOf(':');
    if (at > 0) out.set(part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim());
  }
  return out;
}

const attr = (e: XmlElement, local: string) =>
  e.attributes.find((a) => a.local === local && (a.uri === '' || a.uri === VML_NS))?.value;

function* descendants(e: XmlElement): Generator<XmlElement> {
  for (const child of e.children)
    if (typeof child !== 'string') {
      yield child;
      yield* descendants(child);
    }
}

const isVml = (e: XmlElement, local: string) => e.uri === VML_NS && e.local === local;

/** The watermark a kept element holds, or null when it holds none. */
export function readOoxmlWatermark(kept: Block | Inline): Watermark | null {
  if (kept.type !== 'kept') return null;
  const parsed = parseXml(keptXmlWithin(kept.xml, {}));
  if (!parsed.ok) return null;
  for (const shape of descendants(parsed.root)) {
    if (!isVml(shape, 'shape') || !attr(shape, 'id')?.startsWith(WATERMARK_NAME_PREFIX)) continue;
    const path = shape.children.find(
      (c): c is XmlElement => typeof c !== 'string' && isVml(c, 'textpath'),
    );
    const text = path && attr(path, 'string');
    if (!path || text === undefined) continue;
    const fill = shape.children.find(
      (c): c is XmlElement => typeof c !== 'string' && isVml(c, 'fill'),
    );
    const font = styleDeclarations(attr(path, 'style'));
    const look = styleDeclarations(attr(shape, 'style'));
    const size = Number.parseFloat(font.get('font-size') ?? '');
    const rotation = Number.parseFloat(look.get('rotation') ?? '0');
    const opacity = vmlFraction(fill && attr(fill, 'opacity')) ?? 1;
    return {
      kind: 'text',
      text,
      font: font.get('font-family')?.replace(/^["']|["']$/g, '') || WATERMARK_DEFAULTS.font,
      ...(size > 1 ? { size } : {}),
      ...(font.get('font-weight') === 'bold' ? { bold: true as const } : {}),
      ...(font.get('font-style') === 'italic' ? { italic: true as const } : {}),
      colour: vmlColour(attr(shape, 'fillcolor')) ?? WATERMARK_DEFAULTS.colour,
      transparency: Math.round((1 - opacity) * 100) / 100,
      layout: ((rotation % 360) + 360) % 360 === 0 ? 'horizontal' : 'diagonal',
    };
  }
  return null;
}

const round = (n: number) => Math.round(n * 100) / 100;

// Word's text-path shape type (136): the formulas and handle every Word watermark carries.
const SHAPE_TYPE =
  '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>';

/** The run holding a watermark, as Word writes one: centred on the margins, behind the text. */
export function ooxmlWatermarkInline(watermark: Watermark, setup: PageSetup): KeptInline {
  const { width, height } = watermarkBox(
    watermark,
    setup.width - setup.margins.left - setup.margins.right,
  );
  const style = [
    'position:absolute',
    'margin-left:0',
    'margin-top:0',
    `width:${width}pt`,
    `height:${height}pt`,
    ...(watermark.layout === 'diagonal' ? ['rotation:315'] : []),
    'z-index:-251657216',
    'mso-position-horizontal:center',
    'mso-position-horizontal-relative:margin',
    'mso-position-vertical:center',
    'mso-position-vertical-relative:margin',
  ].join(';');
  const font = [
    `font-family:"${watermark.font}"`,
    `font-size:${watermark.size ?? 1}pt`,
    ...(watermark.bold ? ['font-weight:bold'] : []),
    ...(watermark.italic ? ['font-style:italic'] : []),
  ].join(';');
  const opacity = round(1 - watermark.transparency);
  const xml = `<w:r><w:rPr><w:noProof/></w:rPr><w:pict>${SHAPE_TYPE}<v:shape id="${WATERMARK_NAME_PREFIX}1" o:spid="_x0000_s2049" type="#_x0000_t136" style="${escapeXmlAttribute(style)}" o:allowincell="f" fillcolor="${watermark.colour}" stroked="f"><v:fill opacity="${opacity}"/><v:textpath style="${escapeXmlAttribute(font)}" string="${escapeXmlAttribute(watermark.text)}"/><w10:wrap anchorx="margin" anchory="margin"/></v:shape></w:pict></w:r>`;
  return {
    type: 'kept',
    name: 'pict',
    xml: { xml, ns: { w: W_NS, v: VML_NS, o: VML_OFFICE_NS, w10: VML_WORD_NS } },
    props: {},
  };
}
