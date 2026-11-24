import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations } from '@livedoc/tailwind-config/sizing-guard';

const root = fileURLToPath(new URL('.', import.meta.url));

// The marketing site's chrome is on the sizing scale (docs/specs/004-interface-design/sizing.md "The other apps").
const SIZED_PATHS = ['app', 'components', 'lib'];

const SIZING_EXCEPTIONS = [
  // Drawn art: the hero's pictures of the editor, the feature and privacy art, the share images.
  'components/hero-article-page.tsx',
  'components/hero-article-page-two.tsx',
  'components/hero-article-parts.tsx',
  'components/hero-cursor.tsx',
  'components/hero-diagram-board.tsx',
  'components/hero-diagram-parts.tsx',
  'components/hero-draw-board.tsx',
  'components/hero-draw-marks.tsx',
  'components/hero-editor-chrome.tsx',
  'components/hero-editor-window.tsx',
  'components/hero-form-board.tsx',
  'components/hero-illustration-glyphs.tsx',
  'components/hero-infographic-cover.tsx',
  'components/hero-infographic-numbers.tsx',
  'components/hero-infographic-parts.tsx',
  'components/hero-infographic-timeline.tsx',
  'components/hero-mindmap-board.tsx',
  'components/hero-mode-palette.tsx',
  'components/hero-page.tsx',
  'components/hero-plan-bars.tsx',
  'components/hero-plan-board.tsx',
  'components/hero-plan-card.tsx',
  'components/hero-scenes.tsx',
  'components/hero-sheet-board.tsx',
  'components/hero-slides-board.tsx',
  'components/hero-townhall-board.tsx',
  'components/hero-townhall-kit.tsx',
  'components/hero-townhall-parts.tsx',
  'components/HeroFan.tsx',
  'components/HeroFanMine.tsx',
  'components/HeroConnectors.tsx',
  'components/FeatureArt.tsx',
  'components/PrivacyArt.tsx',
  'components/StartDrawingArt.tsx',
  'components/PromisePrism.tsx',
  'components/ai/AiChatArt.tsx',
  'components/feature-art',
  'app/opengraph-image.tsx',
  'app/twitter-image.tsx',
  'app/apple-icon.tsx',
  // Display type (D243): each page's hero headline.
  'components/Hero.tsx',
  'components/PageHero.tsx',
  'components/FeatureCategoryHero.tsx',
];

describe('marketing sizing', () => {
  it('draws every part from the sizing scale', () => {
    expect(
      formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS, except: SIZING_EXCEPTIONS })),
    ).toBe('');
  });
});
