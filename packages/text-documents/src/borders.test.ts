// docs/specs/034-text-documents/standard-mapping.md "The model": paragraph borders and shading as other suites write
// them, read into the model's lines; a style with no dash of the model's reads as solid.
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile } from './files';
import type { Paragraph } from './model/blocks';
import { borderSize, borderSpace } from './ooxml/ooxml-borders';
import { docx, W_P, W_R } from './testing/packages';

const read = async (bytes: Uint8Array) => {
  const r = await readTextDocumentFile(bytes);
  if (!r.ok) throw new Error(r.rejection);
  return r.document.body.filter((b): b is Paragraph => b.type === 'paragraph');
};

const STYLES =
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';

describe('ODF paragraph borders', () => {
  it('reads the shorthand for every side, a side of its own over it, none, and the padding', async () => {
    const auto = (name: string, props: string) =>
      `<style:style ${STYLES} style:name="${name}" style:family="paragraph"><style:paragraph-properties ${props}/></style:style>`;
    const [a, b] = await read(
      new TextEncoder().encode(
        `<?xml version="1.0"?><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ${STYLES} office:mimetype="application/vnd.oasis.opendocument.text"><office:automatic-styles>${auto(
          'P1',
          'fo:border="0.06pt solid #000000" fo:border-bottom="#ff0000 2.5pt double" fo:padding="0.1in" fo:background-color="#FFF2CC"',
        )}${auto('P2', 'fo:border="none" fo:border-left="1pt dashed #00ff00" fo:padding-left="2pt" fo:background-color="transparent"')}</office:automatic-styles><office:body><office:text><text:p text:style-name="P1">a</text:p><text:p text:style-name="P2">b</text:p></office:text></office:body></office:document>`,
      ),
    );
    const thin = { width: 0.06, dash: 'solid', color: '#000000', space: 7.2 };
    expect(a!.props).toEqual({
      borders: {
        top: thin,
        left: thin,
        right: thin,
        bottom: { width: 2.5, dash: 'solid', color: '#ff0000', space: 7.2 },
      },
      shading: '#fff2cc',
    });
    expect(b!.props).toEqual({
      borders: { left: { width: 1, dash: 'dashed', color: '#00ff00', space: 2 } },
    });
  });
});

describe('WordprocessingML paragraph borders', () => {
  it('reads each side with its dash, nil as none, a missing size as the narrowest, and the fill', async () => {
    const [a, b] = await read(
      docx(
        W_P(
          `<w:pPr><w:pBdr><w:top w:val="dotted" w:sz="4" w:space="1" w:color="1155CC"/><w:left w:val="nil"/><w:bottom w:val="dotDash" w:sz="48" w:space="0" w:color="auto"/><w:right w:val="double"/><w:between w:val="single" w:sz="16" w:space="0" w:color="999999"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="FFF2CC"/></w:pPr>${W_R('a')}`,
        ) + W_P(`<w:pPr><w:shd w:val="solid" w:color="CC0000" w:fill="auto"/></w:pPr>${W_R('b')}`),
      ),
    );
    expect(a!.props).toEqual({
      borders: {
        top: { width: 0.5, dash: 'dotted', color: '#1155cc', space: 1 },
        bottom: { width: 6, dash: 'dashed', color: '#000000', space: 0 },
        right: { width: 0.25, dash: 'solid', color: '#000000', space: 0 },
        between: { width: 2, dash: 'solid', color: '#999999', space: 0 },
      },
      shading: '#fff2cc',
    });
    expect(b!.props).toEqual({ shading: '#cc0000' });
  });

  it('holds widths and padding to what Word draws', () => {
    expect([borderSize(0), borderSize(1), borderSize(20)]).toEqual([2, 8, 96]);
    expect([borderSpace(-1), borderSpace(4.4), borderSpace(72)]).toEqual([0, 4, 31]);
  });
});
