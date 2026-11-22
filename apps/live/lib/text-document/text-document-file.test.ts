import { describe, expect, it, vi } from 'vitest';
import {
  Body,
  Pictures,
  readTextDocumentFile,
  TextDocument,
  TextDocumentState,
  type Picture,
} from '@livedoc/text-documents';
import { textDocumentFileOf } from './text-document-file';

// docs/specs/034-text-documents/live-editing-and-storage.md "A text document in This Browser": Download writes the
// file here, from the state, as the room would.
describe('textDocumentFileOf', () => {
  it('writes the file in the format the text document is held in, named after it', async () => {
    const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('Written here'))]);
    for (const [format, name] of [
      ['odf', 'Notes.odt'],
      ['ooxml', 'Notes.docx'],
    ] as const) {
      const { blob, fileName } = await textDocumentFileOf(doc, { format, name: 'Notes' });
      expect(fileName).toBe(name);
      const read = await readTextDocumentFile(new Uint8Array(await blob.arrayBuffer()));
      if (!read.ok) throw new Error('unreadable');
      expect(TextDocument.paragraphTexts(read.document)).toEqual(['Written here']);
      expect(read.document.metadata.title).toBe('Notes');
    }
  });
  it('writes an OpenDocument text document as a flat file when asked', async () => {
    const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('Flat'))]);
    const { blob, fileName } = await textDocumentFileOf(doc, {
      format: 'odf',
      name: 'Notes',
      type: 'fodt',
    });
    expect(fileName).toBe('Notes.fodt');
    expect(blob.type).toBe('application/vnd.oasis.opendocument.text-flat-xml');
    const read = await readTextDocumentFile(new Uint8Array(await blob.arrayBuffer()));
    if (!read.ok) throw new Error('unreadable');
    expect(TextDocument.paragraphTexts(read.document)).toEqual(['Flat']);
  });

  it('refuses a file of the other format: that is a conversion', async () => {
    const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('x'))]);
    await expect(
      textDocumentFileOf(doc, { format: 'odf', name: 'Notes', type: 'docx' }),
    ).rejects.toThrow(/format_not_native/);
  });
});

// objects.md "Where the bytes live": a gallery media is read back before the file is written; one that cannot be read
// leaves its picture out, counted.
describe('textDocumentFileOf with gallery pictures', () => {
  const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2,
    0, 0, 0, 1, 8, 2, 0, 0, 0,
  ]);
  const withGalleryPicture = () => {
    const blank = TextDocument.blank({ format: 'ooxml' });
    const picture: Picture = { type: 'picture', media: 'k1', width: 20, height: 10, props: {} };
    return TextDocumentState.load([
      TextDocumentState.fromDocument({
        ...blank,
        body: [{ type: 'paragraph', style: blank.styles[0]!.id, props: {}, inlines: [picture] }],
        media: { k1: { mediaType: 'image/png', image: 'img-1' } },
      }),
    ]);
  };
  const picturesOf = async (blob: Blob) => {
    const read = await readTextDocumentFile(new Uint8Array(await blob.arrayBuffer()));
    if (!read.ok) throw new Error('unreadable');
    return read.document;
  };

  it('writes the picture from the gallery image it names', async () => {
    const readImage = vi.fn(async () => PNG);
    const file = await textDocumentFileOf(withGalleryPicture(), {
      format: 'ooxml',
      name: 'Notes',
      readImage,
    });
    expect(readImage).toHaveBeenCalledWith('img-1');
    expect(file.leftOut).toBe(0);
    const document = await picturesOf(file.blob);
    expect(Object.values(document.media ?? {})).toEqual([
      expect.objectContaining({ mediaType: 'image/png', bytes: PNG }),
    ]);
  });

  it('leaves out, and counts, a picture it cannot read', async () => {
    const file = await textDocumentFileOf(withGalleryPicture(), { format: 'ooxml', name: 'N' });
    expect(file.leftOut).toBe(1);
    expect(Pictures.ofDocument(await picturesOf(file.blob))).toEqual([]);
  });
});
