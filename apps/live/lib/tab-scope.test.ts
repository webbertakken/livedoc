import { describe, expect, it } from 'vitest';
import { drawingOfTabs, firstTabToLoad, isTabOutOfScope } from './tab-scope';

// docs/specs/013-workspace/tab-scoped-share-links.md: a visitor on a tab-scoped link can open their tab only.
describe('isTabOutOfScope', () => {
  it('leaves every tab open to an unscoped session', () => {
    expect(isTabOutOfScope('t1', null)).toBe(false);
  });

  it('closes every tab but the scoped one', () => {
    expect(isTabOutOfScope('t1', 't2')).toBe(true);
    expect(isTabOutOfScope('t2', 't2')).toBe(false);
  });

  // "Drawing tabs": a link to one tab reaches the drawing tabs that belong to it.
  it("opens the scoped tab's drawing tabs, never another tab's", () => {
    const drawingOf = drawingOfTabs([
      { id: 't1' },
      { id: 'd1', drawingOf: 't2' },
      { id: 'd2', drawingOf: 't1' },
    ]);
    expect(isTabOutOfScope('d1', 't2', drawingOf)).toBe(false);
    expect(isTabOutOfScope('d2', 't2', drawingOf)).toBe(true);
    expect(isTabOutOfScope('t1', 't2', drawingOf)).toBe(true);
    expect(isTabOutOfScope('d1', 't2')).toBe(true);
  });
});

describe('drawingOfTabs', () => {
  it("answers each drawing tab's text document tab, and null for any other tab", () => {
    const drawingOf = drawingOfTabs([{ id: 't1' }, { id: 'd1', drawingOf: 't1' }]);
    expect(drawingOf('d1')).toBe('t1');
    expect(drawingOf('t1')).toBeNull();
    expect(drawingOf('gone')).toBeNull();
  });
});

describe('firstTabToLoad', () => {
  const tabs = [{ id: 't1' }, { id: 't2' }];

  it('is the first tab for an unscoped session', () => {
    expect(firstTabToLoad(tabs, null)).toBe('t1');
  });

  it('is the scoped tab for a scoped session, wherever it sits', () => {
    expect(firstTabToLoad(tabs, 't2')).toBe('t2');
  });

  it('is nothing for an empty document', () => {
    expect(firstTabToLoad([], null)).toBeNull();
  });
});
