// SPARKLINE (docs/specs/029-sheets/charts.md "Sparklines"): its value is empty text; its chart is drawn from the
// formula worked out again with Frame.drawSparkline set (Workbook.sparklineOf), so it draws through IF and the like.
import { readSparkline } from '../../sparkline/sparkline-read';
import { arrayArg, fn, type FnDef } from '../fn';

export const SPARKLINE_FUNCTIONS: Record<string, FnDef> = {
  SPARKLINE: fn(1, 2, (args, f) => {
    const data = arrayArg(args[0]!, f).rows;
    const options = args[1] === undefined ? [] : arrayArg(args[1], f).rows;
    const chart = readSparkline(data, options);
    if ('e' in chart) return chart;
    f.drawSparkline?.(chart);
    return '';
  }),
};
