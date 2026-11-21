// A watermark in an ODF file (docs/specs/034-text-documents/page-layout.md "Watermark", "In the file"): LibreOffice's
// fontwork `draw:custom-shape` whose `draw:name` starts `PowerPlusWaterMarkObject`, in a header paragraph; its colour and
// transparency in its graphic style, its font in its text style. Read from the kept element that holds it, with the
// styles it names; made as LibreOffice makes one, centred on the text area, behind the writing.
import {
  attributeOf,
  childElements,
  escapeXmlAttribute,
  escapeXmlText,
  keptXmlWithin,
  parseXml,
  textContent,
  type KeptXml,
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
import { NS } from './odf-names';

/** The styles LiveDoc writes a watermark with, in the styles part's automatic styles. */
export const WATERMARK_GRAPHIC_STYLE = 'LiveDocWatermark';
export const WATERMARK_TEXT_STYLE = 'LiveDocWatermarkText';

const is = (e: XmlElement, uri: string, local: string) => e.uri === uri && e.local === local;

function* descendants(e: XmlElement): Generator<XmlElement> {
  for (const child of childElements(e)) {
    yield child;
    yield* descendants(child);
  }
}

const parse = (kept: KeptXml) => {
  const parsed = parseXml(keptXmlWithin(kept, {}));
  return parsed.ok ? parsed.root : null;
};

// A style's properties element of one kind.
const properties = (style: XmlElement | null, local: string) =>
  style ? childElements(style).find((e) => is(e, NS.style, local)) : undefined;

const percent = (value: string | undefined) => {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : undefined;
};

/** An angle in `draw:transform`'s rotate, in radians; 0 without one. */
const rotationOf = (transform: string | undefined) =>
  Number.parseFloat(/rotate\s*\(\s*([-\d.eE]+)/.exec(transform ?? '')?.[1] ?? '0') || 0;

/** The watermark a kept element holds, reading the automatic styles it names through `styleOf`; null when none. */
export function readOdfWatermark(
  kept: Block | Inline,
  styleOf: (name: string) => KeptXml | undefined,
): Watermark | null {
  if (kept.type !== 'kept') return null;
  const root = parse(kept.xml);
  if (!root) return null;
  const shapes = [root, ...descendants(root)];
  const shape = shapes.find(
    (e) =>
      is(e, NS.draw, 'custom-shape') &&
      attributeOf(e, NS.draw, 'name')?.startsWith(WATERMARK_NAME_PREFIX),
  );
  if (!shape) return null;
  const paragraphs = childElements(shape).filter((e) => is(e, NS.text, 'p'));
  const text = paragraphs.map(textContent).join('\n');
  const styled = (name: string | undefined) => {
    const xml = name ? styleOf(name) : undefined;
    return xml ? parse(xml) : null;
  };
  const graphic = properties(
    styled(attributeOf(shape, NS.draw, 'style-name')),
    'graphic-properties',
  );
  const span = paragraphs.flatMap((p) => [...descendants(p)]).find((e) => is(e, NS.text, 'span'));
  const textProps = [
    styled(span && attributeOf(span, NS.text, 'style-name')),
    styled(paragraphs[0] && attributeOf(paragraphs[0], NS.text, 'style-name')),
    styled(attributeOf(shape, NS.draw, 'text-style-name')),
  ]
    .map((style) => properties(style, 'text-properties'))
    .filter((p): p is XmlElement => p !== undefined);
  const textProp = (uri: string, local: string) =>
    textProps.map((p) => attributeOf(p, uri, local)).find((v) => v !== undefined);
  const size = Number.parseFloat(textProp(NS.fo, 'font-size') ?? '');
  const font = textProp(NS.fo, 'font-family') ?? textProp(NS.style, 'font-name');
  const colour = graphic && attributeOf(graphic, NS.draw, 'fill-color');
  const opacity = percent(graphic && attributeOf(graphic, NS.draw, 'opacity')) ?? 1;
  return {
    kind: 'text',
    text,
    font: font?.replace(/^["']|["']$/g, '') || WATERMARK_DEFAULTS.font,
    ...(size > 1 ? { size } : {}),
    ...(textProp(NS.fo, 'font-weight') === 'bold' ? { bold: true as const } : {}),
    ...(textProp(NS.fo, 'font-style') === 'italic' ? { italic: true as const } : {}),
    colour: /^#[0-9a-f]{6}$/i.test(colour ?? '')
      ? colour!.toLowerCase()
      : WATERMARK_DEFAULTS.colour,
    transparency: Math.round((1 - opacity) * 100) / 100,
    layout:
      Math.abs(Math.sin(rotationOf(attributeOf(shape, NS.draw, 'transform')))) > 0.1
        ? 'diagonal'
        : 'horizontal',
  };
}

const inches = (pt: number) => `${Math.round((pt / 72) * 10000) / 10000}in`;

// A quarter turn's half: the diagonal, rising from the bottom left.
const DIAGONAL = Math.PI / 4;

// LibreOffice's fontwork plain text geometry, without its handle (ODF 1.4 names a handle's place otherwise).
const GEOMETRY =
  '<draw:enhanced-geometry svg:viewBox="0 0 21600 21600" draw:text-areas="0 0 21600 21600" draw:text-path="true" draw:text-path-mode="shape" draw:text-path-scale="path" draw:text-path-same-letter-heights="false" draw:type="fontwork-plain-text" draw:modifiers="10800" draw:enhanced-path="M ?f3 0 L ?f5 0 N M ?f6 21600 L ?f7 21600 N"><draw:equation draw:name="f0" draw:formula="$0 -10800"/><draw:equation draw:name="f1" draw:formula="?f0 *2"/><draw:equation draw:name="f2" draw:formula="abs(?f1 )"/><draw:equation draw:name="f3" draw:formula="if(?f1 ,0,?f2 )"/><draw:equation draw:name="f4" draw:formula="21600-?f2 "/><draw:equation draw:name="f5" draw:formula="if(?f1 ,?f4 ,21600)"/><draw:equation draw:name="f6" draw:formula="if(?f1 ,?f2 ,0)"/><draw:equation draw:name="f7" draw:formula="if(?f1 ,21600,?f4 )"/></draw:enhanced-geometry>';

/**
 * The shape holding a watermark, as LibreOffice writes one: its rotation about its corner, then moved so its middle is
 * the text area's middle.
 */
export function odfWatermarkInline(watermark: Watermark, setup: PageSetup): KeptInline {
  const area = {
    width: setup.width - setup.margins.left - setup.margins.right,
    height: setup.height - setup.margins.top - setup.margins.bottom,
  };
  const { width, height } = watermarkBox(watermark, area.width);
  const angle = watermark.layout === 'diagonal' ? DIAGONAL : 0;
  // The shape's middle once turned about its top left corner, which the move takes to the text area's middle.
  const turned = {
    x: (width / 2) * Math.cos(angle) + (height / 2) * Math.sin(angle),
    y: -(width / 2) * Math.sin(angle) + (height / 2) * Math.cos(angle),
  };
  const move = `translate (${inches(area.width / 2 - turned.x)} ${inches(area.height / 2 - turned.y)})`;
  const transform = angle ? `rotate (${angle}) ${move}` : move;
  const xml = `<draw:custom-shape text:anchor-type="char" draw:z-index="0" draw:name="${WATERMARK_NAME_PREFIX}1" draw:style-name="${WATERMARK_GRAPHIC_STYLE}" draw:text-style-name="${WATERMARK_TEXT_STYLE}" svg:width="${inches(width)}" svg:height="${inches(height)}" draw:transform="${escapeXmlAttribute(transform)}"><text:p text:style-name="${WATERMARK_TEXT_STYLE}">${escapeXmlText(watermark.text)}</text:p>${GEOMETRY}</draw:custom-shape>`;
  return {
    type: 'kept',
    name: 'custom-shape',
    xml: { xml, ns: { draw: NS.draw, text: NS.text, svg: NS.svg } },
    props: {},
  };
}

/** The automatic styles a watermark's shape names: its fill and place, and its words' font. */
export function odfWatermarkStyles(watermark: Watermark): { name: string; xml: string }[] {
  const opacity = `${Math.round((1 - watermark.transparency) * 100)}%`;
  const family = /\s/.test(watermark.font) ? `'${watermark.font}'` : watermark.font;
  const text = [
    `fo:font-family="${escapeXmlAttribute(family)}"`,
    `fo:font-size="${watermark.size ?? 1}pt"`,
    ...(watermark.bold ? ['fo:font-weight="bold"'] : []),
    ...(watermark.italic ? ['fo:font-style="italic"'] : []),
  ].join(' ');
  return [
    {
      name: WATERMARK_GRAPHIC_STYLE,
      xml: `<style:style style:name="${WATERMARK_GRAPHIC_STYLE}" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="solid" draw:auto-grow-height="false" draw:auto-grow-width="false" draw:fill-color="${watermark.colour}" draw:opacity="${opacity}" style:run-through="background" style:wrap="run-through" style:number-wrapped-paragraphs="no-limit" style:vertical-pos="middle" style:vertical-rel="page-content" style:horizontal-pos="center" style:horizontal-rel="page-content" style:flow-with-text="false"/></style:style>`,
    },
    {
      name: WATERMARK_TEXT_STYLE,
      xml: `<style:style style:name="${WATERMARK_TEXT_STYLE}" style:family="paragraph"><style:text-properties ${text}/></style:style>`,
    },
  ];
}
