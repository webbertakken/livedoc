// @vitest-environment jsdom
// docs/specs/035-pdf-documents/files-print-and-sync.md "Printing": the file is handed to the browser in a frame of its
// own, out of sight, and printed once loaded; pictures go in a print-only document, a sheet a page of its own size;
// the frame goes once the print dialog closes, or after PDF_PRINT_FRAME_MS.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_PRINT_FRAME_MS } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { PRINT_OPENED_MS, picturesStyle, printInFrame } from './print-frame';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

let made = 0;
const revoked: string[] = [];

beforeEach(() => {
  made = 0;
  revoked.length = 0;
  URL.createObjectURL = () => `blob:made-${(made += 1)}`;
  URL.revokeObjectURL = (url) => void revoked.push(url);
});

afterEach(() => {
  vi.useRealTimers();
});

const frameIn = (host: HTMLElement) => host.querySelector('iframe')!;

function loaded(frame: HTMLIFrameElement, print: () => void) {
  frame.contentWindow!.print = print;
  frame.dispatchEvent(new Event('load'));
}

describe('printInFrame', () => {
  it('prints a PDF from a frame out of sight, gone with its file once the dialog closes', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    const print = vi.fn();
    const done = printInFrame({ way: 'pdf', bytes: Uint8Array.of(37) }, host);
    const frame = frameIn(host);
    expect(frame.src).toBe('blob:made-1');
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.tabIndex).toBe(-1);
    expect(frame.style.opacity).toBe('0');
    loaded(frame, print);
    expect(print).toHaveBeenCalledTimes(1);
    frame.contentWindow!.dispatchEvent(new Event('afterprint'));
    expect(await done).toBe('printed');
    expect(host.querySelector('iframe')).toBeNull();
    expect(revoked).toEqual(['blob:made-1']);
  });

  it('lets the frame go after the limit where the browser never says the dialog closed', async () => {
    vi.useFakeTimers();
    const host = document.body.appendChild(document.createElement('div'));
    const done = printInFrame({ way: 'pdf', bytes: Uint8Array.of(37) }, host);
    loaded(frameIn(host), vi.fn());
    vi.advanceTimersByTime(PDF_PRINT_FRAME_MS);
    expect(await done).toBe('unconfirmed');
    expect(host.querySelector('iframe')).toBeNull();
  });

  it('counts a print whose dialog opened as printed, though the browser never says it closed', async () => {
    vi.useFakeTimers();
    const host = document.body.appendChild(document.createElement('div'));
    const done = printInFrame({ way: 'pdf', bytes: Uint8Array.of(37) }, host, true);
    const frame = frameIn(host);
    loaded(frame, () => frame.contentWindow!.dispatchEvent(new Event('beforeprint')));
    vi.advanceTimersByTime(PDF_PRINT_FRAME_MS);
    expect(await done).toBe('printed');
  });

  it('counts a print as blocked where a framed page’s dialog never opens', async () => {
    vi.useFakeTimers();
    const host = document.body.appendChild(document.createElement('div'));
    const done = printInFrame({ way: 'pdf', bytes: Uint8Array.of(37) }, host, true);
    loaded(frameIn(host), vi.fn());
    vi.advanceTimersByTime(PRINT_OPENED_MS);
    expect(await done).toBe('blocked');
    expect(host.querySelector('iframe')).toBeNull();
  });

  it('prints pictures as a document of their own, and lets go of each', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    // jsdom decodes no picture: the frame's own window is given a decode that is done at once, and that fails for the
    // second, which is printed all the same, as the browser draws it.
    host.append = (frame) => {
      HTMLElement.prototype.append.call(host, frame);
      const view = (frame as HTMLIFrameElement).contentWindow as unknown as typeof window;
      view.HTMLImageElement.prototype.decode = async function (this: HTMLImageElement) {
        if (this.className === 'p1') throw new Error('undecodable');
      };
    };
    const done = printInFrame(
      {
        way: 'pictures',
        pictures: [
          { jpeg: Uint8Array.of(1), width: 612, height: 792 },
          { jpeg: Uint8Array.of(2), width: 792, height: 612 },
        ],
      },
      host,
    );
    const frame = frameIn(host);
    const print = vi.fn();
    frame.contentWindow!.print = print;
    const sheet = frame.contentDocument!;
    const images = [...sheet.querySelectorAll('img')];
    expect(images.map((image) => [image.className, image.getAttribute('src')])).toEqual([
      ['p0', 'blob:made-1'],
      ['p1', 'blob:made-2'],
    ]);
    expect(sheet.querySelector('style')!.textContent).toContain(
      '@page p1{size:792pt 612pt;margin:0}',
    );
    expect(frame.dataset.pdfPrintFrame).toBe('pictures');
    // Printed once every picture is decoded.
    await vi.waitFor(() => expect(print).toHaveBeenCalled());
    frame.contentWindow!.dispatchEvent(new Event('afterprint'));
    await done;
    expect(revoked).toEqual(['blob:made-1', 'blob:made-2']);
  });

  it('lets the frame go, and says so, where the browser refuses to print it', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    const done = printInFrame({ way: 'pdf', bytes: Uint8Array.of(37) }, host);
    loaded(frameIn(host), () => {
      throw new Error('blocked');
    });
    expect(await done).toBe('blocked');
    expect(debugLog).toHaveBeenCalledWith('[pdf] print-failed step=frame', 'Error: blocked');
    expect(host.querySelector('iframe')).toBeNull();
  });

  it('appends to the page’s body unless told where', () => {
    void printInFrame({ way: 'pdf', bytes: Uint8Array.of(37) });
    expect(document.body.querySelector('iframe[data-pdf-print-frame="pdf"]')).not.toBeNull();
  });
});

describe('picturesStyle', () => {
  it('puts each picture on a sheet of its page’s size, nothing else', () => {
    expect(picturesStyle([{ width: 612, height: 792 }])).toContain(
      '@page p0{size:612pt 792pt;margin:0}',
    );
  });
});
