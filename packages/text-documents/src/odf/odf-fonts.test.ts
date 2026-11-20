// docs/specs/004-interface-design/fonts.md "In files": every face used is declared with its generic family and pitch.
import { describe, expect, it } from 'vitest';
import { writeTextDocumentFile } from '../files';
import { TextDocument } from '../model/text-document';
import type { Paragraph } from '../model/blocks';

const run = (text: string, font: string) => ({ type: 'run' as const, text, props: { font } });

describe('ODF font declarations', () => {
  it('declares a known family with its generic family and pitch, an unknown one by name alone', () => {
    const blank = TextDocument.blank({ format: 'odf' });
    const paragraph = blank.body[0] as Paragraph;
    const document = {
      ...blank,
      body: [{ ...paragraph, inlines: [run('code', 'Courier New'), run('odd', 'Wingdings')] }],
    };
    const written = writeTextDocumentFile(document, 'fodt');
    if (!written.ok) throw new Error(written.rejection);
    const xml = new TextDecoder().decode(written.bytes);
    expect(xml).toContain(
      `<style:font-face style:name="Courier New" svg:font-family="'Courier New'" style:font-family-generic="modern" style:font-pitch="fixed"/>`,
    );
    expect(xml).toContain('<style:font-face style:name="Wingdings" svg:font-family="Wingdings"/>');
    expect(xml).toContain('style:font-family-generic="swiss" style:font-pitch="variable"/>');
  });
});
