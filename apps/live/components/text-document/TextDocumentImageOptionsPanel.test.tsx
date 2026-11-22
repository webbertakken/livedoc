// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Working with a picture": Image options' Size & rotation holds Width and
// Height in the person's unit, Scale in percent of its own size (dimmed while that is unknown) and Lock aspect ratio,
// on at first; each field applies on Enter or when left, an invalid one says so; Reset; without a picture, a hint.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  TextDocumentImageOptionsPanel,
  type PictureSizing,
} from './TextDocumentImageOptionsPanel';

const SHOWN: PictureSizing = { width: 72, height: 36, own: { width: 144, height: 72 } };

const panel = (picture: PictureSizing | null = SHOWN) => {
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(
    <TextDocumentImageOptionsPanel
      picture={picture}
      unit="in"
      onChange={onChange}
      onReset={onReset}
    />,
  );
  return { onChange, onReset };
};

const field = (name: string) => screen.getByRole<HTMLInputElement>('textbox', { name });
const type = (name: string, value: string) => {
  fireEvent.change(field(name), { target: { value } });
  fireEvent.keyDown(field(name), { key: 'Enter' });
};

describe('TextDocumentImageOptionsPanel', () => {
  it('shows its size in the person\u2019s unit and its scale in percent', () => {
    panel();
    expect([...document.querySelectorAll('summary')].map((s) => s.textContent)).toEqual([
      'Size & rotation▾',
    ]);
    expect(field('Width').value).toBe('1');
    expect(field('Height').value).toBe('0.5');
    expect(field('Scale width').value).toBe('50');
    expect(field('Scale height').value).toBe('50');
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Lock aspect ratio' }).checked).toBe(
      true,
    );
  });

  it('applies a width in points, locked to the ratio', () => {
    const { onChange } = panel();
    type('Width', '2');
    expect(onChange).toHaveBeenCalledWith({ field: 'width', value: 144 }, true);
  });

  it('applies a scale unlocked once the lock is off', () => {
    const { onChange } = panel();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lock aspect ratio' }));
    type('Scale height', '200');
    expect(onChange).toHaveBeenCalledWith({ field: 'scaleHeight', value: 200 }, false);
  });

  it('applies when a field is left, and nothing for the same value', () => {
    const { onChange } = panel();
    fireEvent.change(field('Height'), { target: { value: '0.5' } });
    fireEvent.blur(field('Height'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(field('Height'), { target: { value: '1' } });
    fireEvent.blur(field('Height'));
    expect(onChange).toHaveBeenCalledWith({ field: 'height', value: 72 }, true);
  });

  it('says what an invalid value should be, and applies nothing', () => {
    const { onChange } = panel();
    type('Scale width', '0');
    expect(screen.getByText('Enter a number from 1 to 1000.')).toBeTruthy();
    expect(field('Scale width').getAttribute('aria-invalid')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('dims Scale and Reset while its own size is unknown', () => {
    panel({ width: 72, height: 36, own: null });
    expect(field('Scale width').disabled).toBe(true);
    expect(field('Scale width').value).toBe('');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Reset' }).disabled).toBe(true);
  });

  it('resets', () => {
    const { onReset } = panel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('says to select an image when none is', () => {
    panel(null);
    expect(screen.getByText('Select an image to see its options.')).toBeTruthy();
  });
});
