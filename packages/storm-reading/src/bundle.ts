// The domain export bundle (docs/specs/021-event-storming/domain-export.md "The bundle"): what every way of exporting
// produces before a model writes anything. Pure, so the CLI, the MCP and the zip hand out the same files.

import { BRIEF_VERSION, renderBrief } from './brief/convert';
import type { DomainLanguage } from './brief/languages';
import { diffReadings, formatChanges, type StormChanges } from './changes';
import { formatStormView } from './format';
import { STORM_SCHEMA, type StormReading } from './types';

export const EXPORT_MANIFEST_SCHEMA = 'livedoc.storm-export/1';

export type ExportManifest = {
  schema: typeof EXPORT_MANIFEST_SCHEMA;
  board: { documentId: string; tabId: string; name: string; rev: number | null };
  // Null when the agent identifies it from the repository it works in (the MCP without `language`).
  language: DomainLanguage | null;
  // Why that language: a project file, an earlier export, or the caller's choice.
  because: string;
  livedoc: string;
  exportedAt: string;
  brief: number;
};

export type BundleInput = {
  reading: StormReading;
  // The earlier export's reading, when there is one.
  previous: StormReading | null;
  // Null when the agent identifies it from the repository it works in (the MCP without `language`).
  language: DomainLanguage | null;
  because: string;
  board: ExportManifest['board'];
  livedoc: string;
  exportedAt: string;
};

export type Bundle = {
  // File name to contents, in the order they are listed.
  files: Record<string, string>;
  changes: StormChanges | null;
  manifest: ExportManifest;
};

export function buildExportBundle(input: BundleInput): Bundle {
  const { reading, previous } = input;
  const manifest: ExportManifest = {
    schema: EXPORT_MANIFEST_SCHEMA,
    board: input.board,
    language: input.language,
    because: input.because,
    livedoc: input.livedoc,
    exportedAt: input.exportedAt,
    brief: BRIEF_VERSION,
  };
  const changes = previous ? diffReadings(previous, reading) : null;
  const files: Record<string, string> = {
    'storm.json': `${JSON.stringify(reading, null, 2)}\n`,
    'storm.md': `${formatStormView(reading, []).join('\n')}\n`,
    ...(changes && previous ? { 'CHANGES.md': formatChanges(changes, previous, reading) } : {}),
    'CONVERT.md': renderBrief(input.language),
    'export.json': `${JSON.stringify(manifest, null, 2)}\n`,
  };
  return { files, changes, manifest };
}

// An earlier export's storm.json, or null when the text is not one.
export function parsePreviousReading(text: string): StormReading | null {
  try {
    const value: unknown = JSON.parse(text);
    const reading = value as Partial<StormReading>;
    if (reading.schema !== STORM_SCHEMA || !Array.isArray(reading.notes) || !reading.relations)
      return null;
    // A reading made before candidate contexts has none.
    return {
      ...(value as StormReading),
      contexts: Array.isArray(reading.contexts) ? reading.contexts : [],
    };
  } catch {
    return null;
  }
}

// An earlier export's manifest, or null.
export function parseManifest(text: string): ExportManifest | null {
  try {
    const value = JSON.parse(text) as Partial<ExportManifest>;
    return value.schema === EXPORT_MANIFEST_SCHEMA ? (value as ExportManifest) : null;
  } catch {
    return null;
  }
}

// The folder a board's bundle lives in: its name as a slug, else its tab id.
export function bundleFolderName(boardName: string, tabId: string): string {
  const slug = boardName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-')
    .slice(0, 48);
  return slug || tabId;
}
