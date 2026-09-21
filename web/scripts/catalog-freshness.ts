// Reports where spec/catalog.json has gone stale: devices nobody has re-checked lately, and old sources still backing figures the app shows.
// Nothing here reads the sources themselves, only their dates. Run by hand or in CI: npm run catalog-check (exit code 1 when a device is past the re-check threshold)
import {CATALOG, CATALOG_VERSION} from '../src/catalog.ts';
import type {CatalogItem, ItemField, Source, SourcedField} from '../src/types.ts';

// Devices are due for a re-check a quarter after their newest `checked` date: rack power, liquid share and price move
// with each vendor announcement, and a quarter is about how long this project has gone between full passes (see CLAUDE.md, Data reliability)
export const CHECK_DAYS = 90;
// A source turns into background after 18 months: long enough that superseded product pages and repriced analyst notes stand out,
// short enough that a whole product generation (GB200 → GB300 → Vera Rubin, roughly a year apart) cannot pass unnoticed
export const SOURCE_MONTHS = 18;

// Fields the capacity model and price estimate read; the same list tests/catalog.test.ts requires a source for
const FIELDS: ItemField[] = ['kw', 'gpus', 'liq', 'liqCool', 'airCool', 'dist', 'ports', 'ovh', 'cap', 'radix', 'portGbps', 'fabric', 'nics', 'rails', 'planes', 'nicGbps'];

export interface StaleDevice {id: string; name: string; checked: string; days: number}
export interface AgingSource {id: string; title: string; publisher?: string; date: string; months: number; supports: SourcedField[]}
export interface HostCount {host: string; count: number}
export interface Freshness {stale: StaleDevice[]; aging: AgingSource[]; hosts: HostCount[]}

// Source dates may be month-only (spec/catalog.schema.json allows YYYY-MM), which counts as the first of that month
const full = (d: string) => d.length === 7 ? `${d}-01` : d;
const day = (d: string) => Date.parse(`${full(d)}T00:00:00Z`);
// Today as UTC midnight, so a run at any hour measures the same ages
const midnight = (today: Date) => Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
const days = (from: string, now: number) => Math.floor((now - day(from)) / 86_400_000);
// The day n calendar months before today: a source published before it is older than n months (a 2025-03-20 source is 18 months old on 2026-09-20, not older)
const monthsBefore = (now: number, n: number) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, d.getUTCDate());
};
// Whole months an ISO date is old, for the report
function months(from: string, now: number): number {
  const [y, m, d] = full(from).split('-').map(Number) as [number, number, number];
  const t = new Date(now);
  const whole = (t.getUTCFullYear() - y) * 12 + (t.getUTCMonth() + 1 - m);
  return t.getUTCDate() < d ? whole - 1 : whole;
}

// The figures a source still backs: a field it lists that the device actually has. A source backing nothing current is context, not evidence
const backing = (t: CatalogItem, s: Source) => s.supports.filter((f): f is ItemField => (FIELDS as SourcedField[]).includes(f) && t[f as ItemField] !== undefined);

// URL host without www., so the same publication counts once however it links
function host(url: string): string | undefined {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return undefined; }
}

// Pure: takes the catalog and the day to measure against, so the result never depends on when it runs
export function freshness(items: CatalogItem[], today: Date): Freshness {
  const now = midnight(today);
  const cutoff = monthsBefore(now, SOURCE_MONTHS);
  const stale: StaleDevice[] = [];
  const aging: AgingSource[] = [];
  const hosts = new Map<string, number>();
  for (const t of items){
    const checked = t.sources.map(s => s.checked).sort().at(-1);
    if (checked !== undefined){
      const age = days(checked, now);
      if (age > CHECK_DAYS) stale.push({id: t.id, name: t.name, checked, days: age});
    }
    for (const s of t.sources){
      const supports = backing(t, s);
      if (s.date !== undefined && supports.length > 0 && day(s.date) < cutoff)
        aging.push({id: t.id, title: s.title, publisher: s.publisher, date: s.date, months: months(s.date, now), supports});
      const h = s.url === undefined ? undefined : host(s.url);
      if (h !== undefined) hosts.set(h, (hosts.get(h) ?? 0) + 1);
    }
  }
  // Oldest first, then by id, so the order never depends on catalog order
  stale.sort((a, b) => a.checked.localeCompare(b.checked) || a.id.localeCompare(b.id));
  aging.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id) || a.title.localeCompare(b.title));
  return {stale, aging, hosts: [...hosts].map(([h, count]) => ({host: h, count})).sort((a, b) => b.count - a.count || a.host.localeCompare(b.host))};
}

function report(f: Freshness, today: Date): string {
  const lines = [`catalog ${CATALOG_VERSION}, checked against ${today.toISOString().slice(0, 10)}`, ''];
  lines.push(`Devices unchecked for more than ${CHECK_DAYS} days: ${f.stale.length}`);
  for (const d of f.stale) lines.push(`  ${d.id} (${d.name}): checked ${d.checked}, ${d.days} days ago`);
  lines.push('', `Sources older than ${SOURCE_MONTHS} months still backing a figure: ${f.aging.length}`);
  for (const s of f.aging) lines.push(`  ${s.id}: ${s.date} (${s.months}+ months) ${s.publisher ?? '?'} — ${s.title} [${s.supports.join(', ')}]`);
  lines.push('', 'Evidence by host (information only, nothing here fails):');
  for (const h of f.hosts) lines.push(`  ${h.count}  ${h.host}`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`){
  const today = new Date();
  const f = freshness(CATALOG, today);
  console.log(report(f, today));
  process.exit(f.stale.length > 0 ? 1 : 0);
}
