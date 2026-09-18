// Scenario library: short lessons built on the same model as the rest of the app. Each scenario has a starting hall, a goal,
// a completion condition read from the hall, and a conclusion with numbers from the finished hall. Pure, no DOM dependency.
// main.ts loads the starting hall and checks completion inside refresh(); ui.tsx renders the card.
import {blockingReasons, singlePointsOfFailure} from './redundancy.ts';
import {growthPlan, phaseOf} from './growth.ts';
import {generateLayout} from './goal.ts';
import {PRESETS} from './layout.ts';
import {compute} from './sim.ts';
import type {Catalog, Entry, Grid, Item, Layout} from './types.ts';

export type ScenarioId = 'powerOn' | 'sameFeed' | 'redundancy' | 'phases';
export const SCENARIO_IDS: ScenarioId[] = ['powerOn', 'sameFeed', 'redundancy', 'phases'];

// What a completion condition looks at, built from the current hall
export interface ScenarioContext {
  counts: Record<string, number>;      // devices by type, every phase
  racksInPhase2: number;               // GPU racks deployed in phase 2 or later
  blocking: boolean;
  powered: boolean;
  spof: number | null;                 // facilities whose loss would stop the hall; null when the hall does not pass
  phasesPass: boolean;                 // every phase of the growth plan passes
}

export function scenarioContext(all: Item[], active: Item[], CAT: Catalog, utility: number, powered: boolean): ScenarioContext{
  const counts: Record<string, number> = {};
  for (const it of all) counts[it.type] = (counts[it.type] || 0) + 1;
  const spof = singlePointsOfFailure(active, CAT, utility);
  return {
    counts,
    racksInPhase2: all.filter(i => CAT[i.type].gpus && phaseOf(i) >= 2).length,
    blocking: blockingReasons(active, CAT, utility).length > 0,
    powered,
    spof: spof && spof.length,
    phasesPass: growthPlan(all, CAT, utility).every(p => !p.reasons.length),
  };
}

const row = (type: string, n: number, z: number, x0: number, props?: Entry[3]): Entry[] =>
  Array.from({length: n}, (_, i) => (props ? [type, x0 + i, z, props] : [type, x0 + i, z]) as Entry);

export interface Scenario {
  id: ScenarioId;
  start(CAT: Catalog, grid: Grid): Layout;
  done(c: ScenarioContext): boolean;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  // The tutorial story without the hand-holding: a bare row of racks that cannot power on
  powerOn: {
    id: 'powerOn',
    start: () => ({u: 2, list: row('gb200', 8, 3, 4)}),
    done: c => c.powered,
  },
  // The densest GB200 hall a 2 MW feed can run; rebuild it with Vera Rubin racks on the same feed and compare
  sameFeed: {
    id: 'sameFeed',
    start: (CAT, grid) => ({u: 2, list: (generateLayout({type: 'gb200', gpus: 99999, utility: 2, n1: false}, CAT, grid)?.list ?? []).map(i => [i.type, i.x, i.z] as Entry)}),
    done: c => !c.blocking && (c.counts.vr200 || 0) > 0 && !(c.counts.gb200 || 0),
  },
  // A hall that passes every check but falls over when one facility fails
  redundancy: {
    id: 'redundancy',
    start: () => PRESETS.gb200,
    done: c => c.spof === 0,
  },
  // Phase 1 works; phase 2 doubles the racks without the support to carry them
  phases: {
    id: 'phases',
    start: (CAT, grid) => {
      const first = generateLayout({type: 'gb200', gpus: 4 * (CAT.gb200.gpus ?? 72), utility: 2, n1: false}, CAT, grid)?.list ?? [];
      const used = new Set(first.map(i => `${i.x},${i.z}`));
      const free = [0, 1, 2, 3, 12, 13, 14, 15].filter(x => !used.has(`${x},4`)).slice(0, 4);
      return {u: 2, list: [...first.map(i => [i.type, i.x, i.z] as Entry), ...free.map(x => ['gb200', x, 4, {phase: 2}] as Entry)]};
    },
    done: c => c.phasesPass && c.racksInPhase2 >= 4,
  },
};

export const startLayout = (id: ScenarioId, CAT: Catalog, grid: Grid): Layout => SCENARIOS[id].start(CAT, grid);
export const isDone = (id: ScenarioId, c: ScenarioContext): boolean => SCENARIOS[id].done(c);

// Numbers for the conclusion text, read from the finished hall
export interface ScenarioResult {gpus: number; pue: string; support: number; racks: number; cdu: number; rpp: number; crah: number; ib: number}
export function scenarioResult(active: Item[], CAT: Catalog, utility: number): ScenarioResult{
  const s = compute(active, CAT, utility);
  const by = (type: string) => active.filter(i => i.type === type).length;
  return {
    gpus: s.gpus, pue: s.it ? s.pue.toFixed(2) : '–', racks: active.filter(i => CAT[i.type].gpus).length,
    support: active.filter(i => !CAT[i.type].gpus && CAT[i.type].group !== 'net').length + by('ib'),
    cdu: by('cdu'), rpp: by('rpp'), crah: by('crah'), ib: by('ib'),
  };
}
