// A chart's titles (docs/specs/029-sheets/charts.md "The model", Customise's Chart and Axis Titles): a title across the
// top, a horizontal axis title under the plot and a vertical axis title turned up along its left. Each takes a band
// of the chart's box that the plot and the legend give up; a chart with none is laid out as before. The canvas and
// the export draw the same texts from here.

export type ChartTitleFields = {
  shape: string;
  chartTitle?: string;
  chartAxisTitles?: { x?: string; y?: string };
};

// A title's text, centred on (x, y); `turned` is turned a quarter anticlockwise (the vertical axis's).
export type ChartTitleText = {
  text: string;
  x: number;
  y: number;
  px: number;
  bold: boolean;
  turned: boolean;
};

export const CHART_TITLE_BAND_PX = 24;
export const CHART_AXIS_TITLE_BAND_PX = 16;
const TITLE_PX = 13;
const AXIS_TITLE_PX = 10;

const shown = (s: string | undefined) => (s?.trim() ? s.trim() : null);

// The band the title takes off the top of the whole chart, before the legend's.
export function chartTitleBand(el: ChartTitleFields): number {
  return shown(el.chartTitle) ? CHART_TITLE_BAND_PX : 0;
}

// The texts, and what the axis titles take off the plot's area (the pie has no axes, so none).
export function chartTitles(
  el: ChartTitleFields,
  w: number,
  area: { x: number; y: number; w: number; h: number },
): { area: typeof area; texts: ChartTitleText[] } {
  const texts: ChartTitleText[] = [];
  const title = shown(el.chartTitle);
  if (title)
    texts.push({
      text: title,
      x: w / 2,
      y: CHART_TITLE_BAND_PX / 2,
      px: TITLE_PX,
      bold: true,
      turned: false,
    });
  if (el.shape === 'pie-chart') return { area, texts };
  const xTitle = shown(el.chartAxisTitles?.x);
  const yTitle = shown(el.chartAxisTitles?.y);
  const left = yTitle ? CHART_AXIS_TITLE_BAND_PX : 0;
  const bottom = xTitle ? CHART_AXIS_TITLE_BAND_PX : 0;
  const plot = { x: area.x + left, y: area.y, w: area.w - left, h: area.h - bottom };
  if (xTitle)
    texts.push({
      text: xTitle,
      x: plot.x + plot.w / 2,
      y: area.y + area.h - CHART_AXIS_TITLE_BAND_PX / 2,
      px: AXIS_TITLE_PX,
      bold: false,
      turned: false,
    });
  if (yTitle)
    texts.push({
      text: yTitle,
      x: area.x + CHART_AXIS_TITLE_BAND_PX / 2,
      y: area.y + area.h / 2 - bottom / 2,
      px: AXIS_TITLE_PX,
      bold: false,
      turned: true,
    });
  return { area: plot, texts };
}

/**
 * An axis's label in a readout: its title up to its first " (", so a unit or a note in brackets stays on the axis; the
 * fallback for an axis with no title (pie-chart.md "A scatter point's readout").
 */
export function axisReadoutLabel(title: string | undefined, fallback: string): string {
  return title?.split(' (')[0]!.trim() || fallback;
}
