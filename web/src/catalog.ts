// 唯一数据源是 spec/catalog.json，构建时打进包里
import data from '../../spec/catalog.json' with {type: 'json'};
import type {Catalog, CatalogItem} from './types.ts';

export const CATALOG: CatalogItem[] = data.items as CatalogItem[];
export const CAT: Catalog = Object.fromEntries(CATALOG.map(t => [t.id, t]));
