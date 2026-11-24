// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ITEM_TYPES, type Item, type ItemTypeDef } from '@livedoc/items';
import { ItemPanel } from './ItemPanel';

// docs/specs/004-interface-design/sizing.md: a card's panel is chrome on the sizing scale: its title the dialog's step,
// and nothing in it heavy or in tracked capitals.

afterEach(cleanup);

const PERSON = { id: 'p', name: 'Sam', color: '#2563eb' };
const card = (type = 'task'): Item => ({
  id: 'item-one',
  type,
  key: 1,
  rank: 'i',
  fields: {
    title: 'A card',
    comments: {
      comments: [
        {
          id: 'c1',
          text: 'First thoughts',
          createdAt: 0,
          authorName: 'Sam',
          authorColor: '#2563eb',
        },
      ],
      resolved: false,
    },
  },
  rev: 1,
  createdAt: 0,
  updatedAt: 0,
  createdBy: PERSON,
  updatedBy: PERSON,
});

function panel(item: Item, types: readonly ItemTypeDef[] = ITEM_TYPES, withComments = true) {
  const noop = vi.fn();
  render(
    <ItemPanel
      item={item}
      types={types}
      statuses={[]}
      people={[]}
      labels={[]}
      canEdit
      onSave={noop}
      onPatch={noop}
      onType={noop}
      onOpenItem={noop}
      onTrash={noop}
      onDuplicate={noop}
      onFlag={noop}
      onArchive={noop}
      onClose={noop}
      trail={[item]}
      statusNames={new Map()}
      {...(withComments
        ? { comments: { canComment: true, selfId: 'owner-me', onComment: noop } }
        : {})}
    />,
  );
}

describe('a card’s panel on the sizing scale', () => {
  it('titles a card at the dialog step, with nothing heavy or in tracked capitals', () => {
    panel(card());
    // An avatar's initials are drawn art, sized by the disc (sizing.md "Gaps, padding and radii": an avatar is layout).
    const dialog = document.body.cloneNode(true) as HTMLElement;
    for (const avatar of dialog.querySelectorAll('[class*="--identity"]')) avatar.remove();
    expect(dialog.innerHTML).not.toMatch(/\buppercase\b|tracking-|font-semibold|font-bold/);
    expect(screen.getByPlaceholderText('Title').className).toContain('text-dialog-title');
  });
});
