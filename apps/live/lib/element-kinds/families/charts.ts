// The charts family (docs/specs/016-platform/web-performance.md): pie, column and line charts, a chart drawn from a
// sheet range, and the Sankey diagram. Loaded through the registry (lib/element-kinds), never imported statically:
// its faces, and the Sankey's reading and editing of flows its writes use (hooks/canvas/useSankeySetters.ts).
export { PieChartView } from '@/components/canvas/PieChartView';
export { BarChartView } from '@/components/canvas/BarChartView';
export { LineChartView } from '@/components/canvas/LineChartView';
export { DataChartView } from '@/components/canvas/DataChartView';
export { SankeyView } from '@/components/canvas/SankeyView';
export { cleanSankeyFlows, pruneSankeyNodes, withSankeyNodeColor } from '@livedoc/document';
