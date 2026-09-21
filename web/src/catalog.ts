// The single source of truth is spec/catalog.json, bundled at build time
import data from '../../spec/catalog.json' with {type: 'json'};
import type {CableClass, Catalog, CatalogItem} from './types.ts';

export const CATALOG: CatalogItem[] = data.items as CatalogItem[];
// Data version of spec/catalog.json: the date its figures were last checked. Exports carry it, so a result stays explainable after values change
export const CATALOG_VERSION: string = data.version;
export const CAT: Catalog = Object.fromEntries(CATALOG.map(t => [t.id, t]));
// Cable and optics classes of the back-end fabric, shortest reach first
export const CABLES: CableClass[] = data.cables as CableClass[];
