// The WordprocessingML namespaces (ISO/IEC 29500-1) a text document's parts name, and LiveDoc's extension namespace,
// declared ignorable (standard-mapping.md "Conformance").
import { LIVEDOC_NS } from '../odf/odf-names';

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

/** Strict's WordprocessingML namespace, read as Transitional's. */
export const W_STRICT_NS = 'http://purl.oclc.org/ooxml/wordprocessingml/main';

export const WRITTEN_W_NS: Readonly<Record<string, string>> = {
  w: W_NS,
  r: R_NS,
  mc: MC_NS,
  livedoc: LIVEDOC_NS,
};

// Child order inside property elements: the schema's sequences (CT_PPrBase + CT_PPr, EG_RPrBase + CT_RPr,
// CT_SectPr), so kept children merge back where the schema wants them.
export const PPR_ORDER =
  'pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange'.split(
    ' ',
  );
export const RPR_ORDER =
  'rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath rPrChange'.split(
    ' ',
  );
export const SECTPR_ORDER =
  'headerReference footerReference footnotePr endnotePr type pgSz pgMar paperSrc pgBorders lnNumType pgNumType cols formProt vAlign noEndnote titlePg textDirection bidi rtlGutter docGrid printerSettings sectPrChange'.split(
    ' ',
  );
