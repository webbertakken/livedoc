// A board's readiness (docs/specs/021-event-storming/board-review.md "Readiness"): what a person would settle before
// exporting, counted from the reading. It informs; it never blocks an export.

import type { GapCode, StormReading } from './types';

export type Readiness = {
  events: number;
  // Every gap but the two counted on their own below.
  gaps: number;
  openHotspots: number;
  eventsOutsideContext: number;
  // At least one event, and nothing left to settle.
  ready: boolean;
};

const COUNTED_APART: readonly GapCode[] = ['open_hotspot', 'event_without_context'];

export function readinessOf(reading: StormReading): Readiness {
  const count = (code: GapCode) => reading.gaps.filter((g) => g.code === code).length;
  const events = reading.timeline.length;
  const gaps = reading.gaps.filter((g) => !COUNTED_APART.includes(g.code)).length;
  const openHotspots = count('open_hotspot');
  const eventsOutsideContext = count('event_without_context');
  return {
    events,
    gaps,
    openHotspots,
    eventsOutsideContext,
    ready: events > 0 && gaps + openHotspots + eventsOutsideContext === 0,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The readiness line: the events, then only what is left to settle, or "Ready to export".
export function formatReadiness(r: Readiness): string {
  if (r.events === 0) return 'No events yet';
  const left = [
    r.gaps > 0 ? plural(r.gaps, 'gap') : null,
    r.openHotspots > 0 ? plural(r.openHotspots, 'open hotspot') : null,
    r.eventsOutsideContext > 0
      ? `${plural(r.eventsOutsideContext, 'event')} outside a context`
      : null,
  ].filter((part) => part !== null);
  return [plural(r.events, 'event'), ...(left.length > 0 ? left : ['Ready to export'])].join(' · ');
}
