// docs/specs/034-text-documents/objects.md "Where the bytes live": a download names the pictures it left out.
import { describe, expect, it, vi } from 'vitest';
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
});
