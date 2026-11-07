// @livedoc/explorer-lens: the Explorer's one filter state (docs/specs/013-workspace/explorer-filters.md,
// docs/specs/013-workspace/explorer-filters.md). Pure; no DOM, no React, no fetch.

export * from './dimensions';
export * from './labels';
export * from './match';
export * from './parse';
export * from './search-fold';
export * from './serialise';
export * from './suggest';
export * from './telemetry';
export { foldText, TITLE_CACHE_LIMIT } from './title-fold';
export * from './title-match';
export {
  allowedTypos,
  TWO_TYPO_MIN_WORD_LENGTH,
  TYPO_MAX_TARGET,
  TYPO_MIN_WORD_LENGTH,
} from './typo-distance';
export * from './types';
export * from './url';
export * from './view-models';
