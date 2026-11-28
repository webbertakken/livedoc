import { describe, expect, it } from 'vitest';
import type { ConversionLoss } from './convert';
import {
  CONVERSION_LINES,
  conversionLead,
  conversionLines,
  conversionTitle,
  formatName,
} from './conversion-copy';

const loss = (
  kind: ConversionLoss['kind'],
  count: number,
  name: string = kind,
): ConversionLoss => ({
  kind,
  name,
  count,
});

describe('conversion copy', () => {
  it('names the conversion and the download by the format they write', () => {
    expect(conversionTitle('convert', 'ooxml')).toBe('Convert to Word?');
    expect(conversionTitle('convert', 'odf')).toBe('Convert to OpenDocument?');
    expect(conversionTitle('download', 'ooxml')).toBe('Download as Word?');
    expect(conversionTitle('download', 'odf')).toBe('Download as OpenDocument?');
    expect(formatName('odf')).toBe('OpenDocument');
  });

  it('leads the losses with the file the conversion writes, or says that everything fits', () => {
    expect(conversionLead('ooxml', [loss('between', 1)])).toBe('The .docx file cannot hold:');
    expect(conversionLead('odf', [loss('between', 1)])).toBe('The .odt file cannot hold:');
    expect(conversionLead('ooxml', [])).toBe('Everything in this document fits the Word format.');
    expect(conversionLead('odf', [])).toBe(
      'Everything in this document fits the OpenDocument format.',
    );
  });

  it('gathers kept content into one line, counted, naming up to three', () => {
    expect(conversionLines([loss('kept', 1, 'chart')])).toEqual([
      '1 item kept from the original file: chart',
    ]);
    expect(
      conversionLines([
        loss('kept', 2, 'chart'),
        loss('kept', 1, 'object'),
        loss('kept', 1, 'Pictures'),
        loss('kept', 3, 'customXml'),
      ]),
    ).toEqual(['7 items kept from the original file: chart, object, Pictures and 1 more']);
    expect(conversionLines([loss('kept', 1, 'chart'), loss('kept', 1, 'object')])).toEqual([
      '2 items kept from the original file: chart and object',
    ]);
  });

  it('says one line for every other loss, the kept line first', () => {
    expect(conversionLines([loss('between', 2), loss('kept', 1, 'chart')])).toEqual([
      '1 item kept from the original file: chart',
      '2 lines between paragraphs',
    ]);
  });

  it('words every loss the conversion can list, in the singular and the plural', () => {
    for (const kind of Object.keys(CONVERSION_LINES) as (keyof typeof CONVERSION_LINES)[]) {
      const [one] = conversionLines([loss(kind, 1)]);
      const [two] = conversionLines([loss(kind, 2)]);
      expect(one).toMatch(/^1 /);
      expect(two).toMatch(/^2 /);
      expect(one).not.toBe(two?.replace(/^2/, '1'));
    }
    expect(conversionLines([loss('border-padding', 3)])).toEqual([
      '3 borders with padding past 31 pt, written as 31 pt',
    ]);
    expect(conversionLines([loss('text-transform', 1)])).toEqual([
      '1 run of lowercase or capitalised text',
    ]);
  });
});
