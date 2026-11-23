// @vitest-environment jsdom
// docs/specs/034-text-documents/tools.md "Preferences": the typing aids on General, the substitutions on Substitutions,
// nothing changed until OK; pairs added at the top, removed, switched, within their limits.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  DEFAULT_SUBSTITUTIONS,
  SUBSTITUTIONS_OWN_MAX,
  TypingAids,
} from '@/lib/text-document/text-document-typing-aids';
import { readUserPreferences } from '@/lib/user-preferences';
import { track } from '@/lib/telemetry';
import {
  TextDocumentPreferencesDialog,
  TOO_MANY_SUBSTITUTIONS,
  UNKEEPABLE_SUBSTITUTION,
} from './TextDocumentPreferencesDialog';
import { PREFERENCES_ITEM, useTextDocumentPreferences } from './useTextDocumentPreferences';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

function open(aids = TypingAids.defaults()) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<TextDocumentPreferencesDialog open aids={aids} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
}

const ok = () => fireEvent.click(screen.getByRole('button', { name: 'OK' }));
const toSubstitutions = () => fireEvent.click(screen.getByRole('tab', { name: 'Substitutions' }));
const tab = (name: string) => screen.getByRole('tab', { name });
const selected = (name: string) => tab(name).getAttribute('aria-selected') === 'true';
const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name });
const field = (name: string) => screen.getByRole<HTMLInputElement>('textbox', { name });

describe('TextDocumentPreferencesDialog', () => {
  it('switches the typing aids on General, kept with OK', () => {
    const { onSave } = open();
    expect(selected('General')).toBe(true);
    expect(box('Enable Markdown').checked).toBe(false);
    fireEvent.click(box('Use smart quotes'));
    fireEvent.click(box('Enable Markdown'));
    ok();
    expect(onSave.mock.calls[0]![0]).toMatchObject({ smartQuotes: false, markdown: true });
  });

  // objects.md "Emoji": the colon list, on by default.
  it('switches Insert emoji using the colon character', () => {
    const { onSave } = open();
    expect(box('Insert emoji using the colon character').checked).toBe(true);
    fireEvent.click(box('Insert emoji using the colon character'));
    ok();
    expect(onSave.mock.calls[0]![0]).toMatchObject({ emojiColon: false });
  });

  // tools.md "Preferences": Google's General options in Google's order; Smart Reply left out (C3); an option whose
  // feature is not built yet dimmed, "Coming soon" under it.
  it("lists Google's General options in its order, those not built yet dimmed", () => {
    open();
    expect(
      screen
        .getAllByRole('checkbox')
        .map((b) => b.getAttribute('aria-label') ?? b.closest('label')?.textContent),
    ).toEqual([
      'Automatically capitalise words',
      'Use smart quotes',
      'Automatically detect links',
      'Automatically detect lists',
      'Enable Markdown',
      'Automatically correct spelling',
      'Show link details',
      'Insert emoji using the colon character',
    ]);
    for (const name of ['Automatically correct spelling', 'Show link details']) {
      const soon = screen.getByRole<HTMLInputElement>('checkbox', { name: new RegExp(`^${name}`) });
      expect(soon.disabled).toBe(true);
      expect(soon.getAttribute('aria-describedby')).not.toBeNull();
    }
    expect(screen.queryByText(/Smart Reply/)).toBeNull();
  });

  it('moves between the tabs with the arrow keys', () => {
    open();
    fireEvent.keyDown(tab('General'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tab('Substitutions'));
    expect(box('Automatic substitution').checked).toBe(true);
    fireEvent.keyDown(tab('Substitutions'), { key: 'ArrowLeft' });
    expect(selected('General')).toBe(true);
    fireEvent.keyDown(tab('General'), { key: 'Home' });
    expect(selected('General')).toBe(true);
  });

  it('adds a pair at the top with Enter, switches, edits and removes pairs', () => {
    const { onSave } = open();
    toSubstitutions();
    fireEvent.change(field('Replace'), { target: { value: 'brb' } });
    fireEvent.change(field('With'), { target: { value: 'be right back' } });
    fireEvent.keyDown(field('With'), { key: 'Enter' });
    const list = screen.getByRole('list', { name: 'Substitutions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(DEFAULT_SUBSTITUTIONS.length + 1);
    expect(within(list).getAllByRole<HTMLInputElement>('textbox')[0]!.value).toBe('brb');
    fireEvent.click(box('Use substitution (c)'));
    fireEvent.change(field('With for (r)'), { target: { value: '(R)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove substitution 1/2' }));
    fireEvent.change(field('With for --'), { target: { value: '' } });
    fireEvent.change(field('Replace ---'), { target: { value: '----' } });
    ok();
    const saved = onSave.mock.calls[0]![0] as TypingAids;
    expect(saved.pairs[0]).toEqual({ replace: 'brb', with: 'be right back', on: true });
    expect(saved.pairs.find((p) => p.replace === '(c)')!.on).toBe(false);
    expect(saved.pairs.find((p) => p.replace === '(r)')!.with).toBe('(R)');
    expect(saved.pairs.find((p) => p.replace === '----')!.with).toBe('—');
    // Removed, and a pair left with an empty With is not kept.
    expect(saved.pairs.some((p) => p.replace === '1/2' || p.replace === '--')).toBe(false);
  });

  it('refuses a pair it may not keep, and one past the limit', () => {
    const own = Array.from({ length: SUBSTITUTIONS_OWN_MAX }, (_, i) => ({
      replace: `k${i}`,
      with: 'v',
      on: true,
    }));
    open({ ...TypingAids.defaults(), pairs: own });
    toSubstitutions();
    fireEvent.change(field('Replace'), { target: { value: 'a b' } });
    fireEvent.change(field('With'), { target: { value: 'x' } });
    fireEvent.blur(field('With'));
    expect(screen.getByRole('alert').textContent).toBe(UNKEEPABLE_SUBSTITUTION);
    fireEvent.change(field('Replace'), { target: { value: 'ab' } });
    fireEvent.keyDown(field('With'), { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe(TOO_MANY_SUBSTITUTIONS);
    // Empty fields add nothing.
    fireEvent.change(field('Replace'), { target: { value: '' } });
    fireEvent.change(field('With'), { target: { value: '' } });
    fireEvent.keyDown(field('With'), { key: 'a' });
    fireEvent.blur(field('With'));
    expect(screen.getAllByRole('listitem')).toHaveLength(SUBSTITUTIONS_OWN_MAX);
  });

  it('turns every pair off with Automatic substitution', () => {
    const { onSave } = open();
    toSubstitutions();
    fireEvent.click(box('Automatic substitution'));
    expect(box('Use substitution (c)').disabled).toBe(true);
    ok();
    expect(onSave.mock.calls[0]![0]).toMatchObject({ substitution: false });
  });
});

function Harness() {
  const preferences = useTextDocumentPreferences(null, null);
  return (
    <div>
      <button type="button" onClick={() => preferences.actions[PREFERENCES_ITEM]!.run()}>
        Open
      </button>
      <output>{String(preferences.read().links)}</output>
      {preferences.dialog}
    </div>
  );
}

describe('useTextDocumentPreferences', () => {
  it('opens on the aids as they are, keeps them with OK, and changes nothing with Cancel', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(box('Automatically detect links'));
    ok();
    expect(readUserPreferences().textDocumentTypingAids).toEqual({ off: ['links'] });
    expect(track).toHaveBeenCalledWith('UI', 'Changed', 'TextDocumentPreferences');
    // OK with nothing changed counts nothing; a change elsewhere is read again.
    vi.mocked(track).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    ok();
    expect(track).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('livedoc:preferences-changed'));
    expect(screen.getByRole('status').textContent).toBe('false');
  });
});
