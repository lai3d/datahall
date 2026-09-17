// Derived view of the current hall, shared by the panel (ui.tsx) and the 3D scene sync in main.ts.
// Reads `state`; everything it returns is recomputed from scratch, which is cheap at hall sizes.
import {CAT} from './catalog.ts';
import {compute} from './sim.ts';
import type {Totals} from './sim.ts';
import {supplyLoads, supplyIssues} from './supply.ts';
import type {Loads, Supply} from './supply.ts';
import {keyOf} from './grid.ts';
import type {Links} from './grid.ts';
import {state, itemList, isActive, inView} from './state.ts';
import type {Issue} from './sim.ts';
import type {Item} from './types.ts';

// Supply info for the details panel: the device, its load as a CDU / RPP, and the supply equipment it connects to
export interface SupplyInfo {item: Item; supply: Supply | undefined; links: Links<Item> | undefined; loads: Loads; active: Item[]}

export interface HallModel {
  all: Item[];          // every placed device
  active: Item[];       // devices that take part in the calculation (not failed, within the viewed phase)
  planned: Item[];      // devices within the viewed phase, regardless of the failure drill
  totals: Totals;
  loads: Loads;
  perDevice: Issue[];   // per-device overload issues
  blocking: boolean;    // the hall cannot be powered on
  supplyByKey: Map<string, SupplyInfo>;
  alerts: Set<string>;  // keys that get a red cap in 3D: overloaded supplies and unconnected devices
}

export function hallModel(): HallModel{
  const all = itemList();
  const active = all.filter(it => isActive(keyOf(it.x, it.z), it));
  const planned = all.filter(inView);
  const totals = compute(active, CAT, state.utility);
  const loads = supplyLoads(active, CAT);
  const perDevice = supplyIssues(loads, totals);
  const blocking = totals.blocking || perDevice.some(i => i.lvl === 'bad');
  const supplyByKey = new Map(active.map(it => [keyOf(it.x, it.z), {item: it, supply: loads.supplies.get(it), links: loads.links.get(it), loads, active}]));
  const alerts = new Set([...loads.supplies].filter(([, v]) => v.overloaded).map(([it]) => keyOf(it.x, it.z)));
  loads.unconnected.forEach(u => alerts.add(keyOf(u.item.x, u.item.z)));
  return {all, active, planned, totals, loads, perDevice, blocking, supplyByKey, alerts};
}
