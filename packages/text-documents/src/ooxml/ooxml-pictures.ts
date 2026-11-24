// Pictures in line in WordprocessingML (docs/specs/034-text-documents/objects.md "In the formats"): a `w:drawing` holding
// a `wp:inline` DrawingML picture, its size (`wp:extent`), alternative text and title (`wp:docPr`), whether it is
// decorative (`adec:decorative`), its media (`a:blip r:embed`), its recolour and adjustments (the blip's effects,
// ooxml-picture-colours.ts) and crop (`a:srcRect`). A drawing holding anything else
// that changes how it looks is not the model's: the reader keeps it.
import {
  attributeOf,
  childElement,
  childElements,
  emuToPt,
  escapeXmlAttribute,
  PICTURE_EXTENSIONS,
  ptToEmu,
  RELATIONSHIP_TYPES,
  resolvePartName,
  type OoxmlPackage,
  type Relationship,
  type XmlElement,
} from '@livedoc/office-packages';
import { Pictures, type Picture, type PictureCrop, type PictureMedia } from '../model/pictures';
import { findMedia, keptXmlTexts, type FoundMedia, type MediaTaken } from '../picture-media';
import type { TextDocument } from '../model/text-document';
import type { PictureColouring } from '../model/picture-colours';
import { LIVEDOC_NS } from '../odf/odf-names';
import { R_NS } from './ooxml-names';
import { ooxmlColouringOf, ooxmlColouringXml } from './ooxml-picture-colours';
import { ooxmlAnchorParts, ooxmlPlacementOf } from './ooxml-picture-placement';
import type { PicturePlacement } from '../model/picture-placement';

export const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
export const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const WP14_NS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing';
const ADEC_NS = 'http://schemas.microsoft.com/office/drawing/2017/decorative';
/** `a:ext` uris: a decorative picture's mark, and those that change nothing drawn (an object's id, local dpi). */
const DECORATIVE_EXT = '{C183D7F6-B498-43B3-948B-1728B52AA6E4}';
const CREATION_ID_EXT = '{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}';
const LOCAL_DPI_EXT = '{28A0092B-C50C-407E-A947-70E740481C1C}';

const is = (e: XmlElement, uri: string, local: string) => e.uri === uri && e.local === local;
const only = (
  e: XmlElement,
  allowed: (a: { uri: string; local: string; value: string }) => boolean,
) => e.attributes.every(allowed);
const unqualified =
  (...names: string[]) =>
  (a: { uri: string; local: string }) =>
    a.uri === '' && names.includes(a.local);

/** An `a:extLst`'s extensions, each its uri and children, when it is one. */
function extensions(list: XmlElement): { uri: string; children: XmlElement[] }[] | undefined {
  const out: { uri: string; children: XmlElement[] }[] = [];
  for (const ext of childElements(list)) {
    if (!is(ext, A_NS, 'ext')) return undefined;
    out.push({ uri: attributeOf(ext, '', 'uri') ?? '', children: childElements(ext) });
  }
  return out;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** `wp:docPr`: its alternative text, title and whether it is decorative; undefined when it holds more. */
function docPrOf(docPr: XmlElement): Pick<Picture, 'alt' | 'title' | 'decorative'> | undefined {
  if (!only(docPr, unqualified('id', 'name', 'descr', 'title'))) return undefined;
  let decorative: true | undefined;
  for (const c of childElements(docPr)) {
    const exts = is(c, A_NS, 'extLst') ? extensions(c) : undefined;
    if (!exts) return undefined;
    for (const ext of exts) {
      if (ext.uri === CREATION_ID_EXT) continue;
      const mark = ext.children[0];
      if (
        ext.uri !== DECORATIVE_EXT ||
        ext.children.length !== 1 ||
        !is(mark!, ADEC_NS, 'decorative')
      )
        return undefined;
      const val = attributeOf(mark!, '', 'val');
      if (val === '1' || val === 'true') decorative = true;
      else if (val !== '0' && val !== 'false') return undefined;
    }
  }
  const alt = attributeOf(docPr, '', 'descr');
  const title = attributeOf(docPr, '', 'title');
  return {
    ...(alt ? { alt } : {}),
    ...(title ? { title } : {}),
    ...(decorative ? { decorative } : {}),
  };
}

/** `pic:blipFill`: the relationship its blip names, its crop and colouring; undefined when it holds more. */
function blipFillOf(
  fill: XmlElement,
): ({ embed: string; crop?: PictureCrop } & PictureColouring) | undefined {
  if (!only(fill, unqualified('dpi', 'rotWithShape'))) return undefined;
  let embed: string | undefined;
  let crop: PictureCrop | undefined;
  let colouring: PictureColouring | undefined = {};
  for (const c of childElements(fill)) {
    if (is(c, A_NS, 'blip')) {
      if (!only(c, (a) => (a.uri === R_NS && a.local === 'embed') || unqualified('cstate')(a)))
        return undefined;
      const effects = childElements(c).filter((b) => !is(b, A_NS, 'extLst'));
      for (const b of childElements(c).filter((x) => is(x, A_NS, 'extLst'))) {
        const exts = extensions(b);
        if (!exts || exts.some((e) => e.uri !== LOCAL_DPI_EXT)) return undefined;
      }
      colouring = ooxmlColouringOf(effects);
      if (!colouring) return undefined;
      embed = attributeOf(c, R_NS, 'embed');
    } else if (is(c, A_NS, 'srcRect')) {
      if (!only(c, unqualified('l', 't', 'r', 'b'))) return undefined;
      const side = (name: string) => round4(Number(attributeOf(c, '', name) ?? '0') / 100_000);
      const read = { top: side('t'), right: side('r'), bottom: side('b'), left: side('l') };
      if (!Pictures.isCrop(read)) return undefined;
      crop = Pictures.crop(read);
    } else if (is(c, A_NS, 'stretch')) {
      for (const s of childElements(c))
        if (!is(s, A_NS, 'fillRect') || s.attributes.some((a) => a.value !== '0')) return undefined;
    } else return undefined;
  }
  return embed ? { embed, ...(crop ? { crop } : {}), ...colouring } : undefined;
}

/** Word's `rot`: a whole number of 60,000ths of a degree, clockwise. */
const ROTATION_UNITS = 60_000;
const EMU_A_POINT = 12_700;

/**
 * `pic:spPr`: the turn it gives the picture (objects.md "Rotation read"), when it gives it no other look of its own (a
 * plain rectangle, unflipped, no line or effects); undefined when it does.
 */
function plainShape(spPr: XmlElement): { rotation: number | undefined } | undefined {
  if (!only(spPr, unqualified('bwMode'))) return undefined;
  let rotation: number | undefined;
  const plain = childElements(spPr).every((c) => {
    if (is(c, A_NS, 'xfrm')) {
      const flipped = ['flipH', 'flipV'].some((n) => {
        const v = attributeOf(c, '', n);
        return v !== undefined && v !== '0' && v !== 'false';
      });
      const rot = attributeOf(c, '', 'rot');
      if (rot !== undefined && !/^-?\d+$/.test(rot)) return false;
      rotation = Pictures.rotation(Number(rot ?? '0') / ROTATION_UNITS);
      return !flipped && childElements(c).every((x) => is(x, A_NS, 'off') || is(x, A_NS, 'ext'));
    }
    if (is(c, A_NS, 'prstGeom'))
      return (
        attributeOf(c, '', 'prst') === 'rect' &&
        childElements(c).every((g) => is(g, A_NS, 'avLst') && childElements(g).length === 0)
      );
    if (is(c, A_NS, 'noFill')) return true;
    if (is(c, A_NS, 'ln')) return childElements(c).every((l) => is(l, A_NS, 'noFill'));
    if (is(c, A_NS, 'effectLst')) return childElements(c).length === 0;
    return false;
  });
  return plain ? { rotation } : undefined;
}

/** What a picture's drawing holds beyond the run around it. */
export type OoxmlPictureRead = Pick<
  Picture,
  'media' | 'width' | 'height' | 'alt' | 'title' | 'decorative' | 'crop' | 'rotation' | 'placement'
> &
  PictureColouring;

/**
 * A `w:drawing` read as a picture in line, when everything it holds is the model's and its blip names media found;
 * the media taken. Otherwise undefined, and the reader keeps it.
 */
export function readOoxmlPicture(
  drawing: XmlElement,
  mediaOf: (relationshipId: string) => FoundMedia | undefined,
  taken: MediaTaken,
  placeable = false,
): OoxmlPictureRead | undefined {
  const [frame, ...rest] = childElements(drawing);
  if (!frame || rest.length > 0) return undefined;
  let placement: PicturePlacement | undefined;
  let children: XmlElement[];
  if (is(frame, WP_NS, 'inline')) {
    if (
      !only(frame, (a) => unqualified('distT', 'distB', 'distL', 'distR')(a) || a.uri === WP14_NS)
    )
      return undefined;
    children = childElements(frame);
  } else if (placeable && is(frame, WP_NS, 'anchor')) {
    const placed = ooxmlPlacementOf(frame);
    if (!placed) return undefined;
    placement = placed.placement;
    children = placed.children;
  } else return undefined;
  let size: { width: number; height: number } | undefined;
  let named: ReturnType<typeof docPrOf>;
  let pic: XmlElement | undefined;
  for (const c of children) {
    if (is(c, WP_NS, 'extent')) {
      const width = emuToPt(attributeOf(c, '', 'cx'));
      const height = emuToPt(attributeOf(c, '', 'cy'));
      if (!width || !height || width <= 0 || height <= 0) return undefined;
      size = { width, height };
    } else if (is(c, WP_NS, 'docPr')) {
      named = docPrOf(c);
      if (!named) return undefined;
    } else if (is(c, A_NS, 'graphic')) {
      const data = childElement(c, A_NS, 'graphicData');
      const [only1, ...more] = data ? childElements(data) : [];
      if (childElements(c).length !== 1 || more.length > 0 || !only1 || !is(only1, PIC_NS, 'pic'))
        return undefined;
      pic = only1;
    } else if (!is(c, WP_NS, 'effectExtent') && !is(c, WP_NS, 'cNvGraphicFramePr'))
      return undefined;
  }
  if (!size || !named || !pic) return undefined;
  let fill: ReturnType<typeof blipFillOf>;
  let shape: ReturnType<typeof plainShape> = { rotation: undefined };
  let drawingTab: string | undefined;
  for (const c of childElements(pic)) {
    if (is(c, PIC_NS, 'nvPicPr')) {
      const cNvPr = childElement(c, PIC_NS, 'cNvPr');
      if (cNvPr && (childElements(cNvPr).length > 0 || attributeOf(cNvPr, '', 'hidden') === '1'))
        return undefined;
      // A drawing's picture names its drawing tab (objects.md "In the file").
      drawingTab = (cNvPr && attributeOf(cNvPr, LIVEDOC_NS, 'drawing')) || undefined;
    } else if (is(c, PIC_NS, 'blipFill')) {
      fill = blipFillOf(c);
      if (!fill) return undefined;
    } else if (is(c, PIC_NS, 'spPr')) {
      shape = plainShape(c);
      if (!shape) return undefined;
    } else return undefined;
  }
  const found = fill && mediaOf(fill.embed);
  if (!found || !taken.take(found)) return undefined;
  return {
    media: found.key,
    ...size,
    ...named,
    ...(fill!.crop ? { crop: fill!.crop } : {}),
    ...(placement ? { placement } : {}),
    ...(fill!.recolour ? { recolour: fill!.recolour } : {}),
    ...(fill!.transparency ? { transparency: fill!.transparency } : {}),
    ...(fill!.brightness ? { brightness: fill!.brightness } : {}),
    ...(fill!.contrast ? { contrast: fill!.contrast } : {}),
    ...(shape.rotation ? { rotation: shape.rotation } : {}),
    ...(drawingTab ? { drawing: drawingTab } : {}),
  };
}

/** The part a picture's media is written at: the one it arrived in, else `media/<key>.<ext>` by the main part. */
export const ooxmlMediaPart = (key: string, media: PictureMedia, mainPart: string): string =>
  media.part ??
  `${mainPart.split('/').slice(0, -1).concat('media').join('/')}/${key}.${PICTURE_EXTENSIONS[media.mediaType]}`;

const attr = (name: string, value: string | undefined) =>
  value === undefined ? '' : ` ${name}="${escapeXmlAttribute(value)}"`;
const thousandths = (fraction: number) => String(Math.round(fraction * 100_000));

/**
 * `wp:effectExtent`: how far a turned picture's bounds reach past its extent on each side, in EMU, so its line makes
 * room for them, as Word writes it (objects.md "Rotation written"); none unturned.
 */
function effectExtentOf(picture: Picture): string {
  const bounds = Pictures.turnedBounds(picture, Pictures.rotation(picture.rotation));
  const across = Math.max(0, Math.round(((bounds.width - picture.width) * EMU_A_POINT) / 2));
  const down = Math.max(0, Math.round(((bounds.height - picture.height) * EMU_A_POINT) / 2));
  return `<wp:effectExtent l="${across}" t="${down}" r="${across}" b="${down}"/>`;
}

/**
 * A picture in line, or placed, as Word writes one: `rPr` the run's formatting, `embed` its media's relationship, `id`
 * its number (and the order a placed one overlaps others in).
 */
export function ooxmlPictureXml(picture: Picture, rPr: string, embed: string, id: number): string {
  const cx = ptToEmu(picture.width);
  const cy = ptToEmu(picture.height);
  const name = `Picture ${id}`;
  const decorative = picture.decorative
    ? `<a:extLst xmlns:a="${A_NS}"><a:ext uri="${DECORATIVE_EXT}"><adec:decorative xmlns:adec="${ADEC_NS}" val="1"/></a:ext></a:extLst>`
    : '';
  const docPr = `<wp:docPr id="${id}"${attr('name', name)}${attr('descr', picture.alt)}${attr('title', picture.title)}${decorative ? `>${decorative}</wp:docPr>` : '/>'}`;
  const crop = Pictures.crop(picture.crop);
  const rotation = Pictures.rotation(picture.rotation);
  const blipEffects = ooxmlColouringXml(picture);
  const frame = picture.placement
    ? { ...ooxmlAnchorParts(picture.placement, id), close: '</wp:anchor>' }
    : {
        open: `<wp:inline xmlns:wp="${WP_NS}" distT="0" distB="0" distL="0" distR="0">`,
        position: '',
        wrap: '',
        close: '</wp:inline>',
      };
  const srcRect = crop
    ? `<a:srcRect l="${thousandths(crop.left)}" t="${thousandths(crop.top)}" r="${thousandths(crop.right)}" b="${thousandths(crop.bottom)}"/>`
    : '';
  return `<w:r>${rPr}<w:drawing>${frame.open}${frame.position}<wp:extent cx="${cx}" cy="${cy}"/>${effectExtentOf(picture)}${frame.wrap}${docPr}<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A_NS}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${A_NS}"><a:graphicData uri="${PIC_NS}"><pic:pic xmlns:pic="${PIC_NS}"><pic:nvPicPr><pic:cNvPr id="0"${attr('name', name)}${attr('livedoc:drawing', picture.drawing || undefined)}/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${embed}"${blipEffects ? `>${blipEffects}</a:blip>` : '/>'}${srcRect}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm${rotation ? ` rot="${Math.round(rotation * ROTATION_UNITS)}"` : ''}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>${frame.close}</w:drawing></w:r>`;
}

const isImage = (r: Relationship) => r.type === RELATIONSHIP_TYPES.image && !r.external;

/** The media of every image part a relationship names, by part name: what the pictures read may hold. */
export async function ooxmlPictureLookup(
  pkg: OoxmlPackage,
): Promise<ReadonlyMap<string, FoundMedia>> {
  const found = new Map<string, FoundMedia>();
  for (const [from, rels] of pkg.relationships)
    for (const rel of rels.filter(isImage)) {
      const name = resolvePartName(from, rel.target);
      const bytes = name === undefined ? undefined : pkg.parts.get(name);
      if (name === undefined || bytes === undefined || found.has(name)) continue;
      const media = await findMedia(bytes, name);
      if (media && media !== 'too-large') found.set(name, media);
    }
  return found;
}

/**
 * The document with the parts its pictures hold no longer kept, nor their image relationships, unless kept content
 * still names one of those relationships (objects.md "In the formats", read).
 */
export function adoptOoxmlMedia(document: TextDocument, taken: MediaTaken): TextDocument {
  const source = document.source;
  if (source?.format !== 'ooxml' || taken.parts.size === 0) return document;
  const named = keptXmlTexts(document);
  const naming = (part: string) =>
    [...source.relationships].some(([from, rels]) =>
      rels.some(
        (r) =>
          isImage(r) &&
          resolvePartName(from, r.target) === part &&
          named.some((xml) => xml.includes(`"${r.id}"`)),
      ),
    );
  const adopted = new Set([...taken.parts].filter((part) => !naming(part)));
  if (adopted.size === 0) return document;
  const relationships = new Map(
    [...source.relationships].map(([from, rels]) => [
      from,
      rels.filter((r) => !(isImage(r) && adopted.has(resolvePartName(from, r.target) ?? ''))),
    ]),
  );
  return {
    ...document,
    source: { ...source, parts: source.parts.filter((p) => !adopted.has(p.name)), relationships },
  };
}
