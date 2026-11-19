// A paragraph's characters as ODF text (ODF 1.4 part 3, "White-space characters"): a space is written as itself only
// where the reader's white-space collapse keeps it (after a character, before one that is not a space); every other
// space is `text:s`, tabs and line breaks are elements. Kept inlines do not count as characters, as the reader skips
// them too.
import { escapeXmlText } from '@livedoc/office-packages';

export type Segment =
  | { kind: 'text'; text: string; span?: string; link?: string }
  | { kind: 'kept'; xml: string; span?: string; link?: string };

function charsXml(text: string, offset: number, all: string): string {
  let out = '';
  let pending = 0;
  const flush = () => {
    if (pending === 1) out += '<text:s/>';
    else if (pending > 1) out += `<text:s text:c="${pending}"/>`;
    pending = 0;
  };
  let plain = '';
  const flushPlain = () => {
    out += escapeXmlText(plain);
    plain = '';
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    const g = offset + i;
    if (char === ' ') {
      const runStart = g === 0 || all[g - 1] !== ' ';
      let runEnd = g;
      while (all[runEnd] === ' ') runEnd += 1;
      if (runStart && g > 0 && runEnd < all.length) {
        flush();
        plain += ' ';
      } else {
        flushPlain();
        pending += 1;
      }
      continue;
    }
    flush();
    if (char === '\t' || char === '\n') {
      flushPlain();
      out += char === '\t' ? '<text:tab/>' : '<text:line-break/>';
    } else plain += char;
  }
  flush();
  flushPlain();
  return out;
}

const attr = (value: string) => escapeXmlText(value).replace(/"/g, '&quot;');

/** The paragraph's inline content: spans for styled stretches, links around them. */
export function paragraphContentXml(segments: readonly Segment[]): string {
  const all = segments.map((s) => (s.kind === 'text' ? s.text : '')).join('');
  let offset = 0;
  const pieces = segments.map((s) => {
    let inner: string;
    if (s.kind === 'text') {
      inner = charsXml(s.text, offset, all);
      offset += s.text.length;
    } else inner = s.xml;
    return {
      link: s.link,
      xml: s.span ? `<text:span text:style-name="${attr(s.span)}">${inner}</text:span>` : inner,
    };
  });
  let out = '';
  for (let i = 0; i < pieces.length;) {
    const link = pieces[i]!.link;
    let j = i;
    let xml = '';
    while (j < pieces.length && pieces[j]!.link === link) xml += pieces[j++]!.xml;
    out +=
      link === undefined
        ? xml
        : `<text:a xlink:type="simple" xlink:href="${attr(link)}">${xml}</text:a>`;
    i = j;
  }
  return out;
}
