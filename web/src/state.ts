import type {Group} from 'three';
import {toItem, toEntry} from './edit.ts';
import type {Item, Layout, Pos} from './types.ts';
import {DEFAULT_LOAD, DEFAULT_PRICE} from './energy.ts';
import type {EnergyInputs} from './energy.ts';
import {DEFAULT_MAINT, DEFAULT_YEARS} from './ownership.ts';
import type {OwnershipInputs} from './ownership.ts';
import type {GoalLimit} from './goal.ts';
import type {ScenarioId} from './scenarios.ts';

// Devices placed in the scene: computation fields plus the three model
export interface PlacedItem extends Item {mesh: Group}

// A status line with optional warnings under the share and OpenUSD sections. text null shows the section's default hint
export interface Notice {text: string | null; warnings: string[]}

// What the goal generator placed, for the message under its form
export interface GoalSummary {type: string; asked: number; racks: number; gpus: number; limit: GoalLimit | null; maxRacks: number; utility: number; support: [string, number][]; found: boolean}

// Panel-only state that is not part of the layout
export interface UiState {
  share: Notice;
  usd: Notice;
  exportReady: boolean;   // the download channel is ready (the OpenUSD section is shown)
  exporting: boolean;     // a save is in progress; export buttons are disabled
  canUndo: boolean;
  canRedo: boolean;
  tutorialOffer: boolean; // show the "start the tutorial" offer (first visit)
  panelCollapsed: boolean; // narrow screens: the panel is folded down to its status bar
  goal: GoalSummary | null;  // result of the last goal-based layout, shown under the form until the next change
  method: string | null;    // section of the methodology dialog to show; null when closed
  lastPlaced: string | null; // device type placed by the last tap, for the stage bar's feedback; cleared when the tool changes
}

export interface AppState {
  items: Map<string, PlacedItem>;
  utility: number;
  tool: string | null;
  selected: string | null;
  placeMode: 'one' | 'row';
  rowAnchor: Pos | null;
  assignFrom: string | null;
  phase: number;
  viewPhase: number | null;
  headroomType: string | null;
  failed: Set<string>;
  powered: boolean;
  powerStart: number;
  tutorial: number | null;   // index into tutorial.ts STEPS while the tutorial runs
  scenario: {id: ScenarioId; done: boolean} | null;   // the scenario being played (scenarios.ts)
  energy: EnergyInputs;      // annual energy estimate inputs; view state, kept in localStorage, not in the layout or share links
  ownership: OwnershipInputs;   // ownership estimate inputs (years, maintenance); view state like energy
  ui: UiState;
}

export const state: AppState = {
  items: new Map(),   // key -> {type, x, z, feeds?, phase?, mesh}; feeds: see supplyLinks in grid.ts, phase: see growth.ts
  utility: 2,         // Utility MW
  tool: null,         // Currently selected device type
  selected: null,     // Key of the currently selected placed device
  placeMode: 'one',   // Placement mode: 'one' single, 'row' whole row
  rowAnchor: null,    // First cell already clicked during row placement {x, z}
  assignFrom: null,   // Assign mode: picking devices for this CDU / RPP (key)
  phase: 1,           // Growth planning: phase that newly placed devices go into
  viewPhase: null,    // Growth planning: view only up to this phase (null for all); devices in later phases are excluded from computation
  headroomType: null, // Growth planning: rack type for the headroom estimate (auto-picked when null)
  failed: new Set(),  // Failure drill: keys of facilities marked failed. Not part of the layout, undo history or share links
  powered: false,
  powerStart: 0,
  tutorial: null,
  scenario: null,
  energy: {price: DEFAULT_PRICE, load: DEFAULT_LOAD},
  ownership: {years: DEFAULT_YEARS, maint: DEFAULT_MAINT},
  ui: {share: {text: null, warnings: []}, usd: {text: null, warnings: []}, exportReady: false, exporting: false, canUndo: false, canRedo: false, tutorialOffer: false, panelCollapsed: false, goal: null, method: null, lastPlaced: null},
};

// All deep copies: snapshots go into undo history and localStorage and must not follow later state changes
// Whether a device takes part in computation: not marked failed in the failure drill, and within the currently viewed phase
export const inView = (it: {phase?: number}): boolean => state.viewPhase === null || (it.phase || 1) <= state.viewPhase;
export const isActive = (key: string, it: {phase?: number}): boolean => !state.failed.has(key) && inView(it);

export const itemList = (): Item[] => [...state.items.values()].map(i => toItem(toEntry(i)));
// Layout snapshot {u, list: [[type, x, z, props?], ...]}; entry format: see entryProps in edit.ts
export const snapshot = (): Layout => ({u: state.utility, list: [...state.items.values()].map(toEntry)});
