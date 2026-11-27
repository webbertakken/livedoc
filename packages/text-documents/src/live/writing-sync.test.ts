// docs/specs/034-text-documents/review.md "Editing modes" (Viewing follows others' changes): one writing made to read
// as another by the least change, so an editor bound to it keeps what it shows, where it is scrolled and what is selected.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { syncText, syncWriting } from './writing-sync';

type Shape = { name: string; attrs?: Record<string, unknown>; text?: string; children?: Shape[] };

function build(fragment: Y.XmlFragment | Y.XmlElement, shapes: readonly Shape[]): void {
  for (const shape of shapes) {
    const element = new Y.XmlElement(shape.name);
    fragment.push([element]);
    for (const [k, v] of Object.entries(shape.attrs ?? {})) element.setAttribute(k, v as never);
    if (shape.text !== undefined) {
      const text = new Y.XmlText();
      element.push([text]);
      text.insert(0, shape.text);
    }
    if (shape.children) build(element, shape.children);
  }
}

function docOf(shapes: readonly Shape[]) {
  const doc = new Y.Doc();
  build(doc.getXmlFragment('body'), shapes);
  return doc;
}

const json = (doc: Y.Doc) => doc.getXmlFragment('body').toJSON();

describe('syncWriting', () => {
  it('makes a writing read as another, keeping every node both hold', () => {
    const target = docOf([
      { name: 'paragraph', text: 'one' },
      { name: 'paragraph', text: 'two' },
      { name: 'paragraph', text: 'three' },
    ]);
    const kept = target.getXmlFragment('body').get(0);
    const source = docOf([
      { name: 'paragraph', text: 'one' },
      { name: 'paragraph', attrs: { align: 'center' }, text: 'two, more' },
      { name: 'paragraph', text: 'inserted' },
      { name: 'paragraph', text: 'three' },
    ]);
    syncWriting(source.getXmlFragment('body'), target.getXmlFragment('body'));
    expect(json(target)).toBe(json(source));
    expect(target.getXmlFragment('body').get(0)).toBe(kept);
  });

  it('removes what went, takes off attributes, and replaces a node of another name', () => {
    const target = docOf([
      { name: 'paragraph', attrs: { align: 'right', style: 'h1' }, text: 'a' },
      { name: 'table', children: [{ name: 'row', text: 'x' }] },
      { name: 'paragraph', text: 'gone' },
      { name: 'paragraph', text: 'end' },
    ]);
    const source = docOf([
      { name: 'paragraph', attrs: { style: 'h2' }, text: 'a' },
      { name: 'picture', attrs: { src: 'k' } },
      { name: 'paragraph', text: 'end' },
    ]);
    syncWriting(source.getXmlFragment('body'), target.getXmlFragment('body'));
    expect(json(target)).toBe(json(source));
  });

  it('keeps text formatting exact, nothing leaking in from beside it', () => {
    const source = new Y.Doc().getText('t');
    const target = new Y.Doc().getText('t');
    source.insert(0, 'plain ');
    source.insert(6, 'bold', { bold: true });
    target.insert(0, 'plain ', { italic: true });
    syncText(source, target);
    expect(target.toDelta()).toEqual(source.toDelta());
    syncText(source, target);
    expect(target.toDelta()).toEqual(source.toDelta());
  });

  it('reads as the source through random runs of edits', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      let state = seed;
      const random = () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
      };
      const source = docOf([
        { name: 'paragraph', text: 'alpha' },
        { name: 'paragraph', text: 'beta' },
      ]);
      const target = docOf([]);
      const body = source.getXmlFragment('body');
      for (let step = 0; step < 25; step += 1) {
        const at = Math.floor(random() * body.length);
        const roll = random();
        const paragraph = body.get(at) as Y.XmlElement | undefined;
        const text = paragraph?.get(0) as Y.XmlText | undefined;
        if (roll < 0.3 && text) text.insert(Math.floor(random() * (text.length + 1)), 'xy');
        else if (roll < 0.45 && text && text.length > 0) text.delete(0, 1);
        else if (roll < 0.6 && text) text.format(0, text.length, { bold: random() < 0.5 || null });
        else if (roll < 0.75) build(body, [{ name: 'paragraph', text: `p${step}` }]);
        else if (roll < 0.85 && body.length > 1) body.delete(at, 1);
        else if (paragraph) paragraph.setAttribute('align', random() < 0.5 ? 'left' : 'right');
        if (random() < 0.5) {
          syncWriting(body, target.getXmlFragment('body'));
          expect(json(target)).toBe(json(source));
        }
      }
      syncWriting(body, target.getXmlFragment('body'));
      expect(json(target)).toBe(json(source));
    }
  });
});
