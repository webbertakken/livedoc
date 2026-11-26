// docs/specs/034-text-documents/objects.md "One drawing, one picture": how many pictures name each drawing tab, over
// every document tab's body.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { TextDocumentState } from '../text-document-state';
import { PICTURE } from './live-names';
import { tabFragment } from './live-root';
import { addLiveTab, liveTabIds } from './live-tabs';

const picture = (attrs: Record<string, string>) => {
  const node = new Y.XmlElement(PICTURE);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
};
const paragraph = (...children: Y.XmlElement[]) => {
  const node = new Y.XmlElement('paragraph');
  node.insert(0, children);
  return node;
};

describe('TextDocumentState.drawingNames', () => {
  it('counts the pictures naming each drawing tab in every document tab', () => {
    const doc = TextDocumentState.load();
    const [first] = liveTabIds(doc);
    tabFragment(doc, first!).push([
      paragraph(picture({ media: 'a', drawing: 'd1' }), picture({ media: 'b' })),
    ]);
    addLiveTab(doc, { id: 't.2', name: 'Tab 2', style: 'Title' });
    tabFragment(doc, 't.2').push([
      paragraph(picture({ media: 'c', drawing: 'd1' }), picture({ media: 'd', drawing: 'd2' })),
    ]);
    expect([...TextDocumentState.drawingNames(doc)]).toEqual([
      ['d1', 2],
      ['d2', 1],
    ]);
  });

  it('counts none in a document without drawings', () => {
    expect(TextDocumentState.drawingNames(TextDocumentState.load()).size).toBe(0);
  });
});

// "The document around it": a drawing's picture is shown in the document tab whose body holds it.
describe('TextDocumentState.drawingPlace', () => {
  it('names the first document tab whose body holds a picture of the drawing', () => {
    const doc = TextDocumentState.load();
    addLiveTab(doc, { id: 't.2', name: 'Tab 2', style: 'Title' });
    tabFragment(doc, 't.2').push([paragraph(picture({ media: 'c', drawing: 'd1' }))]);
    expect(TextDocumentState.drawingPlace(doc, 'd1')).toBe('t.2');
    expect(TextDocumentState.drawingPlace(doc, 'gone')).toBeNull();
  });
});

// docs/specs/009-elements/images.md "A live tab's references": the gallery images an update writes, read from it alone.
describe('TextDocumentState.galleryImagesWritten', () => {
  const updateOf = (change: (doc: Y.Doc) => void) => {
    const doc = TextDocumentState.load();
    doc.getXmlFragment('body').insert(0, [paragraph()]);
    const vector = Y.encodeStateVector(doc);
    change(doc);
    return Y.encodeStateAsUpdate(doc, vector);
  };

  it('names the gallery image each media entry the update writes holds', () => {
    const update = updateOf((doc) =>
      doc.transact(() => {
        doc.getMap('media').set('k1', { mediaType: 'image/png', image: 'img-1' });
        doc.getMap('media').set('k2', { mediaType: 'image/png', bytes: new Uint8Array(4) });
        doc
          .getMap('media')
          .set('k3', { mediaType: 'image/png', image: 'data:image/png;base64,AA' });
        (doc.getXmlFragment('body').get(0) as Y.XmlElement).insert(0, [picture({ media: 'k1' })]);
      }),
    );
    expect(TextDocumentState.galleryImagesWritten(update)).toEqual(['img-1']);
  });

  it('names none for an update that writes no media, or one it cannot read', () => {
    const update = updateOf((doc) =>
      (doc.getXmlFragment('body').get(0) as Y.XmlElement).insert(0, [picture({ media: 'k1' })]),
    );
    expect(TextDocumentState.galleryImagesWritten(update)).toEqual([]);
    expect(TextDocumentState.galleryImagesWritten(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});
