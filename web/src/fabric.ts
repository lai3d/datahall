// Back-end (scale-out) fabric topology for the GPU racks in the hall, pure functions, no DOM dependency.
// Informational: it does not take part in compute() or the power-on check, which counts one IB port per GPU.
// Fat-tree arithmetic for radix-k switches (k ports at the endpoint speed): one switch carries up to k endpoints;
// two tiers carry k²/2 non-blocking (every leaf gives half its ports to endpoints and half to spines);
// three tiers carry k³/4. An oversubscription ratio r gives each leaf k·r/(r+1) endpoint ports and k/(r+1) uplinks.
// Rail-optimized fabrics give every rail (the same NIC position in every server) its own leaves, so traffic between
// GPUs of the same local rank stays on one leaf; that can cost extra leaves when a rail does not fill its last one.
import type {CableClass, Catalog, Item, Pos} from './types.ts';
import {tr, catName} from './i18n.ts';

export interface FabricPlanInput {
  endpoints: number;       // back-end NIC ports to connect
  radix: number;           // switch ports at the endpoint speed (a split 800G port counts as two 400G ports)
  oversubscription: number;   // 1 = non-blocking; 2 = twice as much endpoint bandwidth as uplink bandwidth
  rails: number;           // 1 = plain leaf/spine; n = rail-optimized with n rails
}

export interface FabricPlan {
  tiers: 0 | 1 | 2 | 3;     // 0 = nothing to connect
  leaves: number;
  spines: number;          // second tier
  cores: number;           // third tier
  downPerLeaf: number;     // endpoints per leaf (the busiest one)
  upPerLeaf: number;       // uplinks per leaf
  switches: number;
  endpointLinks: number;   // NIC-to-leaf cables
  uplinks: number;         // leaf-to-spine cables
  coreLinks: number;       // spine-to-core cables
  maxTwoTier: number;      // most endpoints two tiers can carry at this radix and ratio
}

const EMPTY: FabricPlan = {tiers: 0, leaves: 0, spines: 0, cores: 0, downPerLeaf: 0, upPerLeaf: 0, switches: 0, endpointLinks: 0, uplinks: 0, coreLinks: 0, maxTwoTier: 0};

// Smallest divisor of `up` that is at least `min`; `min` when none is (the links then cannot spread evenly)
function evenSpines(min: number, up: number): number{
  for (let d = Math.max(1, min); d <= up; d++) if (up % d === 0) return d;
  return min;
}

export function planFabric({endpoints, radix, oversubscription, rails}: FabricPlanInput): FabricPlan{
  if (!(endpoints > 0) || !(radix >= 2)) return EMPTY;
  const r = Math.max(1, oversubscription), k = Math.floor(radix);
  const up = Math.max(1, Math.floor(k / (r + 1))), down = k - up;
  const maxTwoTier = down * k;   // k leaves (each spine has k ports), each with `down` endpoints
  const railCount = Math.max(1, Math.floor(rails));
  // One switch is enough when every endpoint fits and there is only one rail
  if (endpoints <= k && railCount === 1)
    return {...EMPTY, tiers: 1, leaves: 1, downPerLeaf: endpoints, switches: 1, endpointLinks: endpoints, maxTwoTier};
  // Leaves share their rail's endpoints evenly and take only the uplinks their endpoints need at the ratio
  const perRail = Math.ceil(endpoints / railCount), leavesPerRail = Math.ceil(perRail / down);
  const perLeaf = Math.ceil(perRail / leavesPerRail), upLinks = Math.min(up, Math.ceil(perLeaf / r));
  const leaves = railCount * leavesPerRail;
  const uplinks = leaves * upLinks;
  if (leaves <= k){
    // Two tiers: each spine has k ports facing the leaves. Every leaf gets the same number of links to every spine, so the spine
    // count is the smallest divisor of a leaf's uplinks that has enough ports. That reproduces the spine counts in NVIDIA's DGX
    // SuperPOD GB300 and Vera Rubin reference designs (18 spines, not 16, for 32 leaves), except Vera Rubin at 2 SUs (9 there, 8 here)
    const spines = evenSpines(Math.ceil(uplinks / k), upLinks);
    return {tiers: 2, leaves, spines, cores: 0, downPerLeaf: perLeaf, upPerLeaf: upLinks, switches: leaves + spines,
      endpointLinks: endpoints, uplinks, coreLinks: 0, maxTwoTier};
  }
  // Three tiers: spines (aggregation) match the leaves' uplinks with half their ports, the other half go to cores
  const spines = Math.ceil(uplinks / Math.floor(k / 2));
  const coreLinks = spines * Math.floor(k / 2);
  const cores = Math.ceil(coreLinks / k);
  return {tiers: 3, leaves, spines, cores, downPerLeaf: perLeaf, upPerLeaf: upLinks, switches: leaves + spines + cores,
    endpointLinks: endpoints, uplinks, coreLinks, maxTwoTier};
}

// ---------- cable runs ----------
// A run goes up out of the rack to the overhead tray, along the tray in row and column steps, and down into the other rack.
// Real routing follows the tray layout, so these are estimates of the order of magnitude, and the allowances are named constants
export interface RunGeometry {cellWidthM: number; cellDepthM: number; riseM: number; slackM: number}
export interface Reach {id: string; maxM: number}   // classes in increasing reach; a run takes the first whose reach covers it

export function runLength(a: {x: number; z: number}, b: {x: number; z: number}, g: RunGeometry): number{
  return Math.abs(a.x - b.x) * g.cellWidthM + Math.abs(a.z - b.z) * g.cellDepthM + 2 * g.riseM + g.slackM;
}

export function classify(lengthM: number, classes: Reach[]): string | null{
  return classes.find(c => lengthM <= c.maxM + 1e-9)?.id ?? null;
}

// Counts per class for a list of runs, each carrying n cables; runs longer than every class count as `beyond`
export function tally(runs: {lengthM: number; n: number}[], classes: Reach[]): {byClass: Record<string, number>; beyond: number; longestM: number}{
  const byClass: Record<string, number> = Object.fromEntries(classes.map(c => [c.id, 0]));
  let beyond = 0, longestM = 0;
  for (const {lengthM, n} of runs){
    if (!(n > 0)) continue;
    longestM = Math.max(longestM, lengthM);
    const id = classify(lengthM, classes);
    if (id) byClass[id] += n; else beyond += n;
  }
  return {byClass, beyond, longestM};
}

// ---------- the hall ----------
// Run allowances, estimates (the only non-sourced figures here): each end rises 1.2 m from a mid-rack port to the tray
// above a 2.2 m rack, 0.5 m of slack for dressing and service loops, and 1 m for a run between two switches in one rack
export const RUN: RunGeometry = {cellWidthM: 0.6, cellDepthM: 1.2, riseM: 1.2, slackM: 0.5};
export const IN_RACK_M = 1;
export const OVERSUBSCRIPTION = [1, 2, 3] as const;

export interface FabricOptions {oversubscription: number; railOptimized: boolean}
export const DEFAULT_FABRIC: FabricOptions = {oversubscription: 1, railOptimized: true};

// One GPU rack type's fabric. Each plane is an independent fabric of the same shape, so `plan` is per plane
export interface TypeFabric {type: string; racks: number; planes: number; rails: number; endpoints: number; plan: FabricPlan; switches: number}
export type NotModeled = 'quantum2' | 'ethernet' | 'unsourced' | 'speed';

export interface HallFabric {
  modeled: TypeFabric[];
  skipped: {type: string; racks: number; reason: NotModeled}[];
  switchType: string | null;   // catalog id of the switch rack (the one with a radix)
  radix: number;
  perRack: number;             // switches one switch rack holds
  switchesNeeded: number;
  ibRacks: number;             // switch racks placed
  ibRacksNeeded: number;
  gpuPorts: number;            // IB ports the power-on check asks for: one per GPU of every rack type
  endpoints: number;           // back-end NIC ports of the modeled racks
  switchPorts: number;         // switch ports the modeled fabrics use (endpoint, uplink and core ports)
  byClass: Record<string, number>;   // cables per class id
  beyond: number;              // runs longer than every class
  unplaced: number;            // cables to switches that have no rack slot
  longestM: number;
  nicRuns: number;             // GPU rack to leaf cables
  switchRuns: number;          // leaf to spine (and spine to core) cables
}

const byPos = (a: Pos, b: Pos) => a.z - b.z || a.x - b.x;

export function hallFabric(items: Item[], cat: Catalog, cables: CableClass[], opts: FabricOptions): HallFabric{
  const sw = Object.values(cat).find(t => t.radix && t.ports);
  const radix = sw?.radix ?? 0, perRack = sw ? Math.max(1, Math.floor((sw.ports ?? 0) / radix)) : 0;
  const slots: Pos[] = items.filter(i => i.type === sw?.id).sort(byPos).flatMap(i => Array.from({length: perRack}, () => ({x: i.x, z: i.z})));
  const gpuRacks = new Map<string, Item[]>();
  for (const i of items) if (cat[i.type].gpus) gpuRacks.set(i.type, [...(gpuRacks.get(i.type) ?? []), i]);
  const out: HallFabric = {modeled: [], skipped: [], switchType: sw?.id ?? null, radix, perRack, switchesNeeded: 0, ibRacks: slots.length / (perRack || 1),
    ibRacksNeeded: 0, gpuPorts: items.reduce((n, i) => n + (cat[i.type].gpus ?? 0), 0), endpoints: 0, switchPorts: 0,
    byClass: Object.fromEntries(cables.map(c => [c.id, 0])), beyond: 0, unplaced: 0, longestM: 0, nicRuns: 0, switchRuns: 0};
  let next = 0;   // next free switch slot; leaves take slots first, then spines, then cores, fabric by fabric
  const take = (n: number) => Array.from({length: n}, () => slots[next++] ?? null);
  const runs = {nic: [] as {lengthM: number; n: number}[], sw: [] as {lengthM: number; n: number}[]};
  const run = (kind: 'nic' | 'sw', a: Pos, b: Pos | null, n: number) => {
    if (!b){ out.unplaced += n; return; }
    runs[kind].push({lengthM: a.x === b.x && a.z === b.z ? IN_RACK_M : runLength(a, b, RUN), n});
  };
  // Fabrics in catalog order, so the result depends only on what is placed and where
  for (const t of Object.values(cat)){
    const racks = gpuRacks.get(t.id)?.sort(byPos);
    if (!racks) continue;
    if (t.fabric !== 'x800' || !t.nics || !sw){ out.skipped.push({type: t.id, racks: racks.length, reason: t.fabric && t.fabric !== 'x800' ? t.fabric : 'unsourced'}); continue; }
    if (t.nicGbps !== sw.portGbps){ out.skipped.push({type: t.id, racks: racks.length, reason: 'speed'}); continue; }
    const planes = t.planes ?? 1, perRackPlane = t.nics / planes;
    const rails = opts.railOptimized ? Math.max(1, Math.round((t.rails ?? 1) / planes)) : 1;
    const plan = planFabric({endpoints: racks.length * perRackPlane, radix, oversubscription: opts.oversubscription, rails});
    out.modeled.push({type: t.id, racks: racks.length, planes, rails, endpoints: racks.length * t.nics, plan, switches: plan.switches * planes});
    out.endpoints += racks.length * t.nics;
    out.switchPorts += planes * (plan.endpointLinks + 2 * plan.uplinks + 2 * plan.coreLinks);
    for (let p = 0; p < planes; p++){
      const leaves = take(plan.leaves), spines = take(plan.spines), cores = take(plan.cores);
      // Rail r of every rack fills rail r's leaves in rack order; a plain fabric is one rail holding every NIC
      const down = plan.downPerLeaf, perRail = perRackPlane / rails, leavesPerRail = plan.leaves / rails;
      for (let r = 0; r < rails; r++){
        let filled = 0;
        for (const rack of racks){
          let left = perRail;
          while (left > 0){
            const leaf = r * leavesPerRail + Math.floor(filled / down), n = Math.min(left, down - filled % down);
            run('nic', rack, leaves[leaf], n);
            filled += n; left -= n;
          }
        }
      }
      // Every leaf spreads its uplinks evenly over the spines, and every spine its core links over the cores
      const spread = (from: (Pos | null)[], per: number, to: (Pos | null)[]) => {
        if (!to.length) return;
        from.forEach((f, i) => {
          const count = new Map<number, number>();
          for (let u = 0; u < per; u++){ const j = (i * per + u) % to.length; count.set(j, (count.get(j) ?? 0) + 1); }
          for (const [j, n] of count) f ? run('sw', f, to[j], n) : (out.unplaced += n);
        });
      };
      spread(leaves, plan.upPerLeaf, spines);
      spread(spines, plan.coreLinks / (plan.spines || 1), cores);
    }
    out.switchesNeeded += plan.switches * planes;
  }
  out.ibRacksNeeded = perRack ? Math.ceil(out.switchesNeeded / perRack) : 0;
  const fits = (gbps: number, ends: 'nic' | 'switch') => cables.filter(c => c.gbps === gbps && (c.ends === ends || c.ends === 'any'));
  const gbps = sw?.portGbps ?? 0;
  for (const [kind, ends] of [['nic', 'nic'], ['sw', 'switch']] as const){
    const t = tally(runs[kind], fits(gbps, ends));
    for (const [id, n] of Object.entries(t.byClass)) out.byClass[id] += n;
    out.beyond += t.beyond; out.longestM = Math.max(out.longestM, t.longestM);
  }
  out.nicRuns = runs.nic.reduce((n, r) => n + r.n, 0);
  out.switchRuns = runs.sw.reduce((n, r) => n + r.n, 0);
  return out;
}

// ---------- text, shared by the panel and the architecture report ----------
export const CABLE_LABEL: Record<string, 'cableAcc' | 'cableAec' | 'cableDr4'> = {acc: 'cableAcc', aec: 'cableAec', dr4: 'cableDr4'};
const WHY = {quantum2: 'fabricWhyQuantum2', ethernet: 'fabricWhyEthernet', unsourced: 'fabricWhyUnsourced', speed: 'fabricWhySpeed'} as const;
export const cableLabel = (c: CableClass): string => CABLE_LABEL[c.id] ? tr(CABLE_LABEL[c.id]!, {m: c.maxM}) : c.id;

export interface FabricText {rows: [label: string, value: string][]; status: {lvl: 'ok' | 'warn'; txt: string} | null; skipped: string[]}

export function fabricText(f: HallFabric, cat: Catalog, cables: CableClass[]): FabricText{
  const skipped = f.skipped.map(s => tr('fabricSkipped', {name: catName(cat[s.type]!), reason: tr(WHY[s.reason])}));
  if (!f.modeled.length) return {rows: [], status: null, skipped};
  const gbps = f.switchType ? cat[f.switchType]!.portGbps ?? 0 : 0;
  const rows: [string, string][] = f.modeled.map(m => [catName(cat[m.type]!), m.planes > 1
    ? tr('fabricTypePlanes', {racks: m.racks, leaves: m.plan.leaves, spines: m.plan.spines, planes: m.planes})
    : tr('fabricTypeValue', {racks: m.racks, leaves: m.plan.leaves, spines: m.plan.spines})]);
  rows.push(
    [tr('rowFabricNics'), tr('rowFabricNicsValue', {n: f.endpoints.toLocaleString(), gbps})],
    [tr('rowFabricTiers'), String(Math.max(...f.modeled.map(m => m.plan.tiers)))],
    [tr('rowFabricSwitches'), f.switchesNeeded.toLocaleString()],
    [tr('rowFabricIbRacks', {per: f.perRack}), tr('rowFabricIbRacksValue', {need: f.ibRacksNeeded, placed: f.ibRacks})],
    [tr('rowFabricPortsPerNic'), (f.switchPorts / f.endpoints).toFixed(1)],
    ...cables.filter(c => c.gbps === gbps).map(c => [cableLabel(c), (f.byClass[c.id] ?? 0).toLocaleString()] as [string, string]),
  );
  if (f.unplaced) rows.push([tr('rowFabricUnplaced'), f.unplaced.toLocaleString()]);
  if (f.beyond) rows.push([tr('rowFabricBeyond'), f.beyond.toLocaleString()]);
  if (f.longestM) rows.push([tr('rowFabricLongest'), `${f.longestM.toFixed(1)} m`]);
  const status = f.ibRacks >= f.ibRacksNeeded ? {lvl: 'ok' as const, txt: tr('fabricEnough', {placed: f.ibRacks})}
    : {lvl: 'warn' as const, txt: f.gpuPorts <= f.ibRacks * f.perRack * f.radix && f.ibRacks
      ? tr('fabricShort', {gpus: f.gpuPorts, ports: f.ibRacks * f.perRack * f.radix, need: f.ibRacksNeeded, placed: f.ibRacks})
      : tr('fabricShortAlso', {need: f.ibRacksNeeded, placed: f.ibRacks})};
  return {rows, status, skipped};
}
