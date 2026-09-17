import {toItem, toEntry} from './edit.js';

export const state = {
  items: new Map(),   // key -> {type, x, z, feeds?, phase?, mesh}；feeds 见 grid.js 的 supplyLinks，phase 见 growth.js
  utility: 2,         // 市电 MW
  tool: null,         // 当前选中的设备类型
  selected: null,     // 当前选中的已摆放设备 key
  placeMode: 'one',   // 放置方式：'one' 单个，'row' 整排
  rowAnchor: null,    // 整排放置时已经点过的第一格 {x, z}
  assignFrom: null,   // 指定接入模式：正在给这台 CDU / RPP（key）点选设备
  phase: 1,           // 增长规划：新放的设备进第几阶段
  viewPhase: null,    // 增长规划：只看到第几阶段为止（null 为全部），之后阶段的设备不参与计算
  headroomType: null, // 增长规划：估算还能加几台的机柜类型（null 时自动选）
  failed: new Set(),  // 故障演练：标记为故障的设施 key。不进布局、撤销历史和分享链接
  powered: false,
  powerStart: 0,
};

// 都是深拷贝：快照进撤销历史和 localStorage，之后不能跟着 state 变
// 是否参与计算：没有在故障演练里标记故障，且在当前查看的阶段之内
export const inView = it => state.viewPhase === null || (it.phase || 1) <= state.viewPhase;
export const isActive = (key, it) => !state.failed.has(key) && inView(it);

export const itemList = () => [...state.items.values()].map(i => toItem(toEntry(i)));
// 布局快照 {u, list: [[type, x, z, props?], ...]}，条目格式见 edit.js 的 entryProps
export const snapshot = () => ({u: state.utility, list: [...state.items.values()].map(toEntry)});
