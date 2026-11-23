// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Special characters": the Insert special characters dialog.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { specialCharacterCatalogueOf } from '@/lib/office/special-character-catalogue';
import { specialCharactersOf, type SpecialCharacters } from '@/lib/office/special-characters';
import { OfficeSpecialCharactersDialog } from './OfficeSpecialCharactersDialog';

const CATALOGUE = specialCharactersOf(
  specialCharacterCatalogueOf({
    version: '18.0.0',
    blocks: `0000..007F; Basic Latin
0300..036F; Combining Diacritical Marks
2000..206F; General Punctuation
2190..21FF; Arrows
2700..27BF; Dingbats
`,
    unicodeData: `0021;EXCLAMATION MARK;Po;0;ON;;;;;N;;;;;
0300;COMBINING GRAVE ACCENT;Mn;230;NSM;;;;;N;;;;;
200D;ZERO WIDTH JOINER;Cf;0;BN;;;;;N;;;;;
2190;LEFTWARDS ARROW;Sm;0;ON;;;;;N;;;;;
2192;RIGHTWARDS ARROW;Sm;0;ON;;;;;N;;;;;
2794;HEAVY WIDE-HEADED RIGHTWARDS ARROW;So;0;ON;;;;;N;;;;;
`,
    nameAliases: '200D;ZWJ;abbreviation\n',
  }),
);

function setup(catalogue: () => Promise<SpecialCharacters> = async () => CATALOGUE) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <OfficeSpecialCharactersDialog onPick={onPick} onClose={onClose} catalogue={catalogue} />,
  );
  return { onPick, onClose, unmount: view.unmount };
}

const cells = () =>
  within(screen.getByRole('group', { name: 'Characters' })).getAllByRole('button');
const names = () => cells().map((cell) => cell.getAttribute('aria-label'));

describe('OfficeSpecialCharactersDialog', () => {
  it('opens on Symbol, Arrows, each cell named, showing a hovered one with its codepoint', async () => {
    const { unmount } = setup();
    expect(screen.getByRole('dialog', { name: 'Insert special characters' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Loading characters…');
    await waitFor(() => expect(names()).toEqual(['Leftwards arrow', 'Rightwards arrow']));
    expect((screen.getByRole('combobox', { name: 'Category' }) as HTMLSelectElement).value).toBe(
      'Symbol',
    );
    expect((screen.getByRole('combobox', { name: 'Block' }) as HTMLSelectElement).value).toBe(
      'Arrows',
    );
    fireEvent.mouseEnter(cells()[1]!);
    const preview = document.querySelector('[data-special-character-preview]')!;
    expect(preview.textContent).toBe('→Rightwards arrowU+2192');
    unmount();
  });

  it('browses a category, starting at its first block, and keeps the pick for the next opening', async () => {
    const first = setup();
    await waitFor(() => expect(cells()).toHaveLength(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Block' }), {
      target: { value: 'Dingbats' },
    });
    expect(names()).toEqual(['Heavy wide-headed rightwards arrow']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'Modifier' },
    });
    expect((screen.getByRole('combobox', { name: 'Block' }) as HTMLSelectElement).value).toBe(
      'Combining Diacritical Marks',
    );
    // A mark sits on a dotted circle.
    expect(cells()[0]!.textContent).toBe('◌\u0300');
    first.unmount();
    setup();
    await waitFor(() => expect(names()).toEqual(['Combining grave accent']));
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'Format & whitespace' },
    });
    // A format character shows its abbreviation.
    expect(cells()[0]!.textContent).toBe('ZWJ');
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'Symbol' },
    });
  });

  it('searches by name words or codepoint, the menus dimmed meanwhile; Escape clears the search', async () => {
    const { onClose } = setup();
    await waitFor(() => expect(cells()).toHaveLength(2));
    const search = screen.getByRole('searchbox', { name: 'Search by name or codepoint' });
    fireEvent.change(search, { target: { value: 'rightwards' } });
    expect(names()).toEqual(['Rightwards arrow', 'Heavy wide-headed rightwards arrow']);
    expect(screen.getByRole('status').textContent).toBe('2 characters');
    expect((screen.getByRole('combobox', { name: 'Category' }) as HTMLSelectElement).disabled).toBe(
      true,
    );
    fireEvent.change(search, { target: { value: 'U+21' } });
    expect(names()).toEqual(['Exclamation mark']);
    fireEvent.change(search, { target: { value: 'nothing like it' } });
    expect(screen.getByText('No characters match')).toBeTruthy();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect((search as HTMLInputElement).value).toBe('');
    expect(onClose).not.toHaveBeenCalled();
    expect(cells()).toHaveLength(2);
  });

  it('inserts a pressed character, staying open and saying so', async () => {
    const { onPick, onClose } = setup();
    await waitFor(() => expect(cells()).toHaveLength(2));
    fireEvent.click(cells()[1]!);
    expect(onPick).toHaveBeenCalledWith('→');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Inserted Rightwards arrow');
  });

  it('is one Tab stop, the arrows, Home and End moving through it', async () => {
    setup();
    await waitFor(() => expect(cells()).toHaveLength(2));
    expect(cells().map((cell) => cell.tabIndex)).toEqual([0, -1]);
    cells()[0]!.focus();
    fireEvent.keyDown(cells()[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cells()[1]);
    expect(cells().map((cell) => cell.tabIndex)).toEqual([-1, 0]);
    fireEvent.keyDown(cells()[1]!, { key: 'Home' });
    expect(document.activeElement).toBe(cells()[0]);
    fireEvent.keyDown(cells()[0]!, { key: 'End' });
    expect(document.activeElement).toBe(cells()[1]);
    fireEvent.keyDown(cells()[1]!, { key: 'a' });
    expect(document.activeElement).toBe(cells()[1]);
  });

  it('says when the characters could not load, and tries again', async () => {
    const catalogue = vi
      .fn<() => Promise<SpecialCharacters>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(CATALOGUE);
    setup(catalogue);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('The characters could not load.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(cells()).toHaveLength(2));
  });
});
