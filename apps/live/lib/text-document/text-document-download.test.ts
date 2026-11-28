// docs/specs/034-text-documents/objects.md "Where the bytes live": a download names the pictures it left out.
import { describe, expect, it, vi } from 'vitest';
import { listZip } from '@livedoc/office-packages';
import {
  Pictures,
  readTextDocumentFile,
  TextDocument,
  TextDocumentState,
  type Picture,
} from '@livedoc/text-documents';
import {
  leftOutNotice,
  textDocumentDownload,
  type TextDocumentDownload,
} from './text-document-download';

describe('leftOutNotice', () => {
  it('counts the pictures a file left out', () => {
    expect(leftOutNotice(1)).toBe(
      'The file was downloaded without 1 picture LiveDoc could not read.',
    );
    expect(leftOutNotice(3)).toBe(
      'The file was downloaded without 3 pictures LiveDoc could not read.',
    );
  });
});

// objects.md "In the file": a writing naming drawings is written here, each drawn afresh; any other room-held one is
// the api's; a text document in This Browser is always written here.
describe('textDocumentDownload', () => {
  const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2,
    0, 0, 0, 1, 8, 2, 0, 0, 0,
  ]);
  const docWith = (drawing?: string) => {
    const blank = TextDocument.blank({ format: 'odf' });
    const picture: Picture = {
      type: 'picture',
      media: 'k1',
      width: 20,
      height: 20,
      props: {},
      ...(drawing ? { drawing } : {}),
    };
    return TextDocumentState.load([
      TextDocumentState.fromDocument({
        ...blank,
        body: [{ type: 'paragraph', style: blank.styles[0]!.id, props: {}, inlines: [picture] }],
        media: { k1: { mediaType: 'image/png', bytes: PNG } },
      }),
    ]);
  };
  const api = { blob: new Blob(['api']), fileName: 'N.odt', leftOut: 0 };
  const download = (over: Partial<TextDocumentDownload>) =>
    textDocumentDownload({
      file: { format: 'odf', name: 'N', type: 'odt' },
      localDoc: null,
      liveDoc: null,
      draw: null,
      readImage: async () => undefined,
      fromApi: vi.fn(async () => api),
      ...over,
    });

  it('asks the api for a writing that names no drawing', async () => {
    const fromApi = vi.fn(async () => api);
    expect(await download({ liveDoc: docWith(), draw: vi.fn(), fromApi })).toBe(api);
    expect(fromApi).toHaveBeenCalledTimes(1);
  });

  it('writes a writing naming drawings here, each drawn afresh', async () => {
    const fromApi = vi.fn(async () => api);
    const draw = vi.fn(async () => {
      const wide = new Uint8Array(PNG);
      wide[19] = 4;
      return wide;
    });
    const file = await download({ liveDoc: docWith('d1'), draw, fromApi });
    expect(fromApi).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledWith('d1');
    const read = await readTextDocumentFile(new Uint8Array(await file.blob.arrayBuffer()));
    if (!read.ok) throw new Error('unreadable');
    expect(Pictures.ofDocument(read.document)[0]).toMatchObject({
      width: 20,
      height: 5,
      drawing: 'd1',
    });
  });

  it('asks the api where no drawing can be drawn', async () => {
    const fromApi = vi.fn(async () => api);
    expect(await download({ liveDoc: docWith('d1'), draw: null, fromApi })).toBe(api);
  });

  it('writes a text document in This Browser here, drawings or none', async () => {
    const fromApi = vi.fn(async () => api);
    const file = await download({ localDoc: docWith(), fromApi });
    expect(fromApi).not.toHaveBeenCalled();
    expect(file.fileName).toBe('N.odt');
  });

  // files-and-print.md "Downloading": an export reads no picture, so only This Browser writes it here.
  it('writes an export here for This Browser, its pictures as their stand-ins', async () => {
    const written = await download({
      file: { format: 'odf', name: 'N', type: 'md' },
      localDoc: docWith('drawing-1'),
    });
    expect(written.fileName).toBe('N.md');
    expect(written.blob.type).toBe('text/markdown; charset=utf-8');
    expect(await written.blob.text()).toBe('\\[Picture\\]\n');
  });

  it('leaves an export to the api for a document a room holds, drawings or not', async () => {
    const fromApi = vi.fn(async () => api);
    await download({
      file: { format: 'odf', name: 'N', type: 'txt' },
      liveDoc: docWith('drawing-1'),
      draw: async () => PNG,
      fromApi,
    });
    expect(fromApi).toHaveBeenCalled();
  });

  // files-and-print.md "Downloading": the Web Page and the EPUB carry pictures, chosen and read as the native files.
  const galleryDoc = () => {
    const blank = TextDocument.blank({ format: 'odf' });
    const picture: Picture = { type: 'picture', media: 'k1', width: 20, height: 20, props: {} };
    return TextDocumentState.load([
      TextDocumentState.fromDocument({
        ...blank,
        body: [{ type: 'paragraph', style: blank.styles[0]!.id, props: {}, inlines: [picture] }],
        media: { k1: { mediaType: 'image/png', image: 'img-1' } },
      }),
    ]);
  };
  const entries = async (blob: Blob) => {
    const listed = listZip(new Uint8Array(await blob.arrayBuffer()));
    return listed.ok ? listed.entries.map((e) => e.name) : [];
  };

  it('zips a Web Page here for This Browser with its gallery pictures read back', async () => {
    const readImage = vi.fn(async () => PNG);
    const file = await download({
      file: { format: 'odf', name: 'N', type: 'html' },
      localDoc: galleryDoc(),
      readImage,
    });
    expect(readImage).toHaveBeenCalledWith('img-1');
    expect(file.fileName).toBe('N.zip');
    expect(file.blob.type).toBe('application/zip');
    expect(file.leftOut).toBe(0);
    expect(await entries(file.blob)).toEqual(['N.html', 'images/1.png']);
  });

  it('counts a picture an EPUB left out, its bytes unread', async () => {
    const file = await download({
      file: { format: 'odf', name: 'N', type: 'epub' },
      localDoc: galleryDoc(),
    });
    expect(file.fileName).toBe('N.epub');
    expect(file.leftOut).toBe(1);
    expect((await entries(file.blob)).some((name) => name.includes('images/'))).toBe(false);
  });

  it('leaves an EPUB to the api unless its writing names drawings, drawn afresh here', async () => {
    const fromApi = vi.fn(async () => api);
    const epub = { format: 'odf' as const, name: 'N', type: 'epub' as const };
    expect(await download({ file: epub, liveDoc: docWith(), draw: vi.fn(), fromApi })).toBe(api);
    const draw = vi.fn(async () => PNG);
    const file = await download({ file: epub, liveDoc: docWith('d1'), draw, fromApi });
    expect(fromApi).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledWith('d1');
    expect(await entries(file.blob)).toContain('OEBPS/images/1.png');
  });
});
