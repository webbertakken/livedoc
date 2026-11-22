// @vitest-environment jsdom

// A list row of a document saved only in this browser carries the This Browser pill beside its
// name (docs/specs/006-document/offline-mode.md#this-browser-pill).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentRow } from './explorer-route-document-row';
import type { DocumentEntryProps } from './explorer-view-props';
import type { PaneDocument } from './views';

afterEach(cleanup);

const entry = (ownerId: string): DocumentEntryProps => ({
  // Empty, so the thumbnail draws its placeholder rather than fetching.
  document: {
    id: 'd1',
    name: 'Workshop notes',
    ownerId,
    savedAt: 1,
    folderId: null,
    empty: true,
  } as PaneDocument,
  ownerId: 'me',
  renaming: false,
  onStartRename: vi.fn(),
  onCommitRename: vi.fn(),
  onCancelRename: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
  onMove: vi.fn(),
});

describe('DocumentRow', () => {
  it('shows the This Browser pill for a document in this browser', () => {
    render(<DocumentRow {...entry('offline')} />);
    expect(screen.getByRole('link', { name: /This Browser/ })).toBeTruthy();
  });

  it('shows no pill for a cloud document', () => {
    render(<DocumentRow {...entry('me')} />);
    expect(screen.queryByRole('link', { name: /This Browser/ })).toBeNull();
  });
});

// A list row is the sizing scale's row (docs/specs/004-interface-design/sizing.md "Heights"): 28 px, 44 px on touch,
// its name regular, its thumbnail and its ⋯ at the chip step.
describe('DocumentRow on the sizing scale', () => {
  it('draws the row step, its name regular, its picture and menu at the chip step', () => {
    render(<DocumentRow {...entry('me')} />);
    const row = screen.getByRole('listitem');
    expect(row.className).toMatch(/(^|\s)min-h-row(\s|$)/);
    expect(row.className).toMatch(/(^|\s)pointer-coarse:min-h-11(\s|$)/);
    const name = screen.getByRole('link', { name: 'Workshop notes' });
    expect(name.className).toMatch(/(^|\s)text-body(\s|$)/);
    expect(name.className).not.toMatch(/font-(medium|semibold)/);
    expect(row.querySelector('.h-chip')).not.toBeNull();
    const menu = screen.getByRole('button', { name: 'Menu for Workshop notes' });
    expect(menu.className).toMatch(/(^|\s)size-chip(\s|$)/);
  });
});
