// What the page of the Page Stack shows as the homepage's every-kind cycle runs (docs/specs/004-interface-design/
// brand-mark.md "Every kind"): a page, a sheet, a board and a form, drawn
// in the page's plane units (140 × 150) in the mark's highlight ink. Data only; apps/marketing draws it.

export type BrandKindShape =
  | { type: 'line'; d: string; width: number }
  | {
      type: 'box';
      x: number;
      y: number;
      width: number;
      height: number;
      radius: number;
      fill?: number;
      stroke?: number;
    };

export type BrandKind = {
  key: 'page' | 'sheet' | 'board' | 'form';
  name: string;
  shapes: readonly BrandKindShape[];
};

export const BRAND_KINDS: readonly BrandKind[] = [
  {
    key: 'page',
    name: 'Page',
    shapes: [
      { type: 'line', d: 'M22 66H80', width: 12 },
      { type: 'line', d: 'M22 92H116', width: 7 },
      { type: 'line', d: 'M22 110H106', width: 7 },
      { type: 'line', d: 'M22 128H82', width: 7 },
    ],
  },
  {
    key: 'sheet',
    name: 'Sheet',
    shapes: [
      { type: 'box', x: 18, y: 54, width: 104, height: 82, radius: 4, stroke: 3 },
      { type: 'box', x: 18, y: 54, width: 104, height: 20, radius: 4, fill: 0.45 },
      { type: 'line', d: 'M18 74H122M18 95H122M18 116H122M52 54V136M87 54V136', width: 3 },
    ],
  },
  {
    key: 'board',
    name: 'Board',
    shapes: [
      { type: 'line', d: 'M50 74L86 84M60 112L80 92', width: 3 },
      { type: 'box', x: 18, y: 56, width: 36, height: 34, radius: 5, fill: 0.9 },
      { type: 'box', x: 78, y: 68, width: 36, height: 34, radius: 5, fill: 0.6 },
      { type: 'box', x: 36, y: 102, width: 36, height: 34, radius: 5, fill: 0.75 },
    ],
  },
  {
    key: 'form',
    name: 'Form',
    shapes: [
      { type: 'line', d: 'M22 58H62', width: 6 },
      { type: 'box', x: 20, y: 66, width: 98, height: 20, radius: 5, stroke: 3 },
      { type: 'line', d: 'M22 100H70', width: 6 },
      { type: 'box', x: 20, y: 108, width: 98, height: 20, radius: 5, stroke: 3 },
      { type: 'box', x: 76, y: 134, width: 42, height: 11, radius: 5.5, fill: 0.9 },
    ],
  },
];
