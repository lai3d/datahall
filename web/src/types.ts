// Data types shared across the web version. Formats shared with Unity and the pxr converter (layout.json, capacity-cases.json) live in spec/
import type catalog from '../../spec/catalog.json';

// One entry of spec/catalog.json. Numeric fields are omitted when not applicable
export interface CatalogItem {
  id: string;
  name: string;
  group: 'gpu' | 'net' | 'fac';
  c: string;              // CSS variable name for the color, e.g. --gpu
  kw?: number;            // IT power
  gpus?: number;
  liq?: number;           // Liquid-cooled fraction 0..1
  liqCool?: number;       // Liquid cooling capacity (CDU)
  airCool?: number;       // Air cooling capacity (in-row cooler)
  dist?: number;          // Distribution capacity (RPP)
  ports?: number;         // Backend network ports (IB)
  ovh?: number;           // Device overhead
  cap: number;            // Estimated price, million USD
  h: number;              // Height, meters
  future?: boolean;       // Roadmap product
  note: string;
  i18n?: Record<string, {name?: string; note?: string}>;
}
export type Catalog = Record<string, CatalogItem>;
// Compile-time check that catalog.json matches CatalogItem
export type CatalogJson = typeof catalog;

export interface Grid {GW: number; GD: number; CX: number; CZ: number}

export interface Pos {x: number; z: number}
export type Cell = [x: number, z: number];

// Supply relation fields: coolantSource → CDU, powerFeed → RPP
export type FeedField = 'coolantSource' | 'powerFeed';
export type Feeds = Partial<Record<FeedField, Cell>>;

// Device object used for computation
export interface Item extends Pos {
  type: string;
  feeds?: Feeds;
  phase?: number;
}

// Layout snapshot: {u: utility MW, list: [[type, x, z, props?], ...]}; entry format: see entryProps in edit.ts
export interface EntryProps {feeds?: Feeds; phase?: number}
export type Entry = [type: string, x: number, z: number, props?: EntryProps | Feeds];
export interface Layout {u: number; list: Entry[]}
