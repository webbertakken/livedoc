import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../model/blocks';
import { bold, italic, run, templateDocument, TemplateWriter } from './template-writing';

const LINE = 468;

describe('the template writer', () => {
  it('writes paragraphs in the built-in styles', () => {
    const w = new TemplateWriter(LINE);
    expect(w.title('A').style).toBe(w.styleId('title'));
    expect(w.subtitle('A').style).toBe(w.styleId('subtitle'));
    expect(w.h1('A').style).toBe(w.styleId('heading1'));
    expect(w.h2('A').style).toBe(w.styleId('heading2'));
    expect(w.h3('A').style).toBe(w.styleId('heading3'));
    expect(w.p('').inlines).toEqual([]);
    expect(w.p([bold('B'), italic('I'), run('R', { color: '#123456' })]).inlines).toEqual([
      { type: 'run', text: 'B', props: { bold: true } },
      { type: 'run', text: 'I', props: { italic: true } },
      { type: 'run', text: 'R', props: { color: '#123456' } },
    ]);
  });

  it('draws a rule as an empty paragraph’s bottom border', () => {
    const rule = new TemplateWriter(LINE).rule('#00796b', 2, { spaceAfter: 12 });
    expect(rule.inlines).toEqual([]);
    expect(rule.props).toEqual({
      spaceAfter: 12,
      borders: { bottom: { width: 2, dash: 'solid', color: '#00796b', space: 1 } },
    });
  });

  it('makes each list a list of its own, in its preset’s look', () => {
    const w = new TemplateWriter(LINE);
    const bullets = w.bullets(['a', 'b']);
    const numbers = w.numbered(['one']);
    const checks = w.checklist(['do']);
    expect(bullets.map((p) => p.list)).toEqual([
      { id: 'list-1', level: 0 },
      { id: 'list-1', level: 0 },
    ]);
    expect(numbers[0]!.list).toEqual({ id: 'list-2', level: 0 });
    expect(checks[0]!.list).toEqual({ id: 'list-3', level: 0, checked: false });
    expect(w.checklist(['a', 'b'], {}, [true]).map((p) => p.list?.checked)).toEqual([true, false]);
    const lists = w.lists();
    expect(lists['list-1']!.levels[0]!.kind).toBe('bullet');
    expect(lists['list-2']!.levels[0]!.kind).toBe('number');
    expect(lists['list-3']!.levels[0]!.kind).toBe('check');
    expect(() => w.list('no-such-preset', ['x'])).toThrow('no list preset no-such-preset');
  });

  it('lays a table across the line by its shares, with cell backgrounds', () => {
    const w = new TemplateWriter(LINE);
    const table = w.table(
      [
        [{ writing: 'Head', background: '#eeeeee', paragraph: { align: 'center' } }, 'B'],
        [[bold('C')], 'D'],
      ],
      { shares: [3, 1], headerRows: 1 },
    );
    expect(table.columns).toEqual([351, 117]);
    expect(table.headerRows).toBe(1);
    expect(table.rows[0]!.cells[0]!.props).toEqual({ background: '#eeeeee' });
    expect((table.rows[0]!.cells[0]!.blocks[0] as Paragraph).props).toEqual({ align: 'center' });
    expect(table.rows[1]!.cells[0]!.props).toEqual({});
    expect(new TemplateWriter(LINE).table([['a', 'b', 'c']]).columns).toEqual([156, 156, 156]);
  });
});

describe('a template’s document', () => {
  it('takes the look’s text, paragraph, styles and margins', () => {
    const doc = templateDocument(
      {
        text: { font: 'Georgia', size: 12 },
        paragraph: { spaceAfter: 9 },
        styles: { title: { text: { color: '#6a1b4d' }, paragraph: { align: 'center' } } },
        margins: { left: 54, right: 54 },
      },
      (w) => [w.title('T'), ...w.bullets(['x'])],
    );
    expect(doc.defaults.text).toEqual({ font: 'Georgia', size: 12 });
    expect(doc.defaults.paragraph.spaceAfter).toBe(9);
    expect(doc.defaults.paragraph.lineHeight).toEqual({ rule: 'multiple', value: 1.15 });
    const title = doc.styles.find((s) => s.role === 'title')!;
    expect(title.text).toEqual({ size: 26, color: '#6a1b4d' });
    expect(title.paragraph.align).toBe('center');
    expect(doc.styles.find((s) => s.role === 'normal')!.text).toEqual({});
    expect(doc.section.setup.margins).toEqual({ top: 72, bottom: 72, left: 54, right: 54 });
    expect(Object.keys(doc.lists)).toEqual(['list-1']);
    expect(doc.body).toHaveLength(2);
  });
});
