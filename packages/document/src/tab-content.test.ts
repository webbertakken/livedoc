import { describe, expect, it } from 'vitest';
import type { Element, Tab } from './index';
import { tabHoldsContent } from './tab-content';

// A tab holds content by the empty document clean-up's test (docs/specs/013-workspace/empty-document-cleanup.md
// "Which documents"): an element, an article, a form or a filled dashboard slot. Deleting a document's last tab asks
// first only when it holds content (docs/specs/006-document/document-structure.md "The last tab").

const blank = (over: Partial<Tab> = {}): Tab => ({ id: 't', name: 'Tab 1', elements: [], ...over });
const box = {
  id: 'e',
  type: 'shape',
  shape: 'rect',
  x: 0,
  y: 0,
  w: 10,
  h: 10,
} as unknown as Element;

describe('tabHoldsContent', () => {
  it('reads a tab with nothing in it as empty, whatever its settings', () => {
    expect(tabHoldsContent(blank())).toBe(false);
    expect(tabHoldsContent(blank({ name: 'Notes', locked: false, templateChosen: true }))).toBe(
      false,
    );
    expect(tabHoldsContent(blank({ articles: {} }))).toBe(false);
    expect(tabHoldsContent(blank({ kind: 'dashboard', dashboard: { rows: [] } }))).toBe(false);
  });

  it('reads a dashboard whose slots are all empty as empty', () => {
    const dashboard = { rows: [{ id: 'r', height: 320, slots: [{ id: 's', span: 12 }] }] };
    expect(tabHoldsContent(blank({ kind: 'dashboard', dashboard }))).toBe(false);
  });

  it.each<[string, Partial<Tab>]>([
    ['an element (Diagram, Event Storming, Board and Sheet tabs)', { elements: [box] }],
    ['an article, even a blank one (Pages)', { articles: { flow: { blocks: [] } } }],
    ['a form, even one with no questions', { kind: 'form', form: {} as Tab['form'] }],
    [
      'a filled dashboard slot',
      {
        kind: 'dashboard',
        dashboard: {
          rows: [
            {
              id: 'r',
              height: 320,
              slots: [
                { id: 'a', span: 6 },
                { id: 'b', span: 6, content: { type: 'note', title: 'Goals', text: '' } },
              ],
            },
          ],
        },
      },
    ],
  ])('holds content when it has %s', (_, over) => {
    expect(tabHoldsContent(blank(over))).toBe(true);
  });
});
