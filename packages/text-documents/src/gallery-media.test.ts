// docs/specs/034-text-documents/objects.md "Where the bytes live": a picture's media names a gallery image by id and holds
// no bytes, or holds its bytes in the state; a file is written from bytes only, so gallery media are read back first
// and one that cannot be read leaves its picture out, named; the gallery images pictures hold are the tab's references.
import { describe, expect, it } from 'vitest';
import { convertTextDocument } from './convert';
import { textDocumentDigest } from './digest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import { MEDIA_MAP } from './live/live-names';
import { Pictures, type DocumentMedia } from './model/pictures';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { BLUE_PNG, BLUE_PNG_SHA, GREEN_PNG, GREEN_PNG_SHA } from './testing/pictures';
import { TextDocumentState } from './text-document-state';

const BLUE_IMAGE = 'image-blue';
const GREEN_IMAGE = 'image-green';

/** The pictures construct, its media named in the gallery rather than held. */
const inGallery = (format: 'odf' | 'ooxml'): TextDocument => ({
  ...CONSTRUCTS.pictures!(format),
  media: {
    [GREEN_PNG_SHA]: { mediaType: 'image/png', image: GREEN_IMAGE },
    [BLUE_PNG_SHA]: { mediaType: 'image/png', image: BLUE_IMAGE },
  },
});

const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  return written.bytes;
};

const reread = async (bytes: Uint8Array) => {
  const read = await readTextDocumentFile(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return read.document;
};

const gallery: Record<string, Uint8Array> = { [BLUE_IMAGE]: BLUE_PNG, [GREEN_IMAGE]: GREEN_PNG };

describe('Pictures.resolveMedia', () => {
  it('reads each gallery media its pictures hold into bytes, each image once', async () => {
    const asked: string[] = [];
    const { document, unavailable } = await Pictures.resolveMedia(inGallery('odf'), async (id) => {
      asked.push(id);
      return gallery[id];
    });
    expect(unavailable).toEqual([]);
    expect(asked.sort()).toEqual([BLUE_IMAGE, GREEN_IMAGE]);
    expect(document.media).toEqual({
      [GREEN_PNG_SHA]: { mediaType: 'image/png', bytes: GREEN_PNG },
      [BLUE_PNG_SHA]: { mediaType: 'image/png', bytes: BLUE_PNG },
    });
  });

  it('names the media it cannot read, a failing read as one it cannot', async () => {
    const { document, unavailable } = await Pictures.resolveMedia(
      inGallery('ooxml'),
      async (id) => {
        if (id === GREEN_IMAGE) throw new Error('offline');
        return id === BLUE_IMAGE ? undefined : gallery[id];
      },
    );
    expect(unavailable.sort()).toEqual([BLUE_PNG_SHA, GREEN_PNG_SHA].sort());
    expect(Pictures.heldMedia(document).filter(([, m]) => Pictures.holdsBytes(m))).toEqual([]);
  });

  it('asks nothing of a document whose media are all held', async () => {
    const document = CONSTRUCTS.pictures!('odf');
    const resolved = await Pictures.resolveMedia(document, () => {
      throw new Error('asked');
    });
    expect(resolved).toEqual({ document, unavailable: [] });
  });

  it('keeps the entry a media arrived in', async () => {
    const document: TextDocument = {
      ...inGallery('odf'),
      media: {
        [BLUE_PNG_SHA]: { mediaType: 'image/png', image: BLUE_IMAGE, part: 'Pictures/blue.png' },
      },
    };
    const { document: read } = await Pictures.resolveMedia(document, async (id) => gallery[id]);
    expect(read.media?.[BLUE_PNG_SHA]).toEqual({
      mediaType: 'image/png',
      part: 'Pictures/blue.png',
      bytes: BLUE_PNG,
    });
  });
});

describe('a file written with gallery media unread', () => {
  it.each(['odt', 'fodt', 'docx'] as const)(
    'leaves out the pictures it holds no bytes for (%s)',
    async (type) => {
      const format = type === 'docx' ? 'ooxml' : 'odf';
      const document = inGallery(format);
      const media: DocumentMedia = {
        ...document.media,
        [BLUE_PNG_SHA]: { mediaType: 'image/png', bytes: BLUE_PNG },
      };
      const back = await reread(write({ ...document, media }, type));
      const keys = new Set(Pictures.ofDocument(back).map((p) => p.media));
      expect([...keys]).toEqual([BLUE_PNG_SHA]);
      expect(Object.keys(back.media ?? {})).toEqual([BLUE_PNG_SHA]);
    },
  );
});

describe('gallery media converted', () => {
  it('carries the image a media names', () => {
    const { document } = convertTextDocument(inGallery('odf'), 'ooxml');
    expect(document.media?.[BLUE_PNG_SHA]).toEqual({ mediaType: 'image/png', image: BLUE_IMAGE });
  });
});

describe('gallery media in the live state', () => {
  const loaded = (document: TextDocument) =>
    TextDocumentState.load([TextDocumentState.fromDocument(document)]);

  it('reads back as written: an image id and no bytes', () => {
    const doc = loaded(inGallery('ooxml'));
    expect(TextDocumentState.media(doc, BLUE_PNG_SHA)).toEqual({
      mediaType: 'image/png',
      image: BLUE_IMAGE,
    });
    expect(TextDocumentState.document(doc, 'ooxml').media).toEqual(inGallery('ooxml').media);
  });

  it('reads an entry holding neither, or both, as no media', () => {
    const doc = loaded(inGallery('odf'));
    const map = doc.getMap<unknown>(MEDIA_MAP);
    map.set(BLUE_PNG_SHA, { mediaType: 'image/png' });
    map.set(GREEN_PNG_SHA, { mediaType: 'image/png', image: GREEN_IMAGE, bytes: GREEN_PNG });
    expect(TextDocumentState.media(doc, BLUE_PNG_SHA)).toBeUndefined();
    expect(TextDocumentState.media(doc, GREEN_PNG_SHA)).toBeUndefined();
  });

  it('names the gallery images its pictures hold, in the body and its stories, each once', () => {
    const doc = loaded(inGallery('odf'));
    expect(TextDocumentState.galleryImages(doc).sort()).toEqual([BLUE_IMAGE, GREEN_IMAGE]);
    expect([...textDocumentDigest(doc).imageIds].sort()).toEqual([BLUE_IMAGE, GREEN_IMAGE]);
  });

  it('names no media no picture holds, and none held as bytes', () => {
    const doc = loaded(CONSTRUCTS.pictures!('odf'));
    TextDocumentState.addMedia(doc, { other: { mediaType: 'image/png', image: 'image-unplaced' } });
    expect(TextDocumentState.galleryImages(doc)).toEqual([]);
  });

  it('names a picture held only in a header', () => {
    const document = inGallery('odf');
    const doc = loaded({ ...document, body: [document.body[3]!] });
    expect(TextDocumentState.galleryImages(doc)).toEqual([BLUE_IMAGE]);
  });

  it('keeps an entry once written: a later write of the same key changes nothing', () => {
    const doc = loaded(inGallery('odf'));
    TextDocumentState.addMedia(doc, {
      [BLUE_PNG_SHA]: { mediaType: 'image/png', bytes: BLUE_PNG },
    });
    expect(TextDocumentState.media(doc, BLUE_PNG_SHA)).toEqual({
      mediaType: 'image/png',
      image: BLUE_IMAGE,
    });
  });
});
