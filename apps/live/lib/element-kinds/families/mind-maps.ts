// The mind maps family (docs/specs/016-platform/web-performance.md): a mind node's faces, its root's halo and its
// arrangement buttons, and the model parts only a map on the board uses: growing it, laying it out, connecting,
// converting, arranging and dropping nodes, and its outline. Read through the registry (lib/element-kinds) once a
// mind node is drawn, never imported statically.
export { PersonNodeFace } from '@/components/canvas/PersonNodeFace';
export { MindRootHalo } from '@/components/canvas/MindRootHalo';
export { MindArrangeButtons } from '@/components/canvas/MindArrangeButtons';
export {
  applyMindMoves,
  applyMindOutline,
  autoPositionMindNodes,
  connectMindNodes,
  fitMindNodeHeight,
  groupMindNodes,
  insertMindParent,
  isMindTreeTidy,
  joinConvertedMindNodes,
  mindHaloRoots,
  mindOutlineText,
  parseMindOutline,
  planMindDrop,
  planMindGrowth,
  previewMindDrop,
  relayoutAfterRemoval,
  relayoutMindMap,
  setMindDirection,
  setMindNumbered,
  summariseMindOutline,
  tidyMindBranches,
  ungroupMindNodes,
} from '@livedoc/document';
