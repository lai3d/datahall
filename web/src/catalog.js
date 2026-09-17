// 唯一数据源是 spec/catalog.json，构建时打进包里
import data from '../../spec/catalog.json' with {type: 'json'};

export const CATALOG = data.items;
export const CAT = Object.fromEntries(CATALOG.map(t => [t.id, t]));
