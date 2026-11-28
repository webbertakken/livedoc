// A Word theme's fonts (standard-mapping.md "What the model holds", A theme's font): the heading and body Latin
// typefaces of its font scheme, `a:theme/a:themeElements/a:fontScheme/a:majorFont|a:minorFont/a:latin@typeface`.
import {
  attributeOf,
  childElement,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import { A_NS } from './ooxml-pictures';
import type { ThemeFonts } from './ooxml-props';

const under = (element: XmlElement | undefined, local: string) =>
  element && childElement(element, A_NS, local);

/** The theme's heading (major) and body (minor) Latin typefaces; none without a theme part or a font scheme. */
export function themeFontsOf(theme: XmlParsed | undefined): ThemeFonts {
  const scheme = under(under(theme?.root, 'themeElements'), 'fontScheme');
  const typeface = (slot: 'majorFont' | 'minorFont') => {
    const latin = under(under(scheme, slot), 'latin');
    return (latin && attributeOf(latin, '', 'typeface'))?.trim() || undefined;
  };
  const major = typeface('majorFont');
  const minor = typeface('minorFont');
  return { ...(major ? { major } : {}), ...(minor ? { minor } : {}) };
}
