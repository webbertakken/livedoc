// @livedoc/storm-reading: an Event Storming board read as a domain (docs/specs/021-event-storming/board-reading.md),
// and what the domain export builds from it (docs/specs/021-event-storming/domain-export.md).

export * from './constants';
export * from './types';
export { readBoard } from './reading';
export { withReadingDefaults, type OlderStormReading } from './reading-defaults';
export { wordsOf } from './notes';
export {
  readSuggestions,
  type StormContextSuggestion,
  type StormNoteSuggestion,
  type StormSuggestion,
} from './suggestions';
export {
  readSuggestedChanges,
  type StormNameSuggestion,
  type StormNoteChange,
  type StormSuggestedChange,
} from './suggested-changes';
export { readDeclined, type StormDeclined } from './declined';
export { formatStormView, type StormViewExtras } from './format';
export { formatReadiness, readinessOf, type Readiness } from './readiness';
export { storySteps, type StoryStep } from './story';
export { boardTerms, type BoardTerm } from './language';
export {
  resolveLaneLines,
  type LaneLine,
  type LaneRefusal,
  type ResolvedLanes,
} from './lanes/resolve';
export { placeLanePlan, type PlacedPlan } from './lanes/place';
export {
  readingChanges,
  sayReadingChange,
  type ReadingChange,
  type ReadingDifference,
  type ReadingRelation,
} from './lanes/same-reading';
export { applyLanePlan, checkLanePlan, landLanePlan, type LanePlanVerdict } from './lanes/check';
export { withLaneNames } from './lanes/names';
export { foldLanes, type Fold } from './lanes/fold';
export { readLanePlan, type StormLanePlan } from './lanes/view';
export { arrangeBoard, type Arranged } from './lanes/arrange';
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
export {
  DOMAIN_EXPORT_MAX_NOTES,
  DOMAIN_EXPORT_MAX_PREVIOUS_BYTES,
  DOMAIN_EXPORT_MAX_WRITTEN_FILES,
  ZIP_BUNDLE_FOLDER,
  parseWrittenFiles,
  previousExport,
  writeMessages,
  zipFiles,
  type PreviousExport,
  type WrittenFiles,
} from './zip';
