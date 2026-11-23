import { fileURLToPath } from 'node:url';
import { DOCUMENT_FONT_TEXT_SOURCES } from './document-font-works.ts';

// A licence text a work publishes: a committed file in packages/licences/texts,
// or a file inside a package the same bundle ships.
export type TextRef =
  { label: string; file: string } | { label: string; package: string; path: string };

export type TextSource = { file: string; sources: string[]; sha256: string };

export const TEXTS_DIR = fileURLToPath(new URL('../texts/', import.meta.url));

// Every committed text, where it came from (pinned to the tag or commit the
// shipped build used) and its checksum . texts.test.ts keeps this list, the files and the tables in step.
export const TEXT_SOURCES: readonly TextSource[] = [
  {
    file: 'tensorflow-tfjs-4.22.0-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/tensorflow/tfjs/tfjs-v4.22.0/LICENSE'],
    sha256: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
  },
  {
    file: 'tensorflow-tfjs-layers-4.22.0-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/tensorflow/tfjs/tfjs-v4.22.0/tfjs-layers/LICENSE'],
    sha256: 'a79c269bc0e74de72571cea54c5f92ed74cbc6e8d1250a9fdb40357383d9dc4b',
  },
  {
    file: 'onnxruntime-1.21.0-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/microsoft/onnxruntime/v1.21.0/LICENSE'],
    sha256: '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c',
  },
  {
    file: 'onnxruntime-89f8206ba4-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/microsoft/onnxruntime/89f8206ba4/LICENSE'],
    sha256: '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c',
  },
  {
    file: 'onnxruntime-89f8206ba4-ThirdPartyNotices.txt',
    sources: [
      'https://raw.githubusercontent.com/microsoft/onnxruntime/89f8206ba4/ThirdPartyNotices.txt',
    ],
    sha256: 'e9e90971a8e75a9a8ac0c6412e29c1202d079998389915aa485f46c816c3b4cc',
  },
  {
    file: 'seedrandom-3.0.5-LICENSE.txt',
    sources: [
      'https://raw.githubusercontent.com/davidbau/seedrandom/3.0.5/README.md',
      'https://raw.githubusercontent.com/davidbau/seedrandom/3.0.5/lib/alea.js',
    ],
    sha256: '7c5139e697ee315479a9240cf92f626f90b1999388f8a794196feb4d9488381a',
  },
  {
    file: 'saxes-6.0.0-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/lddubeau/saxes/v6.0.0/LICENSE'],
    sha256: '0fac2374380621b22e6b50451057721a9c52935b02d16d106a9f04897f061d0e',
  },
  {
    file: 'resvg-js-2.6.2-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/yisibl/resvg-js/v2.6.2/LICENSE'],
    sha256: '1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5',
  },
  {
    file: 'xnnpack-5e8033a-LICENSE.txt',
    sources: [
      'https://raw.githubusercontent.com/google/XNNPACK/5e8033a72a8d0f1c2b1f06e29137cc697c6b661d/LICENSE',
    ],
    sha256: '63f519e15726f4c4f830bd958f694c84fecb4e0a4cacc527d2696bb71ef95ada',
  },
  {
    file: 'fp16-3c54eac-LICENSE.txt',
    sources: [
      'https://raw.githubusercontent.com/Maratyszcza/FP16/3c54eacb74f6f5e39077300c5564156c424d77ba/LICENSE',
    ],
    sha256: '17e4f539024be2749ee729d1e2f01d24cef12ece8c9bf18e91a4349be29c80bf',
  },
  {
    file: 'fxdiv-b408327-LICENSE.txt',
    sources: [
      'https://raw.githubusercontent.com/Maratyszcza/FXdiv/b408327ac2a15ec3e43352421954f5b1967701d1/LICENSE',
    ],
    sha256: '7cac00006125b1486a27e4801ed66357236e984c540bd323945ab7b66b078ec3',
  },
  {
    file: 'pthreadpool-545ebe9-LICENSE.txt',
    sources: [
      'https://raw.githubusercontent.com/Maratyszcza/pthreadpool/545ebe9f225aec6dca49109516fac02e973a3de2/LICENSE',
    ],
    sha256: '955604be43dc2c71940b5285e59ba60bd5132953ada8ca2292042817349d9399',
  },
  {
    file: 'cpuinfo-ed8b86a-LICENSE.txt',
    sources: [
      'https://raw.githubusercontent.com/pytorch/cpuinfo/ed8b86a253800bafdb7b25c5c399f91bff9cb1f3/LICENSE',
    ],
    sha256: '8e7e60636c3aa0cb03571a1a841ce5697f9551ff92b3c426c2561613d15ade70',
  },
  {
    file: 'clog-d5e37ad-LICENSE.txt',
    sources: [
      'https://raw.githubusercontent.com/pytorch/cpuinfo/d5e37adf1406cf899d7d9ec1d317c47506ccb970/LICENSE',
    ],
    sha256: '3a1fcacb580eebdadcdaa7c2041acd36e800d88dd249ea71fff1c9f116bccfd9',
  },
  {
    file: 'psimd-072586a-LICENSE.txt',
    sources: [
      'https://raw.githubusercontent.com/Maratyszcza/psimd/072586a71b55b7f8c584153d223e95687148a900/LICENSE',
    ],
    sha256: '984ce1e0b8ee89d234e28b960381f240e03a07a8031f35012f9c3256f56964e2',
  },
  {
    file: 'emscripten-3.1.28-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/emscripten-core/emscripten/3.1.28/LICENSE'],
    sha256: '51aea7641f81d560eb039bc97ce35e2517e2656fe8731eb49ce6a18498eb22fe',
  },
  {
    file: 'tiny-skia-0.10.0-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/RazrFalcon/tiny-skia/v0.10.0/LICENSE'],
    sha256: '6d41e05f1d54fe726997cb0334ec539f1dff50600b1d5d90462ec2b392770ced',
  },
  {
    file: 'caveat-2.000-OFL.txt',
    sources: [
      'https://raw.githubusercontent.com/googlefonts/caveat/1ad859b09aeddcc19c19ed83ab39ba47de380795/OFL.txt',
    ],
    sha256: '1f9d81d094273d82f3898a1ee8b598a717d050ecbf5ff7bede105b704880157b',
  },
  {
    file: 'inter-3.19-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/rsms/inter/v3.19/LICENSE.txt'],
    sha256: '4d7d9c95e7d7f2f0ebf76d5e0b344826b74e903a34028ee18ab54bb639e45906',
  },
  {
    file: 'lucide-1.48.0-LICENSE.txt',
    sources: ['https://unpkg.com/lucide-static@1.48.0/LICENSE'],
    sha256: 'b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57',
  },
  {
    file: 'unicode-18.0.0-LICENSE.txt',
    sources: ['https://www.unicode.org/license.txt'],
    sha256: 'e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96',
  },
  {
    file: 'drawio-31.7.0-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/jgraph/drawio/v31.7.0/LICENSE'],
    sha256: 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4',
  },
  {
    file: 'feather-4.29.2-LICENSE.txt',
    sources: ['https://raw.githubusercontent.com/feathericons/feather/v4.29.2/LICENSE'],
    sha256: '308028e93fcf84972523cdf6e616f73168546b4953895f516d01287f16fe7bee',
  },
  // What is compiled into the PDF engine's reader (embedded-works.ts): each text from the revision its build pins.
  {
    file: 'agg-2.3-copying.txt',
    sources: [
      'https://raw.githubusercontent.com/embedpdf/pdfium/73a041a5c1aaffa09ebb64f1981ff501cb91a41c/third_party/agg23/copying',
    ],
    sha256: '0e16f9c2285583269242e94c6f502de0c9910dfcbbc7b386e236cdf29ecd4333',
  },
  {
    file: 'lcms-2.15-LICENSE.txt',
    sources: [
      'https://raw.githubusercontent.com/embedpdf/pdfium/73a041a5c1aaffa09ebb64f1981ff501cb91a41c/third_party/lcms/LICENSE',
    ],
    sha256: '6dbd60437f8ef91d8de1f08ad75882547fd4931bfcc3566a0735f28db1484d31',
  },
  {
    file: 'openjpeg-2.5.4-LICENSE.txt',
    sources: [
      'https://raw.githubusercontent.com/embedpdf/pdfium/73a041a5c1aaffa09ebb64f1981ff501cb91a41c/third_party/libopenjpeg/LICENSE',
    ],
    sha256: 'a6af136f3e15038a666b61f376612a07d9a4e48cb7c01adbf3e33b3f14ab49b6',
  },
  {
    file: 'freetype-b91f75b-FTL.txt',
    sources: [
      'https://chromium.googlesource.com/chromium/src/third_party/freetype2/+/b91f75bd02db43b06d634591eb286d3eb0ce3b65/docs/FTL.TXT',
    ],
    sha256: '5a5ee54c5001bbad1cdc1a57cc3dd4c42199b2da09d39c7ee41fab002d02967f',
  },
  {
    file: 'libpng-1.6.43-LICENSE.txt',
    sources: [
      'https://chromium.googlesource.com/chromium/src/third_party/libpng/+/172f83835c98264e6eefdbe8ae82dc08be337ad0/LICENSE',
    ],
    sha256: 'bf5e22b9dce8464064ae17a48ea1133c3369ac9e1d80ef9e320e5219aa14ea9b',
  },
  {
    file: 'zlib-980253c-LICENSE.txt',
    sources: [
      'https://chromium.googlesource.com/chromium/src/third_party/zlib/+/980253c1cc835c893c57b5cfc10c5b942e10bc46/LICENSE',
    ],
    sha256: 'e1cfcc55c325b3f78cf55df9664abaa066e2271dffe8213347d9fccdfbac8f2c',
  },
  {
    file: 'libjpeg-turbo-3.1.0-LICENSE.txt',
    sources: [
      'https://chromium.googlesource.com/chromium/deps/libjpeg_turbo/+/6bb85251a8382b5e07f635a981ac685cc5ab5053/LICENSE.md',
    ],
    sha256: '96f5b328adbb78eeaaec6980d73fd558cb1e4d62560ed615646bc3cf5e532430',
  },
  {
    file: 'icu-77-1-LICENSE.txt',
    sources: [
      'https://chromium.googlesource.com/chromium/deps/icu/+/a86a32e67b8d1384b33f8fa48c83a6079b86f8cd/LICENSE',
    ],
    sha256: '451167c55c0fa447cc2d5632714f5e3c567fe4f1e1badefab2c1333852198aca',
  },
  {
    file: 'abseil-675d3d3-LICENSE.txt',
    sources: [
      'https://chromium.googlesource.com/chromium/src/third_party/abseil-cpp/+/675d3d37ecbec78fd51378c6774c45715b1e4382/LICENSE',
    ],
    sha256: 'aac73b3148f6d1d7111dbca32099f68d26c644c6813ae1e4f05f6579aa2663fe',
  },
  {
    file: 'fast-float-7.0.0-LICENSE-MIT.txt',
    sources: [
      'https://chromium.googlesource.com/external/github.com/fastfloat/fast_float/+/cb1d42aaa1e14b09e1452cfdef373d051b8c02a4/LICENSE-MIT',
    ],
    sha256: 'e562f3f974ced7e69dd1db77b820b36bcf8f30377f1aa105723fba449c53c4e6',
  },
  // The served document fonts (document-font-works.ts).
  ...DOCUMENT_FONT_TEXT_SOURCES,
];
