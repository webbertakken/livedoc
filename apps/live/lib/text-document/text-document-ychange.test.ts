// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Version history", Show changes: what a version added or removed is drawn in
// its editor's colour, on text and on every other node.
import { describe, expect, it } from 'vitest';
import type { DOMOutputSpec, Node as PmNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { textDocumentSchema } from './text-document-schema';
import {
  stampYChange,
  textDocumentVersionSchema,
  withYChangeViews,
  YCHANGE,
  yChangeOf,
} from './text-document-ychange';

const added = { type: 'added', color: { light: '#0284c7', dark: '#0284c7' } };

describe('yChangeOf', () => {
  it('reads a change, its colour only where it is one', () => {
    expect(yChangeOf(added)).toEqual({ type: 'added', colour: '#0284c7' });
    expect(yChangeOf({ type: 'removed', color: { light: 'red;x' } })).toEqual({
      type: 'removed',
      colour: null,
    });
    expect(yChangeOf({ type: 'removed', color: null })).toEqual({ type: 'removed', colour: null });
    expect(yChangeOf({ type: 'moved' })).toBeNull();
    expect(yChangeOf(null)).toBeNull();
  });
});

describe('stampYChange', () => {
  const change = { type: 'added', colour: '#0284c7' } as const;
  it('adds its attributes to a drawing’s own, joining their style', () => {
    expect(stampYChange(['p', { style: 'color: red' }, 0], change)).toEqual([
      'p',
      { style: 'color: red; --ychange-colour: #0284c7', 'data-ychange': 'added' },
      0,
    ]);
    expect(stampYChange(['p', 0], { type: 'removed', colour: null })).toEqual([
      'p',
      { 'data-ychange': 'removed', style: undefined },
      0,
    ]);
    expect(stampYChange(['hr'], change)).toEqual([
      'hr',
      { 'data-ychange': 'added', style: '--ychange-colour: #0284c7' },
    ]);
  });

  it('stamps a drawn element, and leaves a drawing with no change as it is', () => {
    const dom = document.createElement('div');
    stampYChange({ dom }, change);
    expect(dom.dataset.ychange).toBe('added');
    expect(dom.style.getPropertyValue('--ychange-colour')).toBe('#0284c7');
    const bare = document.createElement('span');
    stampYChange(bare, change);
    expect(bare.dataset.ychange).toBe('added');
    const spec: DOMOutputSpec = ['p', 0];
    expect(stampYChange(spec, null)).toBe(spec);
  });
});

describe('textDocumentVersionSchema', () => {
  it('is the editor’s schema with the change mark and every node’s change attribute', () => {
    expect(textDocumentSchema.marks[YCHANGE]).toBeUndefined();
    expect(textDocumentVersionSchema.marks[YCHANGE]).toBeDefined();
    for (const [name, type] of Object.entries(textDocumentVersionSchema.nodes)) {
      if (name === 'doc' || name === 'text') continue;
      expect(Object.keys(type.spec.attrs ?? {}), name).toContain(YCHANGE);
      expect(Object.keys(type.spec.attrs ?? {}).sort()).toEqual(
        [...Object.keys(textDocumentSchema.nodes[name]!.spec.attrs ?? {}), YCHANGE].sort(),
      );
    }
  });

  it('draws a node and a stretch of text with their change', () => {
    const p = textDocumentVersionSchema.nodes.paragraph!.create({ ychange: added });
    expect(p.type.spec.toDOM!(p)).toEqual([
      'p',
      { 'data-ychange': 'added', style: '--ychange-colour: #0284c7' },
      0,
    ]);
    const mark = textDocumentVersionSchema.marks[YCHANGE].create(added);
    expect(mark.type.spec.toDOM!(mark, true)).toEqual([
      'span',
      { 'data-ychange': 'added', style: '--ychange-colour: #0284c7' },
      0,
    ]);
    const odd = textDocumentVersionSchema.marks[YCHANGE].create({ type: 'x' });
    expect(odd.type.spec.toDOM!(odd, true)).toEqual(['span', {}, 0]);
  });
});

describe('withYChangeViews', () => {
  const node = (ychange: unknown) => ({ attrs: { ychange } }) as unknown as PmNode;
  const view = null as unknown as EditorView;

  it('stamps a node view’s element, and again when it is updated', () => {
    const made: NodeView = { dom: document.createElement('span'), update: () => true };
    const views = withYChangeViews({ picture: () => made });
    const drawn = views.picture!(node(added), view, () => 0, [], null as never);
    expect(drawn.dom.dataset.ychange).toBe('added');
    drawn.update!(node(null), [], null as never);
    expect(drawn.dom.dataset.ychange).toBeUndefined();
  });

  it('leaves a node view that cannot be updated, and an update refused, as they are', () => {
    const plain = withYChangeViews({ field: () => ({ dom: document.createElement('span') }) });
    expect(plain.field!(node(added), view, () => 0, [], null as never).update).toBeUndefined();
    const refusing = withYChangeViews({
      field: () => ({ dom: document.createElement('span'), update: () => false }),
    });
    const drawn = refusing.field!(node(added), view, () => 0, [], null as never);
    expect(drawn.update!(node(null), [], null as never)).toBe(false);
    expect(drawn.dom.dataset.ychange).toBe('added');
  });
});
