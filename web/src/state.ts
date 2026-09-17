import type {Group} from 'three';
import {toItem, toEntry} from './edit.ts';
import type {Item, Layout, Pos} from './types.ts';

// Devices placed in the scene: computation fields plus the three model
export interface PlacedItem extends Item {mesh: Group}

// A status line with optional warnings under the share and OpenUSD sections. text null shows the section's default hint
export interface Notice {text: string | null; warnings: string[]}

// Panel-only state that is not part of the layout
export interface UiState {
  share: Notice;
  usd: Notice;
  exportReady: boolean;   // the download channel is ready (the OpenUSD section is shown)
  exporting: boolean;     // a save is in progress; export buttons are disabled
  canUndo: boolean;
  canRedo: boolean;
  tutorialOffer: boolean; // show the "start the tutorial" offer (first visit)
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
  ui: {share: {text: null, warnings: []}, usd: {text: null, warnings: []}, exportReady: false, exporting: false, canUndo: false, canRedo: false, tutorialOffer: false},
};

// All deep copies: snapshots go into undo history and localStorage and must not follow later state changes
// Whether a device takes part in computation: not marked failed in the failure drill, and within the currently viewed phase
export const inView = (it: {phase?: number}): boolean => state.viewPhase === null || (it.phase || 1) <= state.viewPhase;
export const isActive = (key: string, it: {phase?: number}): boolean => !state.failed.has(key) && inView(it);

export const itemList = (): Item[] => [...state.items.values()].map(i => toItem(toEntry(i)));
// Layout snapshot {u, list: [[type, x, z, props?], ...]}; entry format: see entryProps in edit.ts
export const snapshot = (): Layout => ({u: state.utility, list: [...state.items.values()].map(toEntry)});
