// @vitest-environment jsdom

// The List and Card views on the sizing scale (docs/specs/004-interface-design/sizing.md "Heights" and "Type"):
// rows and column labels at the row step, names regular, labels at the supporting step in their own case.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedWithItem } from '@/lib/api-client';
import { CardView } from './CardView';
import { paneDocument, projectsFolder, viewProps } from './explorer-view.fixture';
import { ListView, SharedList, SkeletonRows } from './views';

beforeEach(() => {
  // A row's snapshot prefetch watches for the viewport; jsdom has none.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const has = (className: string, token: string) => className.split(/\s+/).includes(token);

const shared = {
  id: 's1',
  name: 'Their plan',
  savedAt: 1,
  role: 'edit',
  shareCode: 'code',
  tabId: null,
  ownerName: 'Ann',
  ownerColor: null,
  empty: true,
} as SharedWithItem;

describe('the List view on the sizing scale', () => {
  it('labels its columns at the row step, the supporting step, in their own case', () => {
    render(<ListView {...viewProps([paneDocument('Plan')])} />);
    const labels = screen.getByText('Name').parentElement!;
    expect(has(labels.className, 'min-h-row')).toBe(true);
    expect(has(labels.className, 'text-supporting')).toBe(true);
    expect(labels.className).not.toMatch(/uppercase|tracking-|font-semibold/);
  });

  it('draws a shared document as a list row: the row step, its name regular', () => {
    render(<SharedList shared={[shared]} ownerId="me" onDismiss={vi.fn()} />);
    const labels = screen.getByText('Role').parentElement!;
    expect(has(labels.className, 'text-supporting')).toBe(true);
    expect(labels.className).not.toMatch(/uppercase|tracking-/);
    const row = screen.getByRole('listitem');
    expect(has(row.className, 'min-h-row')).toBe(true);
    expect(has(row.className, 'pointer-coarse:min-h-11')).toBe(true);
    const name = within(row).getByRole('link');
    expect(has(name.className, 'text-body')).toBe(true);
    expect(name.className).not.toMatch(/font-(medium|semibold)/);
    const dismiss = within(row).getAllByRole('button').at(-1)!;
    expect(has(dismiss.className, 'size-chip')).toBe(true);
  });

  it('holds its loading rows at the row step', () => {
    const { container } = render(<SkeletonRows count={2} />);
    for (const row of container.querySelectorAll('li')) {
      expect(has(row.className, 'min-h-row')).toBe(true);
    }
  });
});

describe('the Card view on the sizing scale', () => {
  it('names a folder and a document card at the body step, regular', () => {
    render(<CardView {...viewProps([paneDocument('Plan')], [projectsFolder])} />);
    for (const name of ['Projects', 'Plan']) {
      const named = screen.getAllByText(name).at(-1)!.closest('a, button')!;
      expect(has(named.className, 'text-body')).toBe(true);
      expect(named.className).not.toMatch(/font-(medium|semibold)/);
    }
  });
});
