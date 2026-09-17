export const state = {
  items: new Map(),   // key -> {type, x, z, mesh}
  utility: 2,         // 市电 MW
  tool: null,         // 当前选中的设备类型
  selected: null,     // 当前选中的已摆放设备 key
  placeMode: 'one',   // 放置方式：'one' 单个，'row' 整排
  rowAnchor: null,    // 整排放置时已经点过的第一格 {x, z}
  powered: false,
  powerStart: 0,
};

export const itemList = () => [...state.items.values()].map(i => ({type: i.type, x: i.x, z: i.z}));
export const snapshot = () => ({u: state.utility, list: [...state.items.values()].map(i => [i.type, i.x, i.z])});
