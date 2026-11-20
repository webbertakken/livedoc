// The document fonts LiveDoc serves (docs/specs/004-interface-design/fonts.md "Served from LiveDoc"): each family's
// WOFF2 faces, bundled by the editor from its Fontsource package, with the licence text the package carries (pinned to
// the published package). Generated from apps/live/node_modules/@fontsource; one row per package.
import type { TextSource } from './texts.ts';

export type DocumentFontWork = {
  id: string;
  name: string;
  version: string;
  licence: string;
  file: string;
  sha256: string;
};

export const DOCUMENT_FONT_WORKS: readonly DocumentFontWork[] = [
  {
    id: 'amatic-sc',
    name: 'Amatic SC',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-amatic-sc-5.3.0-LICENSE.txt',
    sha256: '7ae6d8e98e84ecb99fdec0c36485d1b0c5f61202613f4250b1449c4320bd071c',
  },
  {
    id: 'caveat',
    name: 'Caveat',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-caveat-5.3.0-LICENSE.txt',
    sha256: '163a2b400e16916ad3196296c946c526d0efce6baf22a2164269ffc62fb9f671',
  },
  {
    id: 'comfortaa',
    name: 'Comfortaa',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-comfortaa-5.3.0-LICENSE.txt',
    sha256: 'c89ab37b152eaa07dc5e8d100d6ffb968226a0c4988bdff16a97e73174e9c77c',
  },
  {
    id: 'eb-garamond',
    name: 'EB Garamond',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-eb-garamond-5.3.0-LICENSE.txt',
    sha256: 'f03c8eda63076cd52317dcd40aa04db8472d4cb592dfaafa385129dfdafc7f9c',
  },
  {
    id: 'lexend',
    name: 'Lexend',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-lexend-5.3.0-LICENSE.txt',
    sha256: 'cdfed8f91b0660b004befb744757918b7c7d40dc2201b6c6d0a86b2fab9408f8',
  },
  {
    id: 'lobster',
    name: 'Lobster',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-lobster-5.3.0-LICENSE.txt',
    sha256: '73e006e6fc23df5f07e0976d78d49c94aece9ce90cdb2522279a6d79eaa7bbd3',
  },
  {
    id: 'lora',
    name: 'Lora',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-lora-5.3.0-LICENSE.txt',
    sha256: '948aed765160f7b974105606c21994715a171f89fca48e57bf1e0a23aca0bef1',
  },
  {
    id: 'merriweather',
    name: 'Merriweather',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-merriweather-5.3.0-LICENSE.txt',
    sha256: 'aa677c3f7682d9c4f7aa48fae3f3b9d0f8d70ac6ab47b9bc20a9cc2879e15af0',
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-montserrat-5.3.0-LICENSE.txt',
    sha256: 'f429f739351287574c0c3175a9222bb3e49c7cad3f568a04f2c08d74c107724e',
  },
  {
    id: 'nunito',
    name: 'Nunito',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-nunito-5.3.0-LICENSE.txt',
    sha256: '40991bfa02ac620aae16dc527f3c47765a25e43f270d4c301ee6ab663a8d9015',
  },
  {
    id: 'oswald',
    name: 'Oswald',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-oswald-5.3.0-LICENSE.txt',
    sha256: '23916cdee678823c3c517c699cb2e043088de0d46c959eeaa168b54bb84534df',
  },
  {
    id: 'pacifico',
    name: 'Pacifico',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-pacifico-5.3.0-LICENSE.txt',
    sha256: 'e1b964e3f56697598c46363a8864f0a7b883c86a0c01a9a6a4e90e6949d60ba2',
  },
  {
    id: 'playfair-display',
    name: 'Playfair Display',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-playfair-display-5.3.0-LICENSE.txt',
    sha256: 'c052aafd2a71e90bcee6e69f475029d430a10d548c08ffcae350171f0e9668b1',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-roboto-5.3.0-LICENSE.txt',
    sha256: '84044c09058803d87a241bd28abb4ce30a433d7db9c27a04da3efad6a0ca539c',
  },
  {
    id: 'roboto-mono',
    name: 'Roboto Mono',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-roboto-mono-5.3.0-LICENSE.txt',
    sha256: 'b489132782690f2cc1ed23ab56d7057bbb08c42573603e8e704ae2e2ea9c8216',
  },
  {
    id: 'roboto-serif',
    name: 'Roboto Serif',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-roboto-serif-5.3.0-LICENSE.txt',
    sha256: '5b1c53325498e573f825dbd6e9a8a4f12d259609268c99dde7ff37089830c56e',
  },
  {
    id: 'spectral',
    name: 'Spectral',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-spectral-5.3.0-LICENSE.txt',
    sha256: '22ca006c8a0edb513ee188722d72e9f65cbb19f07abb71bd7a898bc926503609',
  },
  {
    id: 'arimo',
    name: 'Arimo',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-arimo-5.3.0-LICENSE.txt',
    sha256: 'ee316340ba281306a746941edde09288dda2438879b2f30ed8ef914ec0b9079e',
  },
  {
    id: 'tinos',
    name: 'Tinos',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-tinos-5.3.0-LICENSE.txt',
    sha256: 'af8e3086059110e7ae067c503ffa5394be76d72a68990d096629a0ad72898d54',
  },
  {
    id: 'cousine',
    name: 'Cousine',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-cousine-5.3.0-LICENSE.txt',
    sha256: '619e4b17e5fae2dfa490df8cda90aa04634cbcddc0ef870131097d9450119547',
  },
  {
    id: 'carlito',
    name: 'Carlito',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-carlito-5.3.0-LICENSE.txt',
    sha256: 'da106485c940d21672382473486ea643c08be09321e6946545d2af982cdf34a8',
  },
  {
    id: 'caladea',
    name: 'Caladea',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-caladea-5.3.0-LICENSE.txt',
    sha256: '8a9c2e989ca678713e01f4da6fb1b05bcfa16f70e127a6ae67b5de234bd1481b',
  },
  {
    id: 'gelasio',
    name: 'Gelasio',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-gelasio-5.3.0-LICENSE.txt',
    sha256: '92a43077648051e82bab440620283dfb16de5520f8b96c7db890cb69d79f6bb8',
  },
  {
    id: 'comic-neue',
    name: 'Comic Neue',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-comic-neue-5.3.0-LICENSE.txt',
    sha256: 'b726facc10345ba22b2e4531984186f2334f55540aacef3e7e1c785e19f581fd',
  },
  {
    id: 'anton',
    name: 'Anton',
    version: '5.3.0',
    licence: 'OFL-1.1',
    file: 'fontsource-anton-5.3.0-LICENSE.txt',
    sha256: '9267baca92b7a7ce9db6dd9e6cc32c9fe3ddf1ac96e421d5f87c5746b9089d6a',
  },
];

/** Where each text came from: the published package, pinned to its version. */
export const DOCUMENT_FONT_TEXT_SOURCES: readonly TextSource[] = DOCUMENT_FONT_WORKS.map(
  (work) => ({
    file: work.file,
    sources: [`https://cdn.jsdelivr.net/npm/@fontsource/${work.id}@${work.version}/LICENSE`],
    sha256: work.sha256,
  }),
);
