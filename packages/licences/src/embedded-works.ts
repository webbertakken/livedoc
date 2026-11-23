import { DOCUMENT_FONT_WORKS } from './document-font-works.ts';
import type { TextRef } from './texts.ts';

// Material a bundler cannot see into: libraries compiled into an emitted
// WebAssembly binary or font, and third-party geometry vendored into our own
// source (docs/specs/002-project-scope/third-party-licences.md "What counts as
// shipped"). Every emitted binary asset must match at least one entry.
export type EmbeddedWork = {
  id: string;
  name: string;
  version: string;
  licence: string;
  carrier: string;
  homepage: string;
  trigger: { assets: RegExp } | { sources: string[] };
  texts: TextRef[];
};

const TFJS_WASM = /^tfjs-backend-wasm(-simd|-threaded-simd)?\.[\w-]+\.wasm$/;
const ORT_WASM = /^ort-wasm[\w.-]*\.wasm$/;
const WEBP_WASM = /^webp_(enc|dec)(_simd)?\.[\w-]+\.wasm$/;
// The PDF engine's reader (docs/specs/035-pdf-documents/security.md "The boundary"), as the editor's build emits it.
const PDFIUM_WASM = /^pdfium\.[\w-]+\.wasm$/;
const PDFIUM_CARRIER = '@embedpdf/pdfium (WebAssembly)';
const TFJS_CARRIER = '@tensorflow/tfjs-backend-wasm (WebAssembly)';

const text = (file: string): TextRef[] => [{ label: 'LICENSE', file }];

export const EMBEDDED_WORKS: readonly EmbeddedWork[] = [
  // The TensorFlow.js WASM backend, built from tfjs-v4.22.0's WORKSPACE.
  {
    id: 'xnnpack',
    name: 'XNNPACK',
    version: '5e8033a',
    licence: 'BSD-3-Clause',
    carrier: TFJS_CARRIER,
    homepage: 'https://github.com/google/XNNPACK',
    trigger: { assets: TFJS_WASM },
    texts: text('xnnpack-5e8033a-LICENSE.txt'),
  },
  {
    id: 'pthreadpool',
    name: 'pthreadpool',
    version: '545ebe9',
    licence: 'BSD-2-Clause',
    carrier: TFJS_CARRIER,
    homepage: 'https://github.com/Maratyszcza/pthreadpool',
    trigger: { assets: TFJS_WASM },
    texts: text('pthreadpool-545ebe9-LICENSE.txt'),
  },
  {
    id: 'cpuinfo',
    name: 'cpuinfo',
    version: 'ed8b86a',
    licence: 'BSD-2-Clause',
    carrier: TFJS_CARRIER,
    homepage: 'https://github.com/pytorch/cpuinfo',
    trigger: { assets: TFJS_WASM },
    texts: text('cpuinfo-ed8b86a-LICENSE.txt'),
  },
  {
    id: 'clog',
    name: 'clog (cpuinfo)',
    version: 'd5e37ad',
    licence: 'BSD-2-Clause',
    carrier: TFJS_CARRIER,
    homepage: 'https://github.com/pytorch/cpuinfo',
    trigger: { assets: TFJS_WASM },
    texts: text('clog-d5e37ad-LICENSE.txt'),
  },
  {
    id: 'fp16',
    name: 'FP16',
    version: '3c54eac',
    licence: 'MIT',
    carrier: TFJS_CARRIER,
    homepage: 'https://github.com/Maratyszcza/FP16',
    trigger: { assets: TFJS_WASM },
    texts: text('fp16-3c54eac-LICENSE.txt'),
  },
  {
    id: 'fxdiv',
    name: 'FXdiv',
    version: 'b408327',
    licence: 'MIT',
    carrier: TFJS_CARRIER,
    homepage: 'https://github.com/Maratyszcza/FXdiv',
    trigger: { assets: TFJS_WASM },
    texts: text('fxdiv-b408327-LICENSE.txt'),
  },
  {
    id: 'psimd',
    name: 'psimd',
    version: '072586a',
    licence: 'MIT',
    carrier: TFJS_CARRIER,
    homepage: 'https://github.com/Maratyszcza/psimd',
    trigger: { assets: TFJS_WASM },
    texts: text('psimd-072586a-LICENSE.txt'),
  },
  // ONNX Runtime's own notices cover the libraries compiled into its WASM; the
  // onnxruntime-web package entry carries only its MIT licence.
  {
    id: 'onnxruntime',
    name: 'ONNX Runtime (WebAssembly)',
    version: '89f8206',
    licence: 'MIT',
    carrier: 'onnxruntime-web (WebAssembly)',
    homepage: 'https://github.com/microsoft/onnxruntime',
    trigger: { assets: ORT_WASM },
    texts: [
      { label: 'LICENSE', file: 'onnxruntime-89f8206ba4-LICENSE.txt' },
      { label: 'ThirdPartyNotices.txt', file: 'onnxruntime-89f8206ba4-ThirdPartyNotices.txt' },
    ],
  },
  // libwebp inside @jsquash/webp, built from libwebp d2e245e (jSquash's codec Makefile).
  {
    id: 'libwebp',
    name: 'libwebp',
    version: 'd2e245e',
    licence: 'BSD-3-Clause',
    carrier: '@jsquash/webp (WebAssembly)',
    homepage: 'https://github.com/webmproject/libwebp',
    trigger: { assets: WEBP_WASM },
    texts: [{ label: 'COPYING', package: '@jsquash/webp', path: 'codec/LICENSE.codec.md' }],
  },
  // PDFium, as @embedpdf/pdfium 2.15.1 builds it: the fork embedpdf/pdfium at 73a041a (the package's `pdfium-src`
  // submodule on its v2 branch), with the GN arguments of the package's scripts/build.sh (no Skia, no XFA, no V8, no
  // partition allocator). The works are the third_party targets that build links (core/fxcodec, core/fxge and
  // core/fxcrt's BUILD.gn at that revision): versions from each one's README.pdfium or README.chromium, and for those
  // DEPS fetches, the revision DEPS pins. AGG 2.3's permission notice has no SPDX id of its own; `MIT` is how
  // PDFium's README.pdfium classes it.
  {
    id: 'pdfium',
    name: 'PDFium',
    version: '73a041a',
    licence: 'BSD-3-Clause AND Apache-2.0',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://pdfium.googlesource.com/pdfium/',
    trigger: { assets: PDFIUM_WASM },
    texts: [{ label: 'LICENSE', package: '@embedpdf/pdfium', path: 'LICENSE.pdfium' }],
  },
  {
    id: 'pdfium-agg',
    name: 'Anti-Grain Geometry',
    version: '2.3',
    licence: 'MIT',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://sourceforge.net/projects/agg/',
    trigger: { assets: PDFIUM_WASM },
    texts: text('agg-2.3-copying.txt'),
  },
  {
    id: 'pdfium-lcms',
    name: 'Little CMS',
    version: '2.15',
    licence: 'MIT',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://github.com/mm2/Little-CMS',
    trigger: { assets: PDFIUM_WASM },
    texts: text('lcms-2.15-LICENSE.txt'),
  },
  {
    id: 'pdfium-openjpeg',
    name: 'OpenJPEG',
    version: '2.5.4',
    licence: 'BSD-2-Clause',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://github.com/uclouvain/openjpeg',
    trigger: { assets: PDFIUM_WASM },
    texts: text('openjpeg-2.5.4-LICENSE.txt'),
  },
  {
    id: 'pdfium-freetype',
    name: 'FreeType',
    version: 'b91f75b',
    licence: 'FTL',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://gitlab.freedesktop.org/freetype/freetype',
    trigger: { assets: PDFIUM_WASM },
    texts: text('freetype-b91f75b-FTL.txt'),
  },
  {
    id: 'pdfium-libpng',
    name: 'libpng',
    version: '1.6.43',
    licence: 'libpng-2.0',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://github.com/pnggroup/libpng',
    trigger: { assets: PDFIUM_WASM },
    texts: text('libpng-1.6.43-LICENSE.txt'),
  },
  {
    id: 'pdfium-zlib',
    name: 'zlib',
    version: '980253c',
    licence: 'Zlib',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://github.com/madler/zlib',
    trigger: { assets: PDFIUM_WASM },
    texts: text('zlib-980253c-LICENSE.txt'),
  },
  {
    id: 'pdfium-libjpeg-turbo',
    name: 'libjpeg-turbo',
    version: '3.1.0',
    licence: 'IJG AND BSD-3-Clause AND Zlib',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://github.com/libjpeg-turbo/libjpeg-turbo',
    trigger: { assets: PDFIUM_WASM },
    texts: text('libjpeg-turbo-3.1.0-LICENSE.txt'),
  },
  {
    id: 'pdfium-icu',
    name: 'ICU',
    version: '77-1',
    licence: 'Unicode-3.0',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://github.com/unicode-org/icu',
    trigger: { assets: PDFIUM_WASM },
    texts: text('icu-77-1-LICENSE.txt'),
  },
  {
    id: 'pdfium-abseil',
    name: 'Abseil',
    version: '675d3d3',
    licence: 'Apache-2.0',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://github.com/abseil/abseil-cpp',
    trigger: { assets: PDFIUM_WASM },
    texts: text('abseil-675d3d3-LICENSE.txt'),
  },
  {
    id: 'pdfium-fast-float',
    name: 'fast_float',
    version: '7.0.0',
    licence: 'MIT',
    carrier: PDFIUM_CARRIER,
    homepage: 'https://github.com/fastfloat/fast_float',
    trigger: { assets: PDFIUM_WASM },
    texts: text('fast-float-7.0.0-LICENSE-MIT.txt'),
  },
  // The runtime Emscripten compiles into each of those modules. Its licence
  // text has not changed across the 3.x releases they were built with.
  {
    id: 'emscripten',
    name: 'Emscripten runtime',
    version: '3.x',
    licence: 'MIT OR NCSA',
    carrier: 'WebAssembly modules compiled with Emscripten',
    homepage: 'https://github.com/emscripten-core/emscripten',
    trigger: {
      assets: new RegExp(
        `${TFJS_WASM.source}|${ORT_WASM.source}|${WEBP_WASM.source}|${PDFIUM_WASM.source}`,
      ),
    },
    texts: text('emscripten-3.1.28-LICENSE.txt'),
  },
  // The mcp worker's SVG renderer: resvg 0.34 and its rasteriser, compiled by resvg-js 2.6.2.
  {
    id: 'resvg',
    name: 'resvg',
    version: '0.34.0',
    licence: 'MPL-2.0',
    carrier: '@resvg/resvg-wasm (WebAssembly)',
    homepage: 'https://github.com/linebender/resvg',
    trigger: { assets: /(^|-)index_bg\.wasm$/ },
    texts: text('resvg-js-2.6.2-LICENSE.txt'),
  },
  {
    id: 'tiny-skia',
    name: 'tiny-skia',
    version: '0.10.0',
    licence: 'BSD-3-Clause',
    carrier: '@resvg/resvg-wasm (WebAssembly)',
    homepage: 'https://github.com/linebender/tiny-skia',
    trigger: { assets: /(^|-)index_bg\.wasm$/ },
    texts: text('tiny-skia-0.10.0-LICENSE.txt'),
  },
  // The hand face the marketing hero's Draw window writes in, a subset of only its glyphs
  // (apps/marketing/app/hero-scenes/caveat-hero.woff2).
  {
    id: 'caveat',
    name: 'Caveat',
    version: '2.000',
    licence: 'OFL-1.1',
    carrier: 'the marketing site (font)',
    homepage: 'https://github.com/googlefonts/caveat',
    trigger: { assets: /^caveat-hero\.[\w-]+\.woff2$/ },
    texts: [{ label: 'OFL', file: 'caveat-2.000-OFL.txt' }],
  },
  // The typeface the MCP server and the CLI render PNG previews with (packages/render-png/fonts).
  {
    id: 'inter',
    name: 'Inter',
    version: '3.19',
    licence: 'OFL-1.1',
    carrier: 'the MCP server and the CLI (font)',
    homepage: 'https://github.com/rsms/inter',
    trigger: { assets: /(^|-)Inter-(Regular\.ttf|Bold\.otf)$/ },
    texts: text('inter-3.19-LICENSE.txt'),
  },
  // draw.io's view geometry (routes, perimeters, label points) ported into the draw.io importer.
  {
    id: 'drawio-mxgraph',
    name: 'draw.io (mxGraph view geometry)',
    version: '31.7.0',
    licence: 'Apache-2.0',
    carrier: 'LiveDoc source (draw.io import)',
    homepage: 'https://github.com/jgraph/drawio',
    trigger: {
      sources: [
        'apps/live/lib/drawio/route/edge-styles.ts',
        'apps/live/lib/drawio/route/geometry.ts',
        'apps/live/lib/drawio/route/label.ts',
        'apps/live/lib/drawio/route/orth-connector.ts',
        'apps/live/lib/drawio/route/page.ts',
        'apps/live/lib/drawio/route/perimeters.ts',
        'apps/live/lib/drawio/route/segment-connector.ts',
        'apps/live/lib/drawio/route/state.ts',
        'apps/live/lib/drawio/route/view.ts',
      ],
    },
    texts: text('drawio-31.7.0-LICENSE.txt'),
  },
  // Unicode's Character Database (names, blocks and abbreviations), generated into the special characters catalogue
  // (docs/specs/034-text-documents/objects.md "Special characters") by apps/live/scripts/special-characters-catalogue.ts.
  {
    id: 'unicode-ucd',
    name: 'Unicode Character Database',
    version: '18.0.0',
    licence: 'Unicode-3.0',
    carrier: 'LiveDoc source (special characters)',
    homepage: 'https://www.unicode.org/ucd/',
    trigger: { sources: ['apps/live/lib/office/special-characters.json'] },
    texts: text('unicode-18.0.0-LICENSE.txt'),
  },
  // Emojibase's English emoji data (names, tags, shortcodes, groups), generated into the emoji catalogue
  // (docs/specs/034-text-documents/objects.md "Emoji") by apps/live/scripts/emoji-catalogue.ts.
  {
    id: 'emojibase-data',
    name: 'emojibase-data',
    version: '18.0.0',
    licence: 'MIT',
    carrier: 'LiveDoc source (emoji)',
    homepage: 'https://emojibase.dev',
    trigger: { sources: ['apps/live/lib/office/emoji.json'] },
    texts: text('emojibase-data-18.0.0-LICENSE.txt'),
  },
  // Icon geometry vendored into our own source (packages/icons).
  {
    id: 'lucide',
    name: 'Lucide',
    version: '1.48.0',
    licence: 'ISC AND MIT',
    carrier: 'LiveDoc source (icons)',
    homepage: 'https://lucide.dev',
    trigger: { sources: ['packages/icons/src/lucide.generated.ts'] },
    texts: text('lucide-1.48.0-LICENSE.txt'),
  },
  {
    id: 'feather',
    name: 'Feather',
    version: '4.29.2',
    licence: 'MIT',
    carrier: 'LiveDoc source (icons)',
    homepage: 'https://feathericons.com',
    trigger: {
      sources: [
        'packages/icons/src/icon-catalog-1.ts',
        'packages/icons/src/icon-catalog-2.ts',
        'packages/icons/src/icon-catalog-3.ts',
      ],
    },
    texts: text('feather-4.29.2-LICENSE.txt'),
  },
  // The document fonts the editor serves (docs/specs/004-interface-design/fonts.md "Served from LiveDoc"), each a
  // family's Latin faces from its Fontsource package (apps/live/app/document-fonts.css).
  ...DOCUMENT_FONT_WORKS.map((work): EmbeddedWork => ({
    id: `fontsource-${work.id}`,
    name: work.name,
    version: work.version,
    licence: work.licence,
    carrier: 'the editor (font)',
    homepage: `https://fontsource.org/fonts/${work.id}`,
    trigger: {
      assets: new RegExp(`^${work.id}-latin(-ext)?-[47]00-(normal|italic)\\.[\\w-]+\\.woff2$`),
    },
    texts: [{ label: 'LICENSE', file: work.file }],
  })),
];
