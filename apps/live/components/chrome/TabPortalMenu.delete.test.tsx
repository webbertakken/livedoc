// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { PortalMenu } from './TabPortalMenu';

vi.mock('@/lib/clamp-to-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/clamp-to-viewport')>()),
  clampToViewport: () => ({ x: 0, y: 0 }),
}));

// Delete in the tab menu (docs/specs/007-editor/live-app.md "Destructive actions"): asks nothing, since undo brings
// the tab back, except when deleting does what an undo cannot take back (deleteTabWarning).

type Props = ComponentProps<typeof PortalMenu>;

function props(over: Partial<Props> = {}): Props {
  const noop = () => {};
  return {
    onClose: noop,
    onRename: noop,
    onDuplicate: noop,
    onClearContent: noop,
    onImport: noop,
    onExport: noop,
    onCopyTo: noop,
    onToggleLock: noop,
    locked: false,
    selfId: 'me',
    otherDocuments: [],
    folderNames: [],
    currentFolder: null,
    onMoveToFolder: noop,
    onRemoveFromFolder: noop,
    onDelete: noop,
    deletion: { kind: 'tab' },
    canClearContent: true,
    ...over,
  };
}

afterEach(() => cleanup());

describe('Delete in the tab menu', () => {
  const open = (over: Partial<Props>) => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    render(<PortalMenu {...props({ anchor, ...over })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  };

  it('deletes at once, asking nothing', () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    open({ onDelete, onClose });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Delete this tab?' })).toBeNull();
  });

  it('asks first, with the warning, when deleting does what an undo cannot take back', () => {
    const onDelete = vi.fn();
    open({
      onDelete,
      deletion: {
        kind: 'tab',
        confirm: {
          message: 'Delete this tab?',
          warning: 'A form sends its responses here.',
          confirmLabel: 'Delete',
        },
      },
    });
    expect(onDelete).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Delete this tab?' });
    expect(dialog.textContent).toContain('A form sends its responses here.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

// A document's last tab (docs/specs/006-document/document-structure.md "The last tab").
describe('Delete on the last tab', () => {
  const openMenu = (over: Partial<Props>) => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    render(<PortalMenu {...props({ anchor, ...over })} />);
    return screen.getByRole('button', { name: 'Delete' });
  };

  it('deletes an empty last tab, with its document, asking nothing', () => {
    const onDelete = vi.fn();
    fireEvent.click(openMenu({ onDelete, deletion: { kind: 'document' } }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Delete this document?' })).toBeNull();
  });

  it('asks first on a last tab holding content; Cancel keeps it, Delete Document deletes it', () => {
    const onDelete = vi.fn();
    const deletion = {
      kind: 'document' as const,
      confirm: {
        message: 'Delete this document?',
        warning: 'This is its only tab, so the whole document goes to the Trash.',
        confirmLabel: 'Delete Document',
      },
    };
    fireEvent.click(openMenu({ onDelete, deletion }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this document?' });
    expect(dialog.textContent).toContain('the whole document goes to the Trash');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Delete this document?' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete this document?' })).getByRole('button', {
        name: 'Delete Document',
      }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('is greyed out, saying why, for a session that may not delete the document', () => {
    const onDelete = vi.fn();
    const button = openMenu({
      onDelete,
      deletion: {
        kind: 'blocked',
        reason: 'This is the only tab, and you cannot delete the document.',
      },
    });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
