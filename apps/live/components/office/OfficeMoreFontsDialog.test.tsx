// @vitest-environment jsdom
// docs/specs/004-interface-design/fonts.md "More fonts": the Fonts dialog.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GoogleFont } from '@/lib/document-fonts/google-font-catalogue';
import { createGoogleFontLoads } from '@/lib/document-fonts/google-font-loading';
import { MyFontsColumn, OfficeMoreFontsDialog } from './OfficeMoreFontsDialog';

const google = (
  name: string,
  category: GoogleFont['category'],
  popularity: number,
): GoogleFont => ({
  name,
  category,
  popularity,
  trending: popularity,
  dateAdded: '2020-01-01',
  axes: '',
});

const GOOGLE = [
  google('Rubik', 'Sans Serif', 1),
  google('Lora', 'Serif', 2),
  google('Pacifico', 'Handwriting', 3),
  google('Space Mono', 'Monospace', 4),
];

afterEach(() => {
  document.head.innerHTML = '';
});

async function setup({
  initial = ['Arial', 'Lora'],
  catalogue = async () => GOOGLE,
}: {
  initial?: string[];
  catalogue?: () => Promise<readonly GoogleFont[]>;
} = {}) {
  const fetchCss = vi.fn(async () => new Response("@font-face { font-family: 'Rubik'; }"));
  const loads = createGoogleFontLoads(fetchCss);
  const onClose = vi.fn();
  const onApply = vi.fn();
  render(
    <OfficeMoreFontsDialog
      initial={initial}
      onClose={onClose}
      onApply={onApply}
      catalogue={catalogue}
      loads={loads}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: 'Fonts' });
  return { dialog, onClose, onApply, fetchCss };
}

const optionNames = () =>
  within(screen.getByRole('listbox', { name: 'Fonts' }))
    .getAllByRole('option')
    .map((o) => o.textContent);

describe('OfficeMoreFontsDialog', () => {
  it('lists the catalogue by popularity, the named families first, My fonts checked', async () => {
    await setup();
    await screen.findByRole('listbox', { name: 'Fonts' });
    expect(optionNames().slice(0, 2)).toEqual(['Arial', 'Comic Sans MS']);
    expect(optionNames().slice(-4)).toEqual(['Rubik', 'Lora', 'Pacifico', 'Space Mono']);
    const lora = screen.getByRole('option', { name: 'Lora' });
    expect(lora.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: 'Rubik' }).getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(lora.getAttribute('aria-setsize')).toBe(String(optionNames().length));
    expect(screen.getByRole('status').textContent).toBe(`${optionNames().length} fonts`);
  });

  it('searches, shows a category and sorts', async () => {
    await setup();
    await screen.findByRole('listbox');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fonts' }), {
      target: { value: 'mono' },
    });
    expect(optionNames()).toEqual(['Space Mono']);
    expect(screen.getByRole('status').textContent).toBe('1 font');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
      target: { value: 'Serif' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
      target: { value: 'Alphabetical' },
    });
    expect(optionNames()).toEqual(['Georgia', 'Lora', 'Times New Roman']);
  });

  it('says when nothing matches', async () => {
    await setup();
    await screen.findByRole('listbox');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing like it' } });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('No fonts match')).toBeTruthy();
  });

  it('clears a search with Escape and stays open', async () => {
    const { onClose } = await setup();
    await screen.findByRole('listbox');
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'mono' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect((search as HTMLInputElement).value).toBe('');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('adds a family by a press and takes one out by its ×, then keeps them with OK', async () => {
    const { onApply } = await setup();
    await screen.findByRole('listbox');
    fireEvent.click(screen.getByRole('option', { name: 'Rubik' }));
    const myFonts = screen.getByRole('region', { name: 'My fonts' });
    expect(
      within(myFonts)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Arial', 'Lora', 'Rubik']);
    fireEvent.click(within(myFonts).getByRole('button', { name: 'Remove Arial' }));
    expect(document.activeElement).toBe(
      within(myFonts).getByRole('button', { name: 'Remove Lora' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onApply).toHaveBeenCalledWith(['Lora', 'Rubik']);
  });

  it('moves and chooses from the keyboard, Enter never pressing OK', async () => {
    // More families than a page of rows holds, so a page's move stops short of either end.
    const catalogue = async () => [
      ...GOOGLE,
      google('Inter', 'Sans Serif', 5),
      google('Roboto', 'Sans Serif', 6),
    ];
    const { onApply } = await setup({ initial: ['Lora'], catalogue });
    const list = await screen.findByRole('listbox');
    const active = () => document.getElementById(list.getAttribute('aria-activedescendant')!)!;
    expect(active().textContent).toBe('Arial');
    fireEvent.keyDown(list, { key: 'End' });
    expect(active().textContent).toBe('Roboto');
    fireEvent.keyDown(list, { key: 'PageUp' });
    expect(active().textContent).toBe('Comic Sans MS');
    fireEvent.keyDown(list, { key: 'PageUp' });
    expect(active().textContent).toBe('Arial');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    fireEvent.keyDown(list, { key: 'PageDown' });
    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(active().textContent).toBe('Comic Sans MS');
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(active().getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: ' ' });
    expect(active().getAttribute('aria-selected')).toBe('false');
    fireEvent.keyDown(list, { key: 'a' });
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.focus(list);
    expect(active().className).toContain('ring-2');
    fireEvent.blur(list);
    expect(active().className).not.toContain('ring-2');
  });

  it('will not keep an empty My fonts, and sends focus to the search', async () => {
    const { onApply } = await setup({ initial: ['Lora'] });
    await screen.findByRole('listbox');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Lora' }));
    expect(screen.getByText('Keep at least one font')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    const ok = screen.getByRole('button', { name: 'OK' });
    expect(ok.hasAttribute('disabled')).toBe(true);
    fireEvent.click(ok);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('keeps nothing on Cancel', async () => {
    const { onClose, onApply } = await setup();
    await screen.findByRole('listbox');
    fireEvent.click(screen.getByRole('option', { name: 'Rubik' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('previews the Google families in view once the scroll rests, and those of My fonts', async () => {
    const { fetchCss } = await setup({ initial: ['Lora', 'Space Mono'] });
    await screen.findByRole('listbox');
    // My fonts' own: Space Mono (Lora is LiveDoc's, never fetched).
    expect(String(fetchCss.mock.calls[0]![0 as never])).toContain('family=Space+Mono&text=');
    await waitFor(() => expect(fetchCss).toHaveBeenCalledTimes(2));
    const inView = String(fetchCss.mock.calls[1]![0 as never]);
    expect(inView).toContain('family=Rubik');
    expect(inView).not.toContain('Space+Mono');
    expect(inView).not.toContain('Lora');
    expect(inView).not.toContain('Pacifico');
    const rubik = screen
      .getByRole('option', { name: 'Rubik' })
      .querySelector('span[style]') as HTMLElement;
    expect(rubik.style.fontFamily).toContain('LiveDoc preview Rubik');
  });

  it('says when the catalogue could not load, and tries again', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    let fail = true;
    const catalogue = vi.fn(async () => {
      if (fail) throw new Error('chunk');
      return GOOGLE;
    });
    await setup({ catalogue });
    expect(screen.getByText('Loading fonts')).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toBe('Fonts could not load.');
    expect(log.mock.calls.flat().join(' ')).toContain(
      '[fonts] google catalogue not loaded Error: chunk',
    );
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('listbox');
    expect(catalogue).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it('ignores a catalogue that arrives after it closed', async () => {
    let resolve: (fonts: readonly GoogleFont[]) => void = () => {};
    let reject: (error: Error) => void = () => {};
    const { unmount } = render(
      <OfficeMoreFontsDialog
        initial={['Lora']}
        onClose={() => {}}
        onApply={() => {}}
        catalogue={() => new Promise((ok) => (resolve = ok))}
        loads={createGoogleFontLoads(vi.fn())}
      />,
    );
    unmount();
    resolve(GOOGLE);
    const second = render(
      <OfficeMoreFontsDialog
        initial={['Lora']}
        onClose={() => {}}
        onApply={() => {}}
        catalogue={() => new Promise((_, no) => (reject = no))}
        loads={createGoogleFontLoads(vi.fn())}
      />,
    );
    second.unmount();
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    reject(new Error('late'));
    await waitFor(() => expect(log).toHaveBeenCalled());
    log.mockRestore();
  });
});

// fonts.md "More fonts": focus after a removal follows the list it was made against, whatever renders come between
// (a render left over from the catalogue or a preview loading runs its effects first).
describe('MyFontsColumn', () => {
  it('sends focus on only once the removal has changed the list, however often it draws before', () => {
    const onRemove = vi.fn();
    const draw = (fonts: readonly string[], onEmptied: () => void) => (
      <div>
        <input aria-label="Search" />
        <MyFontsColumn fonts={fonts} onRemove={onRemove} onEmptied={onEmptied} />
      </div>
    );
    const search = () => screen.getByRole('textbox', { name: 'Search' });
    const { rerender } = render(draw(['Lora'], () => search().focus()));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Lora' }));
    // A render that changes nothing the column shows: the list is as it was.
    rerender(draw(['Lora'], () => search().focus()));
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Remove Lora' }));
    // The removal lands: the list is empty, so focus goes on to the search.
    rerender(draw([], () => search().focus()));
    expect(document.activeElement).toBe(search());
  });

  it("sends focus to the row that took the removed one's place", () => {
    const draw = (fonts: readonly string[]) => (
      <MyFontsColumn fonts={fonts} onRemove={() => {}} onEmptied={() => {}} />
    );
    const { rerender } = render(draw(['Arial', 'Lora', 'Rubik']));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Lora' }));
    rerender(draw(['Arial', 'Lora', 'Rubik']));
    rerender(draw(['Arial', 'Rubik']));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Rubik' }));
  });
});
