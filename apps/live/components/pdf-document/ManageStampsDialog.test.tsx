// @vitest-environment jsdom
// docs/specs/035-pdf-documents/custom-stamps.md "Managing them": their stamps a category each; names kept once left;
// moved by the Category list or a new category asked in place; Delete asks in place first; empty, Create offered.
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import type { CustomStampRecord } from '@livedoc/pdf-documents';

const manage = vi.hoisted(() => ({
  renameCustomStamp: vi.fn(async () => ({ ok: true })),
  moveCustomStamp: vi.fn(async () => ({ ok: true })),
  deleteCustomStamp: vi.fn(async () => ({ ok: true })),
  renameCustomStampCategory: vi.fn(async () => ({ ok: true })),
  deleteCustomStampCategory: vi.fn(async () => ({
    ok: false,
    problem: 'That change couldn’t be made. Try again.',
  })),
}));
vi.mock('@/lib/pdf-document/manage-custom-stamps', () => manage);

const { ManageStampsDialog } = await import('./ManageStampsDialog');

const stamp = (id: string, name: string, category: string, createdAt: number) =>
  ({
    id,
    name,
    category,
    picture: { key: id.padEnd(64, '0') as BlobKey, type: 'png', width: 8, height: 4 },
    natural: { width: 6, height: 3 },
    createdAt,
    updatedAt: createdAt,
  }) as CustomStampRecord;
const PAID = stamp('a', 'Paid', 'Accounts', 3);
const DUE = stamp('b', 'Due', 'Accounts', 2);
const VOID = stamp('c', 'Void', 'Bills', 1);

const drawn = (stamps: CustomStampRecord[] = [PAID, DUE, VOID], customs = true) => {
  const props = { onClose: vi.fn(), onCreate: vi.fn() };
  const identity = {
    identity: { title: 'Chief Engineer' },
    keep: vi.fn((): string | null => null),
  };
  render(
    <ManageStampsDialog
      open
      customs={customs}
      identity={identity}
      ownerId="ada"
      stamps={stamps}
      pictures={new Map()}
      {...props}
    />,
  );
  return { ...props, identity };
};

beforeEach(() => vi.clearAllMocks());

describe('Manage stamps’ Identity', () => {
  it('comes first, and keeps a field once left', () => {
    const { identity } = drawn();
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'Manage stamps',
      'Identity',
      'Custom stamps',
    ]);
    const organisation = screen.getByLabelText<HTMLInputElement>('Organisation');
    fireEvent.change(organisation, { target: { value: 'Analytical Ltd' } });
    fireEvent.blur(organisation);
    expect(identity.keep).toHaveBeenCalledWith('organisation', 'Analytical Ltd');
  });

  it('says a field that could not be kept', () => {
    const { identity } = drawn();
    identity.keep.mockReturnValue('Your identity couldn’t be saved.');
    const unit = screen.getByLabelText<HTMLInputElement>('Unit');
    fireEvent.change(unit, { target: { value: 'Engines' } });
    fireEvent.blur(unit);
    expect(screen.getByRole('alert').textContent).toBe('Your identity couldn’t be saved.');
  });

  it('is all there is without file storage: no custom stamps, nothing to create', () => {
    drawn([PAID], false);
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('Chief Engineer');
    expect(screen.queryByText('Custom stamps')).toBeNull();
    expect(screen.queryByLabelText('Name of Paid')).toBeNull();
    expect(screen.queryByText('Create custom stamp…')).toBeNull();
  });
});

describe('Manage stamps', () => {
  it('lists their stamps a category each, in the grid’s order', () => {
    drawn();
    const sections = screen
      .getAllByRole('region')
      .map((s) => s.getAttribute('aria-label') ?? s.querySelector('h3')?.textContent);
    expect(sections).toEqual(['Identity', 'Accounts', 'Bills']);
    expect(screen.getByLabelText('Name of Paid')).toHaveProperty('value', 'Paid');
  });

  it('keeps a name once left, and puts back an empty one', () => {
    drawn();
    const name = screen.getByLabelText<HTMLInputElement>('Name of Paid');
    fireEvent.change(name, { target: { value: 'Settled' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.blur(name);
    expect(manage.renameCustomStamp).toHaveBeenCalledWith('ada', PAID, 'Settled');
    fireEvent.change(name, { target: { value: '  ' } });
    fireEvent.blur(name);
    expect(name.value).toBe('Paid');
    expect(manage.renameCustomStamp).toHaveBeenCalledOnce();
  });

  it('moves a stamp by its Category list, or to a new category asked in place', () => {
    drawn();
    fireEvent.change(screen.getByLabelText('Category of Paid'), { target: { value: 'Bills' } });
    expect(manage.moveCustomStamp).toHaveBeenCalledWith('ada', PAID, 'Bills');
    fireEvent.change(screen.getByLabelText('Category of Due'), { target: { value: '\u0000new' } });
    const fresh = screen.getByLabelText('New category for Due');
    expect(document.activeElement).toBe(fresh);
    fireEvent.change(fresh, { target: { value: 'Receipts' } });
    fireEvent.blur(fresh);
    expect(manage.moveCustomStamp).toHaveBeenLastCalledWith('ada', DUE, 'Receipts');
  });

  it('renames a category from its field', () => {
    drawn();
    const field = screen.getByLabelText('Category Bills');
    fireEvent.change(field, { target: { value: 'Ledger' } });
    fireEvent.blur(field);
    expect(manage.renameCustomStampCategory).toHaveBeenCalledWith('ada', 'Bills', 'Ledger');
  });

  it('asks before deleting a stamp, and Cancel keeps it', () => {
    drawn();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Paid' }));
    const asked = screen.getByRole('group', { name: 'Delete Paid? Stamps already placed stay.' });
    fireEvent.click(asked.querySelector('button:last-child')!);
    expect(manage.deleteCustomStamp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Paid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(manage.deleteCustomStamp).toHaveBeenCalledWith('ada', PAID);
  });

  it('asks before deleting a category with its stamps, and says a change that failed', async () => {
    drawn();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete category' })[0]!);
    expect(screen.getByText('Delete Accounts and its 2 stamps?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(manage.deleteCustomStampCategory).toHaveBeenCalledWith('ada', 'Accounts', 2);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That change couldn’t be made. Try again.',
    );
  });

  it('offers Create custom stamp… with none', () => {
    const { onCreate } = drawn([]);
    expect(screen.getByText('You have no custom stamps yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create custom stamp…' }));
    expect(onCreate).toHaveBeenCalled();
  });
});
