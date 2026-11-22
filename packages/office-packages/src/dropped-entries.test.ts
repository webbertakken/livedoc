// docs/specs/020-import-export/office-packages.md "Reading a package" step 8: what a dropped entry was.
import { describe, expect, it } from 'vitest';
import { droppedEntryKind } from './dropped-entries';

describe('droppedEntryKind', () => {
  it.each([
    ['Basic/Standard/Module1.xml', 'macros'],
    ['Scripts/python/run.py', 'macros'],
    ['xl/vbaProject.bin', 'macros'],
    ['xl/vbaData.xml', 'macros'],
    ['xl/_rels/vbaProject.bin.rels', 'macros'],
    ['META-INF/documentsignatures.xml', 'signature'],
    ['_xmlsignatures/sig1.xml', 'signature'],
    ['Thumbnails/thumbnail.png', 'thumbnail'],
    ['docProps/thumbnail.jpeg', 'thumbnail'],
    ['xl/activeX/activeX1.xml', 'object'],
    ['xl/embeddings/oleObject1.bin', 'object'],
  ])('names %s %s', (name, kind) => {
    expect(droppedEntryKind(name)).toBe(kind);
  });
});
