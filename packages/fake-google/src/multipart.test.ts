import { describe, expect, it } from 'vitest';
import { parseMultipartRelated } from './multipart';

describe('parseMultipartRelated', () => {
  it('splits the metadata and media parts', () => {
    const body = [
      '--b1',
      'Content-Type: application/json; charset=UTF-8',
      '',
      '{"name":"x"}',
      '--b1',
      'Content-Type: application/vnd.livedoc+json',
      '',
      '{"kind":"livedoc.document"}',
      '--b1--',
      '',
    ].join('\r\n');
    const parts = parseMultipartRelated('multipart/related; boundary=b1', body);
    expect(parts.map(({ contentType, body: text }) => ({ contentType, body: text }))).toEqual([
      { contentType: 'application/json; charset=UTF-8', body: '{"name":"x"}' },
      { contentType: 'application/vnd.livedoc+json', body: '{"kind":"livedoc.document"}' },
    ]);
  });

  it('keeps a binary media part byte for byte', () => {
    const media = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x0d, 0x0a, 0xc3, 0x28]);
    const head = new TextEncoder().encode(
      '--b2\r\nContent-Type: application/json\r\n\r\n{"name":"ü"}\r\n--b2\r\nX-Note: no type\r\n\r\n',
    );
    const tail = new TextEncoder().encode('\r\n--b2--\r\n');
    const body = new Uint8Array([...head, ...media, ...tail]);
    const [meta, part] = parseMultipartRelated('multipart/related; boundary="b2"', body);
    expect(meta!.body).toBe('{"name":"ü"}');
    expect(part!.contentType).toBe('text/plain');
    expect([...part!.bytes]).toEqual([...media]);
  });

  it('skips a part without a header break', () => {
    expect(
      parseMultipartRelated('multipart/related; boundary=b3', '--b3\r\nno break--b3--'),
    ).toEqual([]);
  });

  it('refuses anything that is not multipart/related', () => {
    expect(() => parseMultipartRelated('application/json', '{}')).toThrow();
  });
});
