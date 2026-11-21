// Which formulas call SPARKLINE, and the charts already asked for (charts.md "Sparklines"): the grid asks for each
// visible cell's chart on every paint, so a chart is worked out once per workbook version.
import { callsOf, type Node } from '../formula/ast';
import type { Sparkline } from '../sparkline/sparkline-read';

const calling = new WeakMap<Node, boolean>();

export class SparklineMemo {
  private version = -1;
  private readonly charts = new Map<string, Sparkline | null>();

  /** Whether a parsed formula calls SPARKLINE anywhere; remembered per parse. */
  static calls(ast: Node): boolean {
    let known = calling.get(ast);
    if (known === undefined) {
      known = [...callsOf(ast)].some((name) => name.toUpperCase() === 'SPARKLINE');
      calling.set(ast, known);
    }
    return known;
  }

  /** The chart at `key` as of `version`, worked out by `draw` when not yet asked for since the version changed. */
  get(key: string, version: number, draw: () => Sparkline | null): Sparkline | null {
    if (version !== this.version) {
      this.charts.clear();
      this.version = version;
    }
    if (!this.charts.has(key)) this.charts.set(key, draw());
    return this.charts.get(key)!;
  }
}
