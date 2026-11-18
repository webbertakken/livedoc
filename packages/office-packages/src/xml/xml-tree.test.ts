import { describe, expect, it } from 'vitest';
import { attributeOf, childElement, childElements, parseXml } from './xml-tree';
import { escapeXmlAttribute, escapeXmlText } from './xml-write';

// docs/specs/020-import-export/office-packages.md "Reading a package" step 6.
describe('parseXml', () => {
  it('resolves namespaces by URI, never by prefix', () => {
    const parsed = parseXml(
      '<a:root xmlns:a="urn:x" xmlns:b="urn:y" b:at="1"><b:child/>t</a:root>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.root).toMatchObject({ uri: 'urn:x', local: 'root' });
    expect(attributeOf(parsed.root, 'urn:y', 'at')).toBe('1');
    expect(parsed.root.attributes).toHaveLength(1);
    expect(childElement(parsed.root, 'urn:y', 'child')).toBeDefined();
    expect(childElements(parsed.root)).toHaveLength(1);
  });

  it('joins text and CDATA into one text node', () => {
    const parsed = parseXml('<r>a<![CDATA[<b>]]>c</r>');
    expect(parsed.ok && parsed.root.children).toEqual(['a<b>c']);
  });

  it('refuses any DOCTYPE, before an entity can be resolved', () => {
    const xxe =
      '<?xml version="1.0"?>\n<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>\n<r>&x;</r>';
    expect(parseXml(xxe, 'content.xml')).toEqual({
      ok: false,
      rejection: 'xml_doctype_refused',
      entry: 'content.xml',
      line: 2,
    });
  });

  it('refuses malformed XML with its line', () => {
    expect(parseXml('<r>\n<a></r>')).toMatchObject({
      ok: false,
      rejection: 'xml_malformed',
      line: 2,
    });
    expect(parseXml('')).toMatchObject({ ok: false, rejection: 'xml_malformed' });
    expect(parseXml('', 'meta.xml')).toMatchObject({
      rejection: 'xml_malformed',
      entry: 'meta.xml',
    });
  });
});

// docs/specs/020-import-export/office-packages.md "Writing a package".
describe('escaping', () => {
  it('escapes markup and drops what XML cannot hold', () => {
    expect(escapeXmlText('a<b>&c\u0001\uD800\uFFFE😀')).toBe('a&lt;b&gt;&amp;c😀');
    expect(escapeXmlAttribute('"x"\t\n\r')).toBe('&quot;x&quot;&#9;&#10;&#13;');
  });
});
