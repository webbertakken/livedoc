import { describe, expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({ home: 0 }));
vi.mock('@/components/panels/home/HomePane', () => {
  loads.home += 1;
  return { HomePane: () => null };
});

import { fetchPaneCode, loadHomePane, paneCodeFor } from './explorer-pane-code';

// docs/specs/016-platform/web-performance.md "A pane's code is asked for with its section".
describe('the Explorer’s pane code', () => {
  it('names the pane each section draws, so its code can be asked for ahead of its data', () => {
    expect(paneCodeFor('home')).toBe(loadHomePane);
    for (const kind of [
      'timeline',
      'inbox',
      'invites',
      'team',
      'gallery',
      'themes',
      'shape-libraries',
      'trash',
      'tags',
    ]) {
      expect(paneCodeFor(kind), kind).toBeTypeOf('function');
    }
  });

  it('has nothing to fetch for a section the shared code draws', () => {
    for (const kind of ['recent', 'all', 'folder', 'search', 'favourites', 'offline', 'shared']) {
      expect(paneCodeFor(kind), kind).toBeUndefined();
    }
    expect(() => fetchPaneCode('recent')).not.toThrow();
  });

  it('fetches a section’s pane when asked', async () => {
    fetchPaneCode('home');
    await loadHomePane();

    expect(loads.home).toBe(1);
  });
});
