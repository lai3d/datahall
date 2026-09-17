// 网页版共用的数据类型。和 Unity、pxr 转换器共用的格式（layout.json、capacity-cases.json）见 spec/
import type catalog from '../../spec/catalog.json';

// spec/catalog.json 的一项。数值字段不适用时省略
export interface CatalogItem {
  id: string;
  name: string;
  group: 'gpu' | 'net' | 'fac';
  c: string;              // 配色的 CSS 变量名，例如 --gpu
  kw?: number;            // IT 功耗
  gpus?: number;
  liq?: number;           // 液冷比例 0..1
  liqCool?: number;       // 液冷能力（CDU）
  airCool?: number;       // 风冷能力（列间空调）
  dist?: number;          // 配电能力（RPP）
  ports?: number;         // 后端网络端口（IB）
  ovh?: number;           // 设备自耗
  cap: number;            // 价格估算，百万美元
  h: number;              // 高度，米
  future?: boolean;       // 路线图产品
  note: string;
  i18n?: Record<string, {name?: string; note?: string}>;
}
export type Catalog = Record<string, CatalogItem>;
// 编译期检查 catalog.json 和 CatalogItem 对得上
export type CatalogJson = typeof catalog;

export interface Grid {GW: number; GD: number; CX: number; CZ: number}

export interface Pos {x: number; z: number}
export type Cell = [x: number, z: number];

// 供给关系字段：coolantSource → CDU，powerFeed → RPP
export type FeedField = 'coolantSource' | 'powerFeed';
export type Feeds = Partial<Record<FeedField, Cell>>;

// 计算用的设备对象
export interface Item extends Pos {
  type: string;
  feeds?: Feeds;
  phase?: number;
}

// 布局快照：{u: 市电 MW, list: [[type, x, z, props?], ...]}，条目格式见 edit.ts 的 entryProps
export interface EntryProps {feeds?: Feeds; phase?: number}
export type Entry = [type: string, x: number, z: number, props?: EntryProps | Feeds];
export interface Layout {u: number; list: Entry[]}
