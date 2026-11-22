// @vitest-environment jsdom
// The file chooser always settles: the chosen file, or null when it is left, by its own `cancel` or, in a browser
// that fires none, by the window taking focus again with no choice after it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PICK_CANCEL_GRACE_MS, pickFile } from './pick-file';

let input: HTMLInputElement | null = null;

// The next file input the picker makes, which `act` then does something with once it is clicked.
function onChooser(act: (el: HTMLInputElement) => void) {
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = create(tag);
    if (tag === 'input') {
      input = el as HTMLInputElement;
      el.click = () => act(input!);
    }
    return el;
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  input = null;
});

describe('pickFile', () => {
  it('opens a chooser narrowed to what the caller takes, and answers the file chosen', async () => {
    const file = new File(['%PDF-'], 'a.pdf');
    onChooser((el) => {
      Object.defineProperty(el, 'files', { value: [file] });
      el.dispatchEvent(new Event('change'));
    });
    await expect(pickFile('.pdf')).resolves.toBe(file);
    expect(input?.type).toBe('file');
    expect(input?.accept).toBe('.pdf');
  });

  it('answers null when the chooser says it was left', async () => {
    onChooser((el) => el.dispatchEvent(new Event('cancel')));
    await expect(pickFile('.pdf')).resolves.toBeNull();
  });

  it('answers null when the window takes focus again and no file follows', async () => {
    onChooser(() => {});
    const choosing = pickFile('.pdf');
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(PICK_CANCEL_GRACE_MS);
    await expect(choosing).resolves.toBeNull();
  });

  it('answers the file when it follows the focus within the grace', async () => {
    const file = new File(['%PDF-'], 'a.pdf');
    onChooser(() => {});
    const choosing = pickFile('.pdf');
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(PICK_CANCEL_GRACE_MS - 1);
    Object.defineProperty(input, 'files', { value: [file] });
    input!.dispatchEvent(new Event('change'));
    await expect(choosing).resolves.toBe(file);
    await vi.advanceTimersByTimeAsync(PICK_CANCEL_GRACE_MS);
  });

  it('answers null for a change that carries no file', async () => {
    onChooser((el) => el.dispatchEvent(new Event('change')));
    await expect(pickFile('.pdf')).resolves.toBeNull();
  });
});
