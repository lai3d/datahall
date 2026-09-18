// Guided tutorial: build a small GB200 hall step by step and learn why it cannot power on until power
// distribution, cooling and networking are added. Pure step logic; main.ts owns the tutorial state and
// ui.tsx renders the card. A step completes when its condition holds on the current hall; manual steps
// wait for "Next". Several steps can complete at once (for example when a user adds facilities early).
import type {ReasonKind} from './redundancy.ts';

// What the step conditions look at, built from the current hall by main.ts
export interface TutorialContext {
  tool: string | null;
  counts: Record<string, number>;   // placed devices by type
  reasons: ReasonKind[];            // hall-wide shortages (blockingReasons without per-device overloads)
  overloads: ('cdu' | 'rpp')[];     // supply types with a reported per-device overload
  blocking: boolean;
  powered: boolean;
}

export interface TutorialStep {
  id: 'pick' | 'place' | 'why' | 'power' | 'liquid' | 'air' | 'network' | 'utility' | 'powerOn' | 'done';
  target: string | null;            // CSS selector of the control to highlight
  manual?: boolean;                 // advances only with "Next"
  done?: (c: TutorialContext) => boolean;
}

export const RACKS = 8;
export const PLACE = 1;   // index of the "place the row" step, the only step the tutorial can go back to
const racks = (c: TutorialContext) => c.counts.gb200 || 0;
// The facility steps complete when their shortage is gone, and an empty hall is short of nothing,
// so every condition also needs the row of racks to still be there
const hasRacks = (c: TutorialContext) => racks(c) >= RACKS;

export const STEPS: TutorialStep[] = [
  {id: 'pick', target: '#palette button[data-t="gb200"]', done: c => c.tool === 'gb200' || racks(c) >= RACKS},
  {id: 'place', target: '#placeMode button[data-mode="row"]', done: c => racks(c) >= RACKS},
  {id: 'why', target: '#issues', manual: true},
  {id: 'power', target: '#palette button[data-t="rpp"]', done: c => hasRacks(c) && !c.reasons.includes('dist') && !c.overloads.includes('rpp')},
  {id: 'liquid', target: '#palette button[data-t="cdu"]', done: c => hasRacks(c) && !c.reasons.includes('liquid') && !c.overloads.includes('cdu')},
  {id: 'air', target: '#palette button[data-t="crah"]', done: c => hasRacks(c) && !c.reasons.includes('air')},
  {id: 'network', target: '#palette button[data-t="ib"]', done: c => hasRacks(c) && !c.reasons.includes('network')},
  {id: 'utility', target: '#utility', done: c => hasRacks(c) && !c.reasons.includes('utility')},
  {id: 'powerOn', target: '#power', done: c => c.powered},
  {id: 'done', target: null, manual: true},
];
export const LAST = STEPS.length - 1;

// Move forward from `step` past every step whose condition already holds, stopping at manual steps; `next` also passes
// the current manual step (the "Next" button). The one way back: the row of racks is gone (undo, delete), which returns
// the tutorial to placing them instead of leaving it on a step about a hall that no longer exists
export function advance(step: number, c: TutorialContext, next = false): number{
  if (step > PLACE && step < LAST && racks(c) < RACKS) return PLACE;
  let i = step;
  if (next && STEPS[i]?.manual && i < LAST) i++;
  while (i < LAST && !STEPS[i].manual && STEPS[i].done?.(c)) i++;
  return i;
}
