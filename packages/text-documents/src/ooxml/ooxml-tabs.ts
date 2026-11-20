// OOXML tab stops (standard-mapping.md "The model", tab stops): `w:tabs` says what a paragraph or style changes of the
// stops it inherits, positions from the margin in twentieths of a point; Word merges them down the style chain.
import {
  attributeOf,
  childElement,
  childElements,
  ptToTwips,
  twipsToPt,
  type XmlElement,
} from '@livedoc/office-packages';
import { compact } from '../model/props';
import {
  TabStops,
  type TabAlign,
  type TabEntries,
  type TabLeader,
  type TabStop,
} from '../model/tab-stops';
import { W_NS } from './ooxml-names';

const ALIGN_IN: Record<string, TabAlign> = {
  start: 'start',
  left: 'start',
  center: 'center',
  end: 'end',
  right: 'end',
  decimal: 'decimal',
};
const ALIGN_OUT: Record<TabAlign, string> = {
  start: 'left',
  center: 'center',
  end: 'right',
  decimal: 'decimal',
};
const LEADER_IN: Record<string, TabLeader> = {
  dot: 'dot',
  hyphen: 'hyphen',
  underscore: 'underscore',
  heavy: 'underscore',
  middleDot: 'middle-dot',
};
const LEADER_OUT: Record<TabLeader, string> = {
  dot: 'dot',
  hyphen: 'hyphen',
  underscore: 'underscore',
  'middle-dot': 'middleDot',
};

const w = (e: XmlElement, local: string) => attributeOf(e, W_NS, local);

/** A `w:pPr`'s `w:tabs` as clears and stops set, or none; `dropped` names what reads as no stop (or a lesser one). */
export function readTabEntries(
  pPr: XmlElement | undefined,
  dropped: (name: string) => void,
): TabEntries | undefined {
  const tabs = pPr && childElement(pPr, W_NS, 'tabs');
  if (!tabs) return undefined;
  const clears: number[] = [];
  const sets: TabStop[] = [];
  for (const tab of childElements(tabs)) {
    const kind = w(tab, 'val') ?? '';
    const position = twipsToPt(w(tab, 'pos'));
    if (position === undefined) continue;
    if (kind === 'clear') {
      clears.push(position);
      continue;
    }
    const align = ALIGN_IN[kind];
    if (!align) {
      dropped(`${kind || 'unknown'} tab stop`);
      continue;
    }
    const leader = w(tab, 'leader');
    if (leader === 'heavy') dropped('heavy tab leader');
    sets.push(compact({ position, align, leader: leader ? LEADER_IN[leader] : undefined }));
  }
  const read = TabStops.normalise(sets);
  for (let i = 0; i < read.dropped; i += 1) dropped('tab stop past the range or the most');
  return { clears, sets: read.stops };
}

/**
 * The stops a paragraph or style owns after its `w:tabs` over what it inherits; none of its own when there is no
 * `w:tabs` or it changes nothing.
 */
export function ownTabStops(
  inherited: readonly TabStop[],
  entries: TabEntries | undefined,
): TabStop[] | undefined {
  if (!entries) return undefined;
  const merged = TabStops.merge(inherited, entries);
  return TabStops.equal(merged, inherited) ? undefined : merged;
}

/** `w:tabs` for a list over the stops it inherits: clears and stops set by position; nothing when they are equal. */
export function tabsXml(
  inherited: readonly TabStop[],
  own: readonly TabStop[] | undefined,
): string | undefined {
  if (!own) return undefined;
  const { clears, sets } = TabStops.difference(inherited, own);
  const each = [
    ...clears.map((position) => ({ position, xml: `w:val="clear"` })),
    ...sets.map((s) => ({
      position: s.position,
      xml: `w:val="${ALIGN_OUT[s.align]}"${s.leader ? ` w:leader="${LEADER_OUT[s.leader]}"` : ''}`,
    })),
  ].sort((a, b) => a.position - b.position);
  if (each.length === 0) return undefined;
  return `<w:tabs>${each.map((t) => `<w:tab ${t.xml} w:pos="${ptToTwips(t.position)}"/>`).join('')}</w:tabs>`;
}

/** The document's default stops' interval, `w:defaultTabStop` in `settings.xml`, when it names one past 0. */
export function readTabInterval(settings: XmlElement | undefined): number | undefined {
  const e = settings && childElement(settings, W_NS, 'defaultTabStop');
  const pt = e && twipsToPt(w(e, 'val'));
  return pt !== undefined && pt > 0 ? pt : undefined;
}
