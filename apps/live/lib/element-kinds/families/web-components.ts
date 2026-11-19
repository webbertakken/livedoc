// The web components family (docs/specs/016-platform/web-performance.md): banners, callouts, cards, stat rows,
// processes, site headers and a hero's caption, and where their parts sit (web-component-layout.ts in
// @livedoc/document). Loaded through the registry (lib/element-kinds); their kinds, rows and writes stay base.
export { WebComponentFace } from '@/components/canvas/web/WebComponentFace';
export { HeroCaptionCard } from '@/components/canvas/web/HeroCaptionCard';
export {
  bannerLayout,
  headerLayout,
  heroCaptionLayout,
  processLayout,
  statRowLayout,
} from '@livedoc/document';
