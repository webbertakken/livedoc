import { describe, expect, it } from 'vitest';
import { defaultTabName, isDefaultTabName, tabNamedByDocument } from './tab-names';

const tab = (id: string, name: string) => ({ id, name });

describe('isDefaultTabName', () => {
  it('holds for Tab N and nothing else', () => {
    expect(isDefaultTabName(defaultTabName(3))).toBe(true);
    expect(isDefaultTabName(' Tab 12 ')).toBe(true);
    expect(isDefaultTabName('Tab')).toBe(false);
    expect(isDefaultTabName('Roadmap')).toBe(false);
  });
});

describe('tabNamedByDocument', () => {
  it('names a first tab that still has its default name', () => {
    expect(tabNamedByDocument([tab('a', 'Tab 1')], 'Roadmap')).toEqual({
      id: 'a',
      name: 'Roadmap',
    });
  });

  it('names the first tab only, never a later default one', () => {
    const tabs = [tab('a', 'Overview'), tab('b', 'Tab 2')];
    expect(tabNamedByDocument(tabs, 'Roadmap')).toBeNull();
  });

  it('names only the first of several default tabs', () => {
    const tabs = [tab('a', 'Tab 1'), tab('b', 'Tab 2')];
    expect(tabNamedByDocument(tabs, 'Roadmap')).toEqual({ id: 'a', name: 'Roadmap' });
  });

  it('leaves a tab with a name of its own alone', () => {
    expect(tabNamedByDocument([tab('a', 'Event Storming')], 'Roadmap')).toBeNull();
  });

  it('names no tab for a blank name', () => {
    expect(tabNamedByDocument([tab('a', 'Tab 1')], '   ')).toBeNull();
  });

  it('gives the tab the trimmed name', () => {
    expect(tabNamedByDocument([tab('a', 'Tab 1')], '  Roadmap ')).toEqual({
      id: 'a',
      name: 'Roadmap',
    });
  });

  it('names no tab in a document without tabs', () => {
    expect(tabNamedByDocument([], 'Roadmap')).toBeNull();
  });
});

// docs/specs/034-text-documents/objects.md "Never counted": the first tab is the first listed one.
describe('tabNamedByDocument with drawing tabs', () => {
  it('skips a drawing tab to the first listed tab', () => {
    const tabs = [{ id: 'd', name: 'Tab 9', drawingOf: 'a' }, tab('a', 'Tab 1')];
    expect(tabNamedByDocument(tabs, 'Roadmap')).toEqual({ id: 'a', name: 'Roadmap' });
  });
});
