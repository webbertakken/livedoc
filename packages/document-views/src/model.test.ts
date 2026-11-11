import { describe, expect, it } from 'vitest';
import type { Element, Tab } from '@livedoc/document';
import { arrowBetween, shapeAt } from './__fixtures__/build';
import { buildViewModel } from './model';

describe('buildViewModel', () => {
  const tab: Tab = {
    id: '0b3481f3-59fb-4bd0-a21a-152f1ba9bba5',
    name: 'Checkout',
    elements: [
      shapeAt('square', 'a', 0, 0),
      { ...shapeAt('square', 'h', 0, 0), layerId: 'off' },
      { id: 'u', type: 'hologram' } as unknown as Element,
      arrowBetween('ah', 'a', 'h'),
      { ...arrowBetween('loose', 'a', 'a'), to: { kind: 'free', x: 0, y: 0 } },
    ],
    layers: [
      { id: 'default', name: 'Default' },
      { id: 'off', name: 'Off', visible: false },
    ],
  };

  it('carries the mode when it is not Diagram, and the finish when one is set', () => {
    expect(buildViewModel(tab).facts).not.toHaveProperty('mode');
    expect(buildViewModel(tab).facts).not.toHaveProperty('finish');
    const drawn = buildViewModel({ ...tab, opensIn: 'draw', finish: 'sketch' }).facts;
    expect([drawn.mode, drawn.finish]).toEqual(['draw', 'sketch']);
  });

  it('counts printed, hidden and unknown elements and carries the revision', () => {
    const model = buildViewModel(tab, { rev: 7 });
    expect(model.facts).toMatchObject({
      tab: { ref: '0b34', name: 'Checkout', kind: 'diagram' },
      elements: 3,
      hidden: 2,
      unknown: 1,
      rev: 7,
    });
    expect(model.kindOf(model.printed[1]!)).toBe('? hologram');
    expect(model.kindOf(model.printed[1]!)).toBe('? hologram');
  });

  it('refs every element, hidden ones included, so refs never change with visibility (VW2)', () => {
    const model = buildViewModel(tab);
    expect(model.refs.refOf('h')).toBe('h');
    expect(model.facts.rev).toBeNull();
  });

  it("makes the tab ref unique among the document's tabs (VW4)", () => {
    const sibling = '0b34ffff-0000-4000-8000-000000000000';
    const model = buildViewModel(tab, { tabIds: [tab.id, sibling] });
    expect(model.facts.tab.ref).toBe('0b348');
    expect(model.tabRefOf(sibling)).toBe('0b34f');
    expect(model.tabRefOf('51c9abcd-0000')).toBe('51c9');
  });

  it('ignores tab ids that leave this tab out', () => {
    const model = buildViewModel(tab, { tabIds: ['other'] });
    expect(model.facts.tab.ref).toBe('0b34');
  });
});

describe('suggestions in the view model (docs/specs/021-event-storming/suggestions.md)', () => {
  it('keeps a suggestion out of the printed elements without counting it as hidden', () => {
    const note = (id: string, extra: Record<string, unknown> = {}): Element => {
      const sticky: Element = {
        id,
        type: 'sticky',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        label: id,
        esKind: 'command',
        ...extra,
      };
      return sticky;
    };
    const tab: Tab = {
      id: 'es',
      name: 'Board',
      kind: 'event-storming',
      elements: [note('c'), note('s', { esSuggestion: { anchorId: 'c', side: 'above' } })],
    };
    const model = buildViewModel(tab);
    expect(model.printed.map((el) => el.id)).toEqual(['c']);
    expect(model.facts.hidden).toBe(0);
  });
});
