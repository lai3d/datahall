// Scenario library: short lessons built on the same model as the rest of the app. Each scenario has a starting hall, a goal,
// a completion condition read from the hall, and a conclusion with numbers from the finished hall. Pure, no DOM dependency.
// main.ts loads the starting hall and checks completion inside refresh(); ui.tsx renders the card.
import {blockingReasons, singlePointsOfFailure} from './redundancy.ts';
import {growthPlan, phaseOf} from './growth.ts';
import {largestHall} from './compare.ts';
import {generateLayout} from './goal.ts';
import {PRESETS} from './layout.ts';
import {compute} from './sim.ts';
import type {Catalog, Entry, Grid, Item, Layout} from './types.ts';

export type ScenarioId = 'powerOn' | 'sameFeed' | 'redundancy' | 'phases';
export const SCENARIO_IDS: ScenarioId[] = ['powerOn', 'sameFeed', 'redundancy', 'phases'];

// What a completion condition looks at, built from the current hall
export interface ScenarioContext {
  counts: Record<string, number>;      // devices by type, every phase
  utility: number;                     // the feed the hall runs on, so a scenario can pin it
  racks: number;                       // GPU racks, so deleting them cannot finish a scenario
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
    utility,
    racks: all.filter(i => CAT[i.type].gpus).length,
    racksInPhase2: all.filter(i => CAT[i.type].gpus && phaseOf(i) >= 2).length,
    blocking: blockingReasons(active, CAT, utility).length > 0,
    powered,
    spof: spof && spof.length,
    phasesPass: growthPlan(all, CAT, utility).every(p => !p.reasons.length),
  };
}

const row = (type: string, n: number, z: number, x0: number, props?: Entry[3]): Entry[] =>
  Array.from({length: n}, (_, i) => (props ? [type, x0 + i, z, props] : [type, x0 + i, z]) as Entry);

export const SAME_FEED_MW = 2;     // the feed both halls of the sameFeed scenario run on
export const PHASE2_RACKS = 4;     // racks the phases scenario deploys in phase 2

export interface Scenario {
  id: ScenarioId;
  start(CAT: Catalog, grid: Grid): Layout;
  done(c: ScenarioContext, CAT: Catalog, grid: Grid): boolean;
  panel?: 'design' | 'drill';   // the panel group holding the tools the lesson needs, opened when it starts
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
    panel: 'design',
    start: (CAT, grid) => ({u: SAME_FEED_MW, list: (generateLayout({type: 'gb200', gpus: 99999, utility: SAME_FEED_MW, n1: false}, CAT, grid)?.list ?? []).map(i => [i.type, i.x, i.z] as Entry)}),
    // The lesson is the same feed carrying as many Vera Rubin racks as it can, so the feed and the rack count both count
    done: (c, CAT, grid) => c.utility === SAME_FEED_MW && !c.blocking && !(c.counts.gb200 || 0)
      && (c.counts.vr200 || 0) >= largestHall('vr200', CAT, SAME_FEED_MW, grid).racks,
  },
  // A hall that passes every check but falls over when one facility fails
  redundancy: {
    id: 'redundancy',
    panel: 'drill',
    start: () => PRESETS.gb200,
    // Deleting the racks would also remove every single point of failure, so the racks have to stay
    done: (c, CAT) => c.spof === 0 && c.racks >= PRESETS.gb200.list.filter(e => CAT[e[0]].gpus).length,
  },
  // Phase 1 works; phase 2 doubles the racks without the support to carry them
  phases: {
    id: 'phases',
    panel: 'design',
    start: (CAT, grid) => {
      const first = generateLayout({type: 'gb200', gpus: 4 * (CAT.gb200.gpus ?? 72), utility: 2, n1: false}, CAT, grid)?.list ?? [];
      const used = new Set(first.map(i => `${i.x},${i.z}`));
      const free = [0, 1, 2, 3, 12, 13, 14, 15].filter(x => !used.has(`${x},4`)).slice(0, 4);
      return {u: 2, list: [...first.map(i => [i.type, i.x, i.z] as Entry), ...free.map(x => ['gb200', x, 4, {phase: 2}] as Entry)]};
    },
    done: (c, CAT, grid) => c.phasesPass && c.racksInPhase2 >= PHASE2_RACKS && c.racks >= PHASE2_RACKS + startRacks('phases', CAT, grid, 1),
  },
};

export const startLayout = (id: ScenarioId, CAT: Catalog, grid: Grid): Layout => SCENARIOS[id].start(CAT, grid);
export const isDone = (id: ScenarioId, c: ScenarioContext, CAT: Catalog, grid: Grid): boolean => SCENARIOS[id].done(c, CAT, grid);
// GPU racks the scenario's own starting hall puts in a phase, so a completion condition cannot be fooled by deleting them
function startRacks(id: ScenarioId, CAT: Catalog, grid: Grid, phase: number): number{
  return startLayout(id, CAT, grid).list.filter(e => CAT[e[0]].gpus && ((e[3] as {phase?: number} | undefined)?.phase ?? 1) === phase).length;
}

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
