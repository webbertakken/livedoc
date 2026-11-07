import type { LicencesManifest } from './contract.ts';

// The exported licences.html may not exceed this many bytes per work listed (D14): 1.5 times the page
// as first measured (173.5 KB for 54 works), so the budget grows with the dependencies it lists. Inlined licence
// texts are refused directly (`inlinedTexts`), not left to the budget to notice.
export const LICENCES_HTML_BYTES_PER_WORK = 4_820;

export function licencesHtmlBudget(manifest: LicencesManifest): number {
  const works = manifest.sections.reduce((sum, section) => sum + section.works.length, 0);
  return LICENCES_HTML_BYTES_PER_WORK * Math.max(works, 1);
}

// A line of a licence text distinctive enough that finding it in the page means the text was inlined: the first
// line of at least 40 characters that HTML escaping leaves unchanged. Null for a text with no such line.
export function textFingerprint(text: string): string | null {
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.length >= 40 && /^[A-Za-z0-9 ,.;:()-]+$/.test(line)) return line;
  }
  return null;
}

type Export = {
  manifest: LicencesManifest;
  // undefined when the page was not exported.
  htmlBytes: number | undefined;
  exportedTexts: string[];
  // Hashes of texts whose fingerprint appears in licences.html.
  inlinedTexts: string[];
};

// What is wrong with an exported /licences page; empty when nothing is.
export function checkExport({
  manifest,
  htmlBytes,
  exportedTexts,
  inlinedTexts,
}: Export): string[] {
  const problems: string[] = [];
  const hashes = Object.keys(manifest.texts);
  if (hashes.length === 0) problems.push('the manifest lists no texts');
  if (htmlBytes === undefined) problems.push('licences.html was not exported');
  else if (htmlBytes > licencesHtmlBudget(manifest)) {
    problems.push(`licences.html is ${htmlBytes} bytes, over ${licencesHtmlBudget(manifest)}`);
  }
  for (const hash of inlinedTexts) problems.push(`text ${hash}.txt is inlined in licences.html`);
  const exported = new Set(exportedTexts);
  for (const hash of hashes) {
    if (!exported.has(`${hash}.txt`)) problems.push(`text ${hash}.txt was not exported`);
  }
  return problems;
}
