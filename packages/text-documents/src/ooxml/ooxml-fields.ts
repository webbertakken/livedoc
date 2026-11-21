// Page numbers and page counts in WordprocessingML (docs/specs/034-text-documents/page-layout.md "Page numbers", "In
// the file"): a field whose instruction is `PAGE` or `NUMPAGES`, with no switch but a plain number format, is the
// model's field; written back as a simple field around one run holding the text last drawn.
import type { FieldKind } from '../model/blocks';

const INSTRUCTIONS: Record<string, FieldKind> = { PAGE: 'page-number', NUMPAGES: 'page-count' };
const INSTRUCTION_OF: Record<FieldKind, string> = {
  'page-number': 'PAGE',
  'page-count': 'NUMPAGES',
};
// The switches that leave the number as 1, 2, 3: keep the result's formatting, or arabic numerals.
const PLAIN_FORMATS = new Set(['MERGEFORMAT', 'ARABIC']);

/** The field an instruction is, when the model holds it in that form. */
export function ooxmlFieldKind(instruction: string): FieldKind | undefined {
  const [name, ...switches] = instruction.trim().split(/\s+/);
  const kind = name ? INSTRUCTIONS[name.toUpperCase()] : undefined;
  if (!kind || switches.length % 2 !== 0) return undefined;
  for (let i = 0; i < switches.length; i += 2)
    if (switches[i] !== '\\*' || !PLAIN_FORMATS.has(switches[i + 1]!.toUpperCase()))
      return undefined;
  return kind;
}

/** A field as a simple field around its result run. */
export const ooxmlFieldXml = (kind: FieldKind, resultRun: string): string =>
  `<w:fldSimple w:instr=" ${INSTRUCTION_OF[kind]} ">${resultRun}</w:fldSimple>`;
