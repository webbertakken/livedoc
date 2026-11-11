// @livedoc/storm-reading: an Event Storming board read as a domain (docs/specs/021-event-storming/board-reading.md),
// and what the domain export builds from it (docs/specs/021-event-storming/domain-export.md).

export * from './constants';
export * from './types';
export { readBoard } from './reading';
export { wordsOf } from './notes';
export { readSuggestions, type StormSuggestion } from './suggestions';
export { formatStormView } from './format';
export { diffReadings, formatChanges, hasChanges, type StormChanges } from './changes';
export {
  buildExportBundle,
  bundleFolderName,
  parseManifest,
  parsePreviousReading,
  EXPORT_MANIFEST_SCHEMA,
  type Bundle,
  type BundleInput,
  type ExportManifest,
} from './bundle';
export { BRIEF_VERSION, renderBrief } from './brief/convert';
export {
  DOMAIN_EXPORT_LANGUAGES,
  DOMAIN_LANGUAGE_MARKERS,
  LANGUAGE_IDIOMS,
  detectDomainLanguage,
  isDomainLanguage,
  type DomainLanguage,
  type LanguageVerdict,
} from './brief/languages';
