// Pictures in files for tests: Word's picture in line and LibreOffice's, as each writes one, with the parts a case
// changes as arguments. Test-only; never shipped.
import { RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import type { Picture } from '../model/pictures';
import { docx, odt, W_P } from './packages';
import { GREEN_PNG, GREEN_PNG_SHA } from './pictures';

// Word's inline picture, as Word writes one.
export const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DML = [
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
].join(' ');
export const ADEC =
  '<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>';
export type WordPicture = {
  docPr?: string;
  docPrChildren?: string;
  blip?: string;
  blipFill?: string;
  spPr?: string;
  xfrm?: string;
  anchor?: boolean | WordAnchor;
  embed?: string;
};
/** A `wp:anchor`'s parts a case changes: its distances, its other attributes, its position and its wrap. */
export type WordAnchor = { dist?: string; attrs?: string; position?: string; wrap?: string };
const WORD_ANCHOR: Required<WordAnchor> = {
  dist: 'distT="0" distB="0" distL="0" distR="0"',
  attrs:
    ' simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"',
  position:
    '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>',
  wrap: '<wp:wrapNone/>',
};
/** A Word anchor the model does not hold: centred on the margin by alignment. */
export const ALIGNED_ANCHOR: WordAnchor = {
  position:
    '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="margin"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>',
};
export const wordPicture = ({
  docPr = 'descr="A cat" title="Tom"',
  docPrChildren = '',
  blip = '',
  blipFill = '<a:srcRect l="10000" t="20000" r="5000"/><a:stretch><a:fillRect/></a:stretch>',
  spPr = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
  xfrm = '',
  anchor = false,
  embed = 'r:embed="rId5"',
}: WordPicture = {}) => {
  const tag = anchor ? 'wp:anchor' : 'wp:inline';
  const placed = anchor ? { ...WORD_ANCHOR, ...(anchor === true ? {} : anchor) } : undefined;
  const dist = placed?.dist ?? WORD_ANCHOR.dist;
  const anchorExtra = placed?.position ?? '';
  const anchorAttrs = placed?.attrs ?? '';
  return `<w:r><w:drawing><${tag} ${dist}${anchorAttrs} ${DML}>${anchorExtra}<wp:extent cx="1238250" cy="876300"/><wp:effectExtent l="19050" t="0" r="0" b="0"/>${placed?.wrap ?? ''}<wp:docPr id="2" name="Bild 2" ${docPr}>${docPrChildren}</wp:docPr><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="5" name="Picture 4"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip ${embed} cstate="print">${blip}</a:blip>${blipFill}</pic:blipFill><pic:spPr><a:xfrm${xfrm}><a:off x="0" y="0"/><a:ext cx="1238250" cy="876300"/></a:xfrm>${spPr}</pic:spPr></pic:pic></a:graphicData></a:graphic></${tag}></w:drawing></w:r>`;
};
export const IMAGE_REL = (id: string, target: string) =>
  `<Relationship Id="${id}" Type="${RELATIONSHIP_TYPES.image}" Target="${target}"/>`;
export const wordDocx = (runs: string, { bytes = GREEN_PNG, name = 'media/image2.png' } = {}) =>
  docx(W_P(runs).replace('<w:p>', `<w:p ${R_NS}>`), {
    rels: IMAGE_REL('rId5', name),
    entries: [{ name: `word/${name}`, data: bytes }],
  });

// LibreOffice's picture in line, as it writes one (soffice 24.2, from Word's above).
const ODF_STYLE_NS = [
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"',
].join(' ');
export const LO_GRAPHIC = (extra = '') =>
  `<style:style style:name="fr2" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties fo:margin-left="0in" fo:margin-right="0in" fo:margin-top="0in" fo:margin-bottom="0in" fo:background-color="transparent" draw:fill="none" draw:fill-color="#ffffff" fo:padding="0in" fo:border="none" style:mirror="none" fo:clip="rect(0.1917in, 0.0681in, 0in, 0.1354in)" draw:luminance="0%" draw:contrast="0%" draw:red="0%" draw:green="0%" draw:blue="0%" draw:gamma="100%" draw:color-inversion="false" draw:image-opacity="100%" draw:color-mode="standard" loext:decorative="true"${extra}/></style:style>`;
export const LO_FRAME = ({
  anchor = 'as-char',
  attrs = '',
  image = '<draw:image xlink:href="Pictures/10000000000000820000005CDC6B3555.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/png"/>',
  children = '<svg:title>Tom</svg:title><svg:desc>A cat</svg:desc>',
} = {}) =>
  `<draw:frame draw:style-name="fr2" draw:name="Bild 2" text:anchor-type="${anchor}" svg:width="1.3543in" svg:height="0.9583in" draw:z-index="0"${attrs}>${image}${children}</draw:frame>`;
export const loOdt = (frames: string, graphic = LO_GRAPHIC(), bytes = GREEN_PNG) =>
  odt('', {
    content: `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" ${ODF_STYLE_NS} office:version="1.4"><office:automatic-styles>${graphic}</office:automatic-styles><office:body><office:text><text:p>${frames}</text:p></office:text></office:body></office:document-content>`,
    entries: [{ name: 'Pictures/10000000000000820000005CDC6B3555.png', data: bytes }],
  });

export const TOM: Omit<Picture, 'width' | 'height' | 'crop'> = {
  type: 'picture',
  media: GREEN_PNG_SHA,
  alt: 'A cat',
  title: 'Tom',
  props: {},
};
