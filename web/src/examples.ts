// Example halls kept in the repo: the ones worth opening from the README, the launch material and a talk.
// Each one is built from the app's own code (presets or the goal generator), carries the claim it is meant to show,
// and `npm run examples` writes docs/examples.md with a share link per example. Pure, no DOM dependency.
import {PRESETS} from './layout.ts';
import {generateLayout} from './goal.ts';
import {blockingReasons, singlePointsOfFailure} from './redundancy.ts';
import {growthPlan} from './growth.ts';
import {compute} from './sim.ts';
import {toItems} from './edit.ts';
import {planRepair} from './repair.ts';
import {keyOf} from './grid.ts';
import type {Catalog, Entry, Grid, Layout} from './types.ts';

// What an example promises, checked by tests/examples.test.ts so a catalog change cannot quietly break the story
export interface ExampleClaims {
  powers: boolean;          // the hall passes every check
  n1?: boolean;             // no single facility failure stops it
  phases?: number;          // phases in the growth plan
  gpus?: number;
}
export interface Example {
  id: string;
  title: string;            // English; the app itself is bilingual through ?lang=
  blurb: string;
  layout: Layout;
  claims: ExampleClaims;
}

const fromGoal = (type: string, gpus: number, utility: number, n1: boolean, grid: Grid, CAT: Catalog): Layout =>
  ({u: utility, list: (generateLayout({type, gpus, utility, n1}, CAT, grid)?.list ?? []).map(i => [i.type, i.x, i.z] as Entry)});

export function examples(CAT: Catalog, grid: Grid): Example[]{
  const teaching: Layout = {u: 2, list: PRESETS.gb200.list};
  const gb200Hall = fromGoal('gb200', 99999, 2, false, grid, CAT);
  const rubinHall = fromGoal('vr200', 99999, 5, false, grid, CAT);
  const n1Hall: Layout = {u: 2, list: PRESETS.gb200n1.list};
  // Phase 1 is a working hall for four racks; phase 2 doubles them and brings the support the repair planner says they need
  const phase1 = fromGoal('gb200', 4 * (CAT.gb200.gpus ?? 72), 2, false, grid, CAT).list;
  const occupied = new Set(phase1.map(e => keyOf(e[1], e[2])));
  const moreRacks = [0, 1, 2, 3].map(i => ({type: 'gb200', x: 12 + i, z: 3})).filter(r => !occupied.has(keyOf(r.x, r.z)));
  moreRacks.forEach(r => occupied.add(keyOf(r.x, r.z)));
  const phase2Support = planRepair([...toItems(phase1), ...moreRacks], CAT, 2, occupied, grid)?.[0]?.add ?? [];
  const phase2: Entry[] = [...moreRacks, ...phase2Support].map(i => [i.type, i.x, i.z, {phase: 2}] as Entry);
  const growth: Layout = {u: 2, list: [...phase1, ...phase2]};
  // The teaching hall's racks with none of the support they need
  const broken: Layout = {u: 2, list: PRESETS.gb200.list.filter(e => CAT[e[0]].gpus)};

  return [
    {id: 'teaching', title: 'Small teaching hall', blurb: 'Eight GB200 racks with just enough power, cooling and network to run on a 2 MW feed. The hall the tutorial builds.', layout: teaching, claims: {powers: true}},
    {id: 'gb200-2mw', title: 'The most GB200 a 2 MW feed can run', blurb: 'The densest GB200 hall a 2 MW utility feed carries, support units included.', layout: gb200Hall, claims: {powers: true, gpus: 864}},
    {id: 'rubin-5mw', title: 'A 5 MW Vera Rubin hall', blurb: 'The same exercise one generation later: fewer racks, far more power per rack.', layout: rubinHall, claims: {powers: true, gpus: 1512}},
    {id: 'n1', title: 'N+1 design', blurb: 'Three of every facility, so no single CDU, power panel, cooler or switch rack failure stops the hall. Try the failure drill.', layout: n1Hall, claims: {powers: true, n1: true}},
    {id: 'growth', title: 'Two-phase growth plan', blurb: 'Phase 1 runs; phase 2 doubles the racks and brings the support it needs. Both phases pass.', layout: growth, claims: {powers: true, phases: 2, gpus: 576}},
    {id: 'broken', title: 'A hall that cannot power on', blurb: 'Eight racks on the floor and nothing else. The panel says what is short and offers to fix it.', layout: broken, claims: {powers: false}},
  ];
}

// The claims an example actually holds up to, for the tests and for the generated document
export function check(ex: Example, CAT: Catalog): ExampleClaims{
  const items = toItems(ex.layout.list);
  const powers = blockingReasons(items, CAT, ex.layout.u).length === 0;
  const spof = singlePointsOfFailure(items, CAT, ex.layout.u);
  return {powers, n1: powers && spof?.length === 0, phases: growthPlan(items, CAT, ex.layout.u).length, gpus: compute(items, CAT, ex.layout.u).gpus};
}
