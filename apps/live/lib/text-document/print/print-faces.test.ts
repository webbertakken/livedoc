import { describe, expect, it } from 'vitest';
import { printFaceOf, printFaceSource } from './print-faces';

describe('printFaceOf', () => {
  it('takes the first served family the text draws in, at its weight and style, Latin then Latin Extended', () => {
    expect(printFaceOf('"LiveDoc Lora", serif', 700, true)).toEqual({
      id: 'lora-700-italic',
      files: ['lora/files/lora-latin-700-italic.woff', 'lora/files/lora-latin-ext-700-italic.woff'],
      bold: true,
    });
  });

  it('reads a stand-in after a family the computer may have', () => {
    expect(printFaceOf('Arial, "LiveDoc Arimo", sans-serif', 400, false).id).toBe(
      'arimo-400-normal',
    );
  });

  it('takes the nearest style a family has: its upright, then its regular', () => {
    expect(printFaceOf('"LiveDoc Caveat"', 700, true).id).toBe('caveat-700-normal');
    expect(printFaceOf('"LiveDoc Lobster"', 700, true).id).toBe('lobster-400-normal');
    expect(printFaceOf('"LiveDoc Lobster"', 400, true).id).toBe('lobster-400-normal');
  });

  it('counts 600 and heavier as bold', () => {
    expect(printFaceOf('"LiveDoc Roboto"', 600, false).id).toBe('roboto-700-normal');
    expect(printFaceOf('"LiveDoc Roboto"', 500, false).id).toBe('roboto-400-normal');
  });

  it('has no files where no served family draws the text: the mark faces set it', () => {
    expect(printFaceOf('Verdana, sans-serif', 700, false)).toEqual({
      id: 'none-700',
      files: [],
      bold: true,
    });
    expect(printFaceOf('"LiveDoc Nobody", serif', 400, false).id).toBe('none-400');
  });
});

describe('printFaceSource', () => {
  it('fetches a served face’s file as the app’s asset, and any other through the mark faces', async () => {
    const fetched: string[] = [];
    const source = printFaceSource(
      async (url) => {
        fetched.push(url);
        return new Response(new Uint8Array([1, 2]));
      },
      async (file) => new Uint8Array([file.length]),
    );
    expect(await source('lora/files/lora-latin-400-normal.woff')).toEqual(new Uint8Array([1, 2]));
    expect(fetched[0]).toContain('lora-latin-400-normal');
    expect(await source('noto-sans/files/x.woff')).toEqual(new Uint8Array([22]));
  });

  it('throws where a served face does not load', async () => {
    const source = printFaceSource(
      async () => new Response(null, { status: 503 }),
      async () => new Uint8Array(),
    );
    await expect(source('lora/files/lora-latin-400-normal.woff')).rejects.toThrow('503');
  });
});
