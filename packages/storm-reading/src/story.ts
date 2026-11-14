// The story (docs/specs/021-event-storming/board-review.md "Story"): the timeline told as sentences, one step per
// event, so a person can walk it. The words are the notes' own; only the joining words are ours.

import type { ElementId } from '@livedoc/document';
import type { StormReading } from './types';

export type StoryStep = {
  event: ElementId;
  // What leads to the event, a line per command: "Guest: Place Order (with Menu)".
  leads: string[];
  // The aggregates and external systems that decide it.
  deciders: string[];
  // The event's own words.
  happens: string;
  // What follows, a line per policy: "Whenever Order Placed: Notify kitchen, then Prepare Meal".
  follows: string[];
  // The hotspots asked of it; an answered one with its answer.
  questions: string[];
  // Every note of the step, to bring into view and ring.
  notes: ElementId[];
  // Whether the event is pivotal: it closes a phase.
  closesPhase: boolean;
};

const BLANK = '(blank)';

export function storySteps(reading: StormReading): StoryStep[] {
  const words = new Map(reading.notes.map((n) => [n.id, n.words || BLANK]));
  const say = (id: ElementId) => words.get(id)!;
  const answers = new Map(reading.decisions.map((d) => [d.hotspot, d.answer]));
  const pivotal = new Set(reading.pivotal);
  return reading.timeline.map((moment) => {
    const happens = say(moment.event);
    return {
      event: moment.event,
      leads: moment.commands.map((c) => {
        const who = c.actors.map(say).join(', ');
        const using = c.readModels.map(say).join(', ');
        return `${who ? `${who}: ` : ''}${say(c.command)}${using ? ` (with ${using})` : ''}`;
      }),
      deciders: moment.deciders.map(say),
      happens,
      follows: moment.policies.map(
        (p) => `Whenever ${happens}: ${say(p.policy)}${p.issues ? `, then ${say(p.issues)}` : ''}`,
      ),
      questions: moment.hotspots.map((h) => {
        const answer = answers.get(h);
        return answer ? `${say(h)} ${answer}` : say(h);
      }),
      notes: [
        ...moment.commands.flatMap((c) => [...c.readModels, ...c.actors, c.command]),
        ...moment.deciders,
        moment.event,
        ...moment.policies.map((p) => p.policy),
        ...moment.hotspots,
      ],
      closesPhase: pivotal.has(moment.event),
    };
  });
}
