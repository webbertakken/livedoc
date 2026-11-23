// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Emoji": the Insert emoji dialog.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { emojisOf, type Emojis } from '@/lib/office/emoji';
import { readEmojiTone, readRecentEmoji } from '@/lib/office/emoji-preferences';
import { OfficeEmojiDialog } from './OfficeEmojiDialog';

const CATALOGUE = emojisOf({
  version: '18.0.0',
  emoji: [
    [0, '😀', 'grinning face', 'face grin', 'grinning_face grinning'],
    [1, '👋', 'waving hand', 'hello wave', 'waving_hand wave', ['👋🏻', '👋🏼', '👋🏽', '👋🏾', '👋🏿']],
    [1, '👍', 'thumbs up', '+1 hand', 'thumbs_up +1'],
    [8, '🇳🇱', 'flag: Netherlands', 'NL flag', 'flag_netherlands'],
  ],
});

beforeEach(() => localStorage.clear());

function setup(catalogue: () => Promise<Emojis> = async () => CATALOGUE) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <OfficeEmojiDialog onPick={onPick} onClose={onClose} catalogue={catalogue} />,
  );
  return { onPick, onClose, unmount: view.unmount };
}

const cells = () => within(screen.getByRole('group', { name: 'Emoji' })).getAllByRole('button');
const shown = () => cells().map((cell) => cell.textContent);
const tab = (name: string) => screen.getByRole('tab', { name });

describe('OfficeEmojiDialog', () => {
  it('opens on Smileys & emotion with nothing recent, each cell named, the hovered one shown', async () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Insert emoji' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Loading emoji…');
    await waitFor(() => expect(shown()).toEqual(['😀']));
    expect(tab('Smileys & emotion').getAttribute('aria-selected')).toBe('true');
    expect(cells()[0]!.getAttribute('aria-label')).toBe('Grinning face');
    fireEvent.mouseEnter(cells()[0]!);
    expect(document.querySelector('[data-emoji-preview]')!.textContent).toBe(
      '😀Grinning face:grinning_face:',
    );
    fireEvent.click(tab('Recently used'));
    expect(screen.getByText('Emoji you insert show here')).toBeTruthy();
  });

  it('shows and inserts emoji in the skin tone chosen, and keeps the tone', async () => {
    const { onPick } = setup();
    await waitFor(() => expect(cells()).toHaveLength(1));
    fireEvent.click(tab('People & body'));
    expect(shown()).toEqual(['👋', '👍']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Skin tone' }), {
      target: { value: 'Medium' },
    });
    expect(shown()).toEqual(['👋🏽', '👍']);
    expect(readEmojiTone()).toBe('medium');
    fireEvent.click(cells()[0]!);
    expect(onPick).toHaveBeenCalledWith('👋🏽');
    expect(screen.getByRole('status').textContent).toBe('Inserted Waving hand');
  });

  it('opens on Recently used once something was inserted, newest first, each as inserted', async () => {
    const first = setup();
    await waitFor(() => expect(cells()).toHaveLength(1));
    fireEvent.click(cells()[0]!);
    fireEvent.click(tab('Flags'));
    fireEvent.click(cells()[0]!);
    expect(readRecentEmoji()).toEqual(['🇳🇱', '😀']);
    fireEvent.click(tab('Recently used'));
    expect(shown()).toEqual(['🇳🇱', '😀']);
    first.unmount();
    setup();
    await waitFor(() => expect(shown()).toEqual(['🇳🇱', '😀']));
    expect(tab('Recently used').getAttribute('aria-selected')).toBe('true');
  });

  it('searches names, tags and shortcodes, the tabs dimmed meanwhile', async () => {
    setup();
    await waitFor(() => expect(cells()).toHaveLength(1));
    const search = screen.getByRole('searchbox', { name: 'Search emoji' });
    fireEvent.change(search, { target: { value: 'hand' } });
    expect(shown()).toEqual(['👋', '👍']);
    expect(tab('Flags').getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(search, { target: { value: 'nl' } });
    expect(shown()).toEqual(['🇳🇱']);
    fireEvent.change(search, { target: { value: 'nothing like it' } });
    expect(screen.getByText('No emoji match')).toBeTruthy();
  });

  it('says when the emoji could not load, and tries again', async () => {
    const catalogue = vi
      .fn<() => Promise<Emojis>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(CATALOGUE);
    setup(catalogue);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('The emoji could not load.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(cells()).toHaveLength(1));
  });
});
