import { describe, expect, it } from 'vitest';
import { createShape } from './shape-factory';
import { isValidElement } from './validate';
import { isPlanSheetRef, takesTypedLabel } from './element-types';
import { elementKindLabel } from './element-kind-label';
import { renderElementsToSvg } from './svg-render';
import { svgPlanSheet, type SheetRenderModel } from './svg-render-plan-sheet';

const sheet = {
  id: 'e1',
  type: 'shape' as const,
  shape: 'plan-sheet' as const,
  x: 0,
  y: 0,
  width: 960,
  height: 560,
  planSheet: { sheetId: 'sheet0001' },
};

describe('the Sheet element', () => {
  it('is a valid, untyped shape that names its sheet', () => {
    const made = createShape('plan-sheet', 10, 20) as { width: number; planSheet: unknown };
    expect(made.width).toBe(960);
    expect(made.planSheet).toEqual({ sheetId: '' });
    expect(isValidElement(sheet)).toBe(true);
    expect(isValidElement({ ...sheet, planSheet: { sheetId: 'bad id!' } })).toBe(false);
    expect(isPlanSheetRef({ sheetId: 'sheet0001', x: 1 })).toBe(false);
    expect(isPlanSheetRef(null)).toBe(false);
    // A template's Sheet not yet made names its start (sheet-store.md "Template starts").
    expect(isPlanSheetRef({ sheetId: 'sheet0001', start: 'budget-planner' })).toBe(true);
    expect(isPlanSheetRef({ sheetId: 'sheet0001', start: 'Budget Planner' })).toBe(false);
    expect(isPlanSheetRef({ sheetId: 'sheet0001', start: 3 })).toBe(false);
    expect(takesTypedLabel(sheet)).toBe(false);
    expect(elementKindLabel(sheet as never)).toBe('Sheet');
  });
});

const MODEL: SheetRenderModel = {
  title: 'Budget <Q3>',
  colWidths: [100, 100],
  rowHeights: [24, 24],
  colLabels: ['A', 'B'],
  rowLabels: ['1', '2'],
  frozenRows: 1,
  frozenCols: 1,
  cells: [
    {
      r: 0,
      c: 0,
      text: 'Total',
      align: 'l',
      valign: 'b',
      bold: true,
      italic: true,
      underline: true,
      strike: true,
      fill: '#eeeeee',
      colSpan: 2,
      size: 12,
      borders: {
        t: { w: 1, s: 'solid', c: '#000000' },
        b: { w: 2, s: 'dashed', c: '#000000' },
        l: { w: 1, s: 'dotted', c: '#000000' },
        r: { w: 1, s: 'solid', c: '#000000' },
      },
    },
    { r: 1, c: 0, text: '#DIV/0!', align: 'c', valign: 'm', error: true },
    { r: 1, c: 1, text: '12', align: 'r', valign: 't', color: '#123456', wrap: 'w', font: 'lora' },
    // A font the editor no longer offers draws in the sheet's.
    { r: 2, c: 0, text: 'Old', align: 'l', valign: 'm', font: 'gone-font' },
  ],
};

describe('the static render', () => {
  it('draws the header, headers, cells, formats and borders', () => {
    const svg = svgPlanSheet(sheet, MODEL, 'light');
    expect(svg).toContain('Budget &lt;Q3&gt;');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('text-decoration="underline line-through"');
    expect(svg).toContain('fill="#dc2626"');
    expect(svg).toContain('text-anchor="end"');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('#123456');
    expect(svg).toContain('font-family="&#39;Lora&#39;');
    expect(svg.match(/font-family="&#39;/g)).toHaveLength(1);
  });
  // docs/specs/029-sheets/formatting.md "Borders": a double is two 1 px lines, a pixel either side of where one runs.
  it('draws a double border as two lines', () => {
    const svg = svgPlanSheet(
      sheet,
      {
        ...MODEL,
        cells: [
          {
            r: 0,
            c: 0,
            text: 'Total',
            align: 'l',
            valign: 'm',
            borders: {
              t: { w: 3, s: 'double', c: '#000000' },
              l: { w: 3, s: 'double', c: '#ff0000' },
            },
          },
        ],
      },
      'light',
    );
    expect(svg.match(/<line [^>]*stroke="#000000" stroke-width="1"\/>/g)).toHaveLength(2);
    expect(svg.match(/<line [^>]*stroke="#ff0000" stroke-width="1"\/>/g)).toHaveLength(2);
  });
  // docs/specs/029-sheets/sheet.md "Row height", D99: a cell with no font is drawn in the font it was measured in.
  it("draws a cell with no font of its own in the sheet's measured font", () => {
    const svg = svgPlanSheet(sheet, { ...MODEL, font: 'inter' }, 'light');
    expect(svg.match(/font-family="&#39;Inter&#39;/g)).toHaveLength(MODEL.cells.length - 1);
    expect(svg).toContain('font-family="&#39;Lora&#39;');
  });
  // docs/specs/029-sheets/sheet.md "Exports and images": an SVG asks for tabular figures as the grid does.
  it('asks for tabular figures on a cell showing a number, and only there', () => {
    const svg = svgPlanSheet(
      sheet,
      {
        ...MODEL,
        cells: [
          { r: 0, c: 0, text: '1,111.10', align: 'r', valign: 'm', numeric: true },
          { r: 0, c: 1, text: 'Total 11', align: 'l', valign: 'm' },
        ],
      },
      'light',
    );
    expect(svg.match(/font-variant-numeric="tabular-nums"/g)).toHaveLength(1);
    expect(svg).toMatch(/font-variant-numeric="tabular-nums"[^>]*>1,111\.10</);
  });
  it('draws a dropdown chip as a pill in its option’s colour, inked to read, and an arrow dropdown’s chevron', () => {
    const cells = (extra: SheetRenderModel['cells']) =>
      svgPlanSheet(sheet, { ...MODEL, cells: extra }, 'light');
    const dark = cells([
      { r: 0, c: 0, text: 'Won', align: 'l', valign: 'm', chip: { color: '#166534' } },
    ]);
    expect(dark).toMatch(
      /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="[\d.]+" fill="#166534"\/>/,
    );
    expect(dark).toContain('fill="#ffffff"');
    expect(dark).toContain('stroke-linecap="round"');
    const light = cells([
      { r: 0, c: 0, text: 'Lead', align: 'r', valign: 'm', chip: { color: '#fef08a' } },
    ]);
    expect(light).toContain('fill="#1f2937"');
    // A chip's text starts inside its pill, whatever the cell's alignment.
    expect(/<text[^>]*>Lead</.exec(light)?.[0]).not.toContain('text-anchor');
    const plain = cells([{ r: 0, c: 0, text: 'Other', align: 'l', valign: 'm', chip: {} }]);
    expect(plain).toMatch(/rx="[\d.]+" fill="#f1f5f9"/);
    const arrow = cells([{ r: 0, c: 0, text: 'North', align: 'r', valign: 'm', arrow: true }]);
    expect(arrow).toContain('stroke-linecap="round"');
    expect(/<text[^>]*>North</.exec(arrow)?.[0]).toContain('text-anchor="end"');
  });

  // docs/specs/029-sheets/sheet.md "Row height": images and exports draw the lines that were measured.
  it('draws a cell of several lines a tspan each, 1.3 font sizes apart, placed as the cell is aligned', () => {
    const lined = (valign: 't' | 'm' | 'b') => {
      const svg = svgPlanSheet(
        sheet,
        {
          ...MODEL,
          rowHeights: [80, 24],
          cells: [{ r: 0, c: 0, text: 'a b c', lines: ['a <', 'b', 'c'], align: 'l', valign }],
        },
        'light',
      );
      return [...svg.matchAll(/<tspan x="[\d.]+" y="([\d.]+)">([^<]*)<\/tspan>/g)].map((m) => ({
        y: Number(m[1]),
        text: m[2],
      }));
    };
    const top = lined('t');
    expect(top.map((l) => l.text)).toEqual(['a &lt;', 'b', 'c']);
    expect(top[1]!.y - top[0]!.y).toBe(17);
    expect(top[2]!.y - top[1]!.y).toBe(17);
    const middle = lined('m');
    const bottom = lined('b');
    // The block sits at the top, in the middle, and at the bottom of its 80 px row.
    expect(top[0]!.y).toBeLessThan(middle[0]!.y);
    expect(middle[0]!.y).toBeLessThan(bottom[0]!.y);
    expect(middle[1]!.y).toBeCloseTo((top[1]!.y + bottom[1]!.y) / 2, 0);
    // One line is drawn as before: no tspan.
    expect(svgPlanSheet(sheet, MODEL, 'light')).not.toContain('<tspan');
  });

  // A browser that snaps each character to whole px draws a line wider than it was measured (sheet.md "Row height").
  it("places measured text by its font's own widths: several lines, and a cell that wraps", () => {
    const textOf = (cell: Partial<SheetRenderModel['cells'][number]> & { text: string }) => {
      const svg = svgPlanSheet(
        sheet,
        { ...MODEL, cells: [{ r: 0, c: 0, align: 'l', valign: 'm', ...cell }] },
        'light',
      );
      return new RegExp(`<text[^>]*>(?:<tspan[^>]*>)?${cell.text.split(' ')[0]}`).exec(svg)![0];
    };
    const precise = 'text-rendering="geometricPrecision"';
    expect(textOf({ text: 'one two', lines: ['one', 'two'] })).toContain(precise);
    expect(textOf({ text: 'fits', wrap: 'w' })).toContain(precise);
    expect(textOf({ text: 'plain' })).not.toContain(precise);
  });

  it('leaves out the gridlines and the headers when the sheet hides them', () => {
    const shown = svgPlanSheet(sheet, MODEL, 'light');
    const hidden = svgPlanSheet(sheet, { ...MODEL, hideGrid: true, hideHeaders: true }, 'light');
    const lines = (svg: string) => (svg.match(/stroke-width="1"\/>/g) ?? []).length;
    expect(lines(hidden)).toBeLessThan(lines(shown));
    expect(shown).toContain('>A</text>');
    expect(hidden).not.toContain('>A</text>');
    expect(hidden).toContain('Total');
  });
  it('draws a frame and headers without a model', () => {
    expect(svgPlanSheet(sheet, undefined, 'light')).toContain('>Sheet<');
  });
  it('renders through the tab renderer with the sheets given', () => {
    const svg = renderElementsToSvg({ elements: [sheet] } as never, {
      sheets: new Map([['sheet0001', MODEL]]),
    });
    expect(svg).toContain('Total');
    // The export declares the cells' fonts with the rest, the font a cell with none is drawn in too.
    expect(svg).toContain('family=Lora');
    expect(svg).not.toContain('family=Inter');
    expect(
      renderElementsToSvg({ elements: [sheet] } as never, {
        sheets: new Map([['sheet0001', { ...MODEL, font: 'inter' }]]),
      }),
    ).toContain('family=Inter');
    expect(renderElementsToSvg({ elements: [sheet] } as never)).toContain('>Sheet<');
  });
});

describe('copies of a Sheet', () => {
  it('frame a new sheet made from the original', async () => {
    const { freshCopyFields } = await import('./duplicate');
    const copy = freshCopyFields(sheet) as {
      planSheet: { sheetId: string; copyOf: string };
    };
    expect(copy.planSheet.copyOf).toBe('sheet0001');
    expect(copy.planSheet.sheetId).not.toBe('sheet0001');
    expect(isPlanSheetRef(copy.planSheet)).toBe(true);
    // A copy of a copy not yet made copies the original.
    const again = freshCopyFields({ ...sheet, planSheet: copy.planSheet }) as typeof copy;
    expect(again.planSheet.copyOf).toBe('sheet0001');
    expect(freshCopyFields({ ...sheet, planSheet: { sheetId: '' } })).toEqual({});
    // A copy of a template's Sheet not yet made is made from the same start.
    const started = freshCopyFields({
      ...sheet,
      planSheet: { sheetId: 'sheet0001', start: 'timesheet' },
    }) as typeof copy & { planSheet: { start?: string } };
    expect(started.planSheet.start).toBe('timesheet');
    expect(started.planSheet.copyOf).toBeUndefined();
    expect(started.planSheet.sheetId).not.toBe('sheet0001');
    expect(isPlanSheetRef({ sheetId: 'sheet0001', copyOf: 'x' })).toBe(false);
    // Fill Tab is exactly true, or absent.
    expect(isPlanSheetRef({ sheetId: 'sheet0001', fillTab: true })).toBe(true);
    expect(isPlanSheetRef({ sheetId: 'sheet0001', fillTab: false })).toBe(false);
  });
});

// docs/specs/029-sheets/formulas.md "Text": a HYPERLINK stays a link in an SVG export, its target escaped like any
// text, in the sheet's accent unless the cell has its own colour.
describe('a HYPERLINK cell in the static render', () => {
  it('wraps its text in an escaped link that opens in a new tab', () => {
    const svg = svgPlanSheet(
      sheet,
      {
        ...MODEL,
        cells: [
          {
            r: 0,
            c: 0,
            text: 'Docs',
            align: 'l',
            valign: 'm',
            underline: true,
            link: 'https://example.com/?a=1&b="2"',
          },
        ],
      },
      'light',
    );
    expect(svg).toContain(
      '<a href="https://example.com/?a=1&amp;b=&quot;2&quot;" target="_blank" rel="noopener noreferrer"><text',
    );
    expect(svg).toMatch(/<a [^>]*><text[^>]*text-decoration="underline"[^>]*>Docs<\/text><\/a>/);
  });

  it('leaves a cell without a link unwrapped', () => {
    expect(svgPlanSheet(sheet, MODEL, 'light')).not.toContain('<a ');
  });
});

// docs/specs/029-sheets/charts.md "Sparklines": a SPARKLINE draws the same in an SVG export, in the sheet's accent.
describe('a SPARKLINE cell in the static render', () => {
  it('draws its shapes in the cell, the paint tokens in the palette and colours escaped', () => {
    const svg = svgPlanSheet(
      sheet,
      {
        ...MODEL,
        cells: [
          {
            r: 0,
            c: 0,
            text: '',
            align: 'l',
            valign: 'm',
            spark: [
              { k: 'path', d: 'M2 22L52 2', paint: '@accent', width: 2 },
              { k: 'path', d: 'M2 12H102', paint: '@muted', width: 1 },
              { k: 'rect', x: 2, y: 2, w: 10, h: 20, paint: 'red"', opacity: 0.5 },
              { k: 'rect', x: 12, y: 2, w: 10, h: 20, paint: '#00f' },
            ],
          },
        ],
      },
      'light',
    );
    expect(svg).toMatch(
      /<g transform="translate\([\d.]+ [\d.]+\)"><path d="M2 22L52 2" fill="none" stroke="#/,
    );
    expect(svg).toContain('fill="red&quot;" fill-opacity="0.5"/>');
    expect(svg).toContain('<rect x="12" y="2" width="10" height="20" fill="#00f"/></g>');
  });
});
