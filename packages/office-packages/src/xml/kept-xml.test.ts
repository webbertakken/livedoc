import { describe, expect, it } from 'vitest';
import { keptXmlOf, keptXmlWithin, serializeXml, startTagBindings } from './kept-xml';
import { childElements, parseXml, type XmlElement } from './xml-tree';

const parse = (xml: string) => {
  const parsed = parseXml(xml);
  if (!parsed.ok) throw new Error('fixture does not parse');
  return parsed;
};

// docs/specs/034-text-documents/standard-mapping.md "Kept content": kept XML is the file's own bytes, carrying the
// namespace bindings it needs.
describe('keptXmlOf', () => {
  it('slices the element exactly as the file wrote it, astral characters and entities included', () => {
    const source = '<r xmlns:a="urn:a"><a:x  k = "1">t😀&amp;<b/></a:x><y/></r>';
    const parsed = parse(source);
    const [x, y] = childElements(parsed.root) as [XmlElement, XmlElement];
    expect(keptXmlOf(parsed, x).xml).toBe('<a:x  k = "1">t😀&amp;<b/></a:x>');
    expect(keptXmlOf(parsed, y).xml).toBe('<y/>');
  });

  it('carries the bindings of the prefixes it uses, declared above it', () => {
    const parsed = parse(
      '<r xmlns:a="urn:a" xmlns:b="urn:b" xmlns:c="urn:c"><a:x b:k="1"><c:z xmlns:c="urn:c2"/></a:x></r>',
    );
    const x = childElements(parsed.root)[0]!;
    expect(keptXmlOf(parsed, x).ns).toEqual({ a: 'urn:a', b: 'urn:b' });
  });

  it('carries a default namespace in use', () => {
    const parsed = parse('<r xmlns="urn:d"><x/></r>');
    expect(keptXmlOf(parsed, childElements(parsed.root)[0]!).ns).toEqual({ '': 'urn:d' });
  });

  it('records prefixes and declarations on the tree', () => {
    const parsed = parse('<a:r xmlns:a="urn:a" a:k="v"/>');
    expect(parsed.root.prefix).toBe('a');
    expect(parsed.root.attributes[0]).toMatchObject({ prefix: 'a', local: 'k' });
    expect(parsed.root.declared).toEqual({ a: 'urn:a' });
  });
});

describe('keptXmlWithin', () => {
  it('writes kept XML as is where the root binds its prefixes the same way', () => {
    expect(keptXmlWithin({ xml: '<a:x/>', ns: { a: 'urn:a' } }, { a: 'urn:a' })).toBe('<a:x/>');
  });

  it('declares on the kept element what the root does not bind, or binds otherwise', () => {
    expect(
      keptXmlWithin({ xml: '<a:x>t</a:x>', ns: { a: 'urn:a', b: 'urn:b' } }, { a: 'urn:o' }),
    ).toBe('<a:x xmlns:a="urn:a" xmlns:b="urn:b">t</a:x>');
    expect(keptXmlWithin({ xml: '<x/>', ns: { '': 'urn:d' } }, {})).toBe('<x xmlns="urn:d"/>');
  });
});

describe('serializeXml', () => {
  it('writes an element back with its prefixes, declarations and escaped text, leaving out what is asked', () => {
    const parsed = parse('<a:r xmlns:a="urn:a" k="&quot;"><a:x/>1 &lt; 2<a:drop/></a:r>');
    expect(serializeXml(parsed.root, (e) => e.local === 'drop')).toBe(
      '<a:r xmlns:a="urn:a" k="&quot;"><a:x/>1 &lt; 2</a:r>',
    );
  });
});

// standard-mapping.md "Kept content": a start tag kept alone (a region's) needs only the bindings it names itself.
describe('startTagBindings', () => {
  it("carries its name's and attributes' prefixes declared above it, none of its children's or its own", () => {
    const parsed = parse(
      '<r xmlns="urn:d" xmlns:a="urn:a" xmlns:b="urn:b" xmlns:c="urn:c"><a:x b:k="1" n="2" xml:id="i"><c:z/></a:x><y xmlns:e="urn:e" e:k="1"/></r>',
    );
    const [x, y] = childElements(parsed.root) as [XmlElement, XmlElement];
    expect(startTagBindings(x)).toEqual({ a: 'urn:a', b: 'urn:b' });
    expect(startTagBindings(y)).toEqual({ '': 'urn:d' });
  });
});
