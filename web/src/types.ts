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
  radix?: number;         // Ports per switch (IB), back-end fabric
  portGbps?: number;      // Speed of one switch port, Gb/s
  ovh?: number;           // Device overhead
  cap: number;            // Estimated price, million USD
  h: number;              // Height, meters
  parts?: Part[];         // What the rack holds, as the maker documents it (drawn by rack-faces.ts)
  future?: boolean;       // Roadmap product
  airDense?: boolean;     // Air-cooled and dense enough that the capacity check warns about it
  fabric?: FabricKind;    // Back-end fabric of a GPU rack: modeled (x800) or why not
  nics?: number;          // Back-end NIC ports per rack, across all planes
  rails?: number;         // Rails across all planes
  planes?: number;        // Independent fabrics, 1 when omitted
  nicGbps?: number;       // Speed of one back-end NIC port, Gb/s
  note: string;
  i18n?: Record<string, {name?: string; note?: string}>;
  sources: Source[];      // where the figures come from (spec/catalog.schema.json)
  ranges?: Partial<Record<RangeField, [number, number]>>;   // range the sources give, when wider than one value
}
// A source behind catalog figures. official: vendor material; reported: journalists or analysts; estimate: this project's own reasoning (no URL)
export type SourceType = 'official' | 'reported' | 'estimate';
// Figures a source can back. RangeField: the capacity and price figures, which may carry a source range;
// ItemField adds the back-end fabric fields; maxM is a cable class's reach (catalog `cables`)
export type RangeField = 'kw' | 'gpus' | 'liq' | 'liqCool' | 'airCool' | 'dist' | 'ports' | 'ovh' | 'cap';
export type ItemField = RangeField | 'radix' | 'portGbps' | 'fabric' | 'nics' | 'rails' | 'planes' | 'nicGbps' | 'parts';
// One kind of unit in a rack: compute tray, NVLink switch tray, power shelf, whole server, NPU node or InfiniBand switch
export type PartKind = 'compute' | 'nvswitch' | 'power' | 'system' | 'npunode' | 'ibswitch';
export interface Part {kind: PartKind; n: number; u?: number; gpus?: number; cpus?: number; psus?: number; kw?: number; ports?: number}
export type SourcedField = ItemField | 'maxM';
// x800: back-end fabric modeled on Quantum-X800 InfiniBand; the others say why it is not
export type FabricKind = 'x800' | 'quantum2' | 'ethernet' | 'unsourced';
// A cable or optics class of the back-end fabric (catalog `cables`). ends: which runs it may serve
export interface CableClass {id: string; gbps: number; ends: 'nic' | 'switch' | 'any'; maxM: number; sources: Source[]}
export interface Source {title: string; publisher?: string; url?: string; date?: string; checked: string; type: SourceType; supports: SourcedField[]; i18n?: Record<string, {title?: string}>}
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
