import { describe, expect, it } from 'vitest';
import {
  NEW_DOCUMENT_BLANKS,
  isBlankTemplate,
  newDocumentBlankOf,
  newDocumentTemplateMode,
  templateOpening,
} from '@livedoc/templates';
import { TEMPLATE_STARTS } from '@/components/start/start-template-items';
import { paneGroupsFor } from './pane-groups';

const groupsOf = (id: string) => paneGroupsFor(newDocumentBlankOf(id)!);

// docs/specs/013-workspace/new-document-menu.md "The menu"
describe('paneGroupsFor', () => {
  it('lists a whole mode as its start does, Recommended first', () => {
    const groups = groupsOf('diagram');
    expect(groups[0]!.name).toBe('Recommended');
    expect(groups.map((g) => g.id)).toEqual(
      TEMPLATE_STARTS.diagram.groups
        .filter((g) => g.kinds.some((k) => !isBlankTemplate(k)))
        .map((g) => g.id)
        .filter((id) => groups.some((g) => g.id === id)),
    );
  });

  it('lists each template once, under its first group, never a blank', () => {
    for (const b of NEW_DOCUMENT_BLANKS) {
      const kinds = paneGroupsFor(b).flatMap((g) => g.kinds);
      expect(new Set(kinds).size, b.id).toBe(kinds.length);
      expect(kinds.some(isBlankTemplate), b.id).toBe(false);
      expect(kinds.length, b.id).toBeGreaterThan(0);
      for (const k of kinds)
        expect(templateOpening(k), `${b.id} ${k}`).toBe(newDocumentTemplateMode(b.templates));
    }
  });

  it('lists one group of a start for Page and Slides', () => {
    expect(groupsOf('page').map((g) => g.name)).toEqual(['Articles']);
    expect(groupsOf('slides').map((g) => g.name)).toEqual(['Slides']);
    expect(groupsOf('page')[0]!.kinds).toContain('article');
  });

  it('lists the mind maps for Brainstorm, and leaves them out of Diagram', () => {
    expect(groupsOf('brainstorm').map((g) => g.name)).toEqual(['Brainstorm']);
    expect(groupsOf('brainstorm')[0]!.kinds).toEqual(['mindmap', 'mindmap-tree', 'mindmap-bubble']);
    const diagram = groupsOf('diagram').flatMap((g) => g.kinds);
    expect(diagram).not.toContain('mindmap');
    expect(diagram).not.toContain('mindmap-tree');
    expect(groupsOf('diagram').map((g) => g.id)).not.toContain('mindmaps');
    expect(diagram).toContain('flowchart');
  });

  it('lists a Plan family for Sheet, Board and Form', () => {
    expect(groupsOf('sheet')[0]!.kinds).toContain('budget-planner');
    expect(groupsOf('sheet')[0]!.kinds).not.toContain('kanban');
    expect(groupsOf('board')[0]!.kinds).toContain('kanban');
    expect(groupsOf('board')[0]!.kinds).not.toContain('invoice');
    expect(groupsOf('form')[0]!.kinds).toContain('feedback-form');
  });
});
