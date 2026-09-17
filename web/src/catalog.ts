// The single source of truth is spec/catalog.json, bundled at build time
import data from '../../spec/catalog.json' with {type: 'json'};
import type {Catalog, CatalogItem} from './types.ts';

export const CATALOG: CatalogItem[] = data.items as CatalogItem[];
export const CAT: Catalog = Object.fromEntries(CATALOG.map(t => [t.id, t]));
