// docs/specs/034-text-documents/links-and-navigation.md "Table of contents" and standard-mapping.md "Tables of
// contents": its levels and look as a file says them; the entry styles Contents 1 to 6, LiveDoc's own when a file has
// none, based on Normal text, indented 0.5 cm a level.
import { describe, expect, it } from 'vitest';
import { CONTENTS_INDENT_PT, Contents } from './contents';
import { Styles, type Style } from './styles';

describe('the entry styles', () => {
  it('are made in each format’s spelling, based on Normal text, indented a level below the first', () => {
    const odf = Styles.builtIn('odf');
    const first = Contents.entryStyle('odf', 1, odf);
    expect(first).toMatchObject({
      id: 'Contents_20_1',
      name: 'Contents 1',
      family: 'paragraph',
      parent: Styles.idOfRole(odf, 'normal'),
      paragraph: { indentStart: 0 },
    });
    expect(Contents.entryStyle('odf', 3, odf).paragraph.indentStart).toBeCloseTo(
      2 * CONTENTS_INDENT_PT,
    );
    const ooxml = Styles.builtIn('ooxml');
    expect(Contents.entryStyle('ooxml', 2, ooxml)).toMatchObject({
      id: 'TOC2',
      name: 'toc 2',
      parent: Styles.idOfRole(ooxml, 'normal'),
    });
  });

  it('takes a free id when the wanted one is another style’s', () => {
    const taken: Style = { id: 'TOC1', name: 'Mine', family: 'text', paragraph: {}, text: {} };
    expect(Contents.entryStyle('ooxml', 1, [taken]).id).toBe('TOC12');
  });

  it('finds a file’s own entry style by either spelling', () => {
    const own = (id: string, name: string): Style => ({
      id,
      name,
      family: 'paragraph',
      paragraph: {},
      text: {},
    });
    expect(Contents.heldStyle([own('Contents_20_2', 'Contents 2')], 2)?.id).toBe('Contents_20_2');
    expect(Contents.heldStyle([own('TOC2', 'toc 2')], 2)?.id).toBe('TOC2');
    expect(Contents.heldStyle([own('X', 'TOC 4')], 4)?.id).toBe('X');
    expect(Contents.heldStyle([own('TOC2', 'toc 2')], 3)).toBeUndefined();
  });
});
