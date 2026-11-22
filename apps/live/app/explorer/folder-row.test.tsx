// @vitest-environment jsdom

// The Explorer's folder list row on the sizing scale (docs/specs/004-interface-design/sizing.md "Heights").

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Folder } from '@/lib/api-client';
import { FolderRow } from './folder-row';

afterEach(cleanup);

const folder = {
  id: 'f1',
  name: 'Projects',
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  teamId: null,
} as Folder;

describe('FolderRow', () => {
  it('draws the row step, its name regular, its menu at the chip step', () => {
    render(
      <ul>
        <FolderRow
          folder={folder}
          renaming={false}
          childCount={0}
          onOpen={vi.fn()}
          onCommitRename={vi.fn()}
          onCancelRename={vi.fn()}
          getActionsForAnchor={vi.fn()}
        />
      </ul>,
    );
    const row = screen.getByRole('listitem');
    expect(row.className).toMatch(/(^|\s)min-h-row(\s|$)/);
    expect(row.className).toMatch(/(^|\s)pointer-coarse:min-h-11(\s|$)/);
    const name = screen.getByText('Projects');
    expect(name.className).toMatch(/(^|\s)text-body(\s|$)/);
    expect(name.className).not.toMatch(/font-(medium|semibold)/);
    expect(screen.getByRole('button', { name: 'Menu for Projects' }).className).toMatch(
      /(^|\s)size-chip(\s|$)/,
    );
  });
});
