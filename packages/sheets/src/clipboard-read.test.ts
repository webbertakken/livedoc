// Pasted HTML read back into cells (grid-and-editing.md "Clipboard", D152 to D154): Google Sheets' and Excel's forms.
import { describe, expect, it } from 'vitest';
import { readPastedHtml } from './clipboard-read';

// What Google Sheets puts on the clipboard for A1:B2 with B1 a formula and A2:B2 merged.
const GOOGLE =
  '<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}' +
  '--></style><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" ' +
  'data-sheets-root="1"><colgroup><col width="100"/><col width="100"/></colgroup><tbody><tr style="height:21px;">' +
  '<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;" ' +
  'data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:2}">2</td><td style="overflow:hidden;padding:2px 3px 2px 3px;' +
  'vertical-align:bottom;font-weight:bold;text-align:right;" data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:4}" ' +
  'data-sheets-formula="=R[0]C[-1]*2">4</td></tr><tr style="height:21px;"><td style="overflow:hidden;' +
  'vertical-align:top;" rowspan="1" colspan="2">Notes &amp; more</td></tr></tbody></table>';

// What Excel puts on the clipboard: class rules in a style block, the number format among them.
const EXCEL =
  '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style><!--table {mso-displayed-decimal-separator:' +
  '"\\.";} .xl65 {mso-style-parent:style0; font-weight:700; mso-number-format:"0\\.00";} .xl66 {color:red; ' +
  'border-top:.5pt solid windowtext;} --></style></head><body><table border=0 cellpadding=0 cellspacing=0 width=128>' +
  '<tr height=20><td height=20 class=xl65 align=right width=64>1.50</td><td class="xl66" style="font-style:italic">' +
  'x<br>y</td></tr></table></body></html>';

describe('readPastedHtml', () => {
  it('reads Google’s formats, formula and spanning cell', () => {
    expect(readPastedHtml(GOOGLE)).toEqual([
      [
        { text: '2', format: { ha: 'r' } },
        { text: '4', format: { b: true, ha: 'r' }, formula: '=R[0]C[-1]*2' },
      ],
      [{ text: 'Notes & more', format: { va: 't' }, span: { rows: 1, cols: 2 } }, { text: '' }],
    ]);
  });

  it('reads Excel’s class rules under the cell’s own style', () => {
    expect(readPastedHtml(EXCEL)).toEqual([
      [
        { text: '1.50', format: { b: true, nf: 'custom', nc: '0.00' } },
        {
          text: 'x\ny',
          format: { fc: '#ff0000', bt: { w: 1, s: 'solid', c: '#000000' }, i: true },
        },
      ],
    ]);
  });

  it('keeps an unknown class and a formula that is no formula out', () => {
    expect(
      readPastedHtml(
        '<table><tr><td class="nope other" data-sheets-formula="plain">a</td></tr></table>',
      ),
    ).toEqual([[{ text: 'a' }]]);
  });

  it('pads ragged rows, reads font tags, and keeps odd entities and spans as they are', () => {
    expect(
      readPastedHtml(
        '<table><tr><td colspan="x">&#0;&#x41;<font style="color:#ff0000">r</font><span>s</span></td>' +
          '<td rowspan="0">b</td></tr><tr><td>c</td>',
      ),
    ).toEqual([
      [{ text: '&#0;Ars', format: { fc: '#ff0000' } }, { text: 'b' }],
      [{ text: 'c' }, { text: '' }],
    ]);
  });
});
