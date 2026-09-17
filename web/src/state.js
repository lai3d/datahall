export const state = {
  items: new Map(),   // key -> {type, x, z, feeds?, mesh}；feeds 是手动指定的供给设备，见 grid.js 的 supplyLinks
  utility: 2,         // 市电 MW
  tool: null,         // 当前选中的设备类型
  selected: null,     // 当前选中的已摆放设备 key
  placeMode: 'one',   // 放置方式：'one' 单个，'row' 整排
  rowAnchor: null,    // 整排放置时已经点过的第一格 {x, z}
  assignFrom: null,   // 指定接入模式：正在给这台 CDU / RPP（key）点选设备
  failed: new Set(),  // 故障演练：标记为故障的设施 key。不进布局、撤销历史和分享链接
  powered: false,
  powerStart: 0,
};

// feeds 深拷贝：快照进撤销历史和 localStorage，之后不能跟着 state 变
const copyFeeds = f => f && JSON.parse(JSON.stringify(f));
export const itemList = () => [...state.items.values()].map(i => i.feeds ? {type: i.type, x: i.x, z: i.z, feeds: copyFeeds(i.feeds)} : {type: i.type, x: i.x, z: i.z});
// 布局快照 {u, list: [[type, x, z], ...]}；有手动指定供给设备的设备多一项 feeds：[type, x, z, feeds]
export const snapshot = () => ({u: state.utility, list: [...state.items.values()].map(i => i.feeds ? [i.type, i.x, i.z, copyFeeds(i.feeds)] : [i.type, i.x, i.z])});
