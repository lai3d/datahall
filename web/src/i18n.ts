// UI language: English by default, Simplified Chinese supported. Pure module, no DOM dependency; the on-page switch and persistence live in main.ts.
// Capacity issues, import warnings and similar text are produced in the current language, so pure functions like sim.ts and supply.ts also get their copy from here.
import en from './locales/en.ts';
import zh from './locales/zh.ts';
import type {CatalogItem} from './types.ts';

export type Messages = typeof en;
export type MessageKey = keyof Messages;
// Variables a message needs; plain-text messages have none
type VarsOf<K extends MessageKey> = Messages[K] extends (vars: infer V) => string ? V : never;
type TrArgs<K extends MessageKey> = Messages[K] extends string ? [] : [vars: VarsOf<K>];

const MESSAGES = {en, zh} satisfies Record<string, Messages>;
export type Lang = keyof typeof MESSAGES;
export const LANGS: {id: Lang; label: string; html: string}[] = [{id: 'en', label: 'English', html: 'en'}, {id: 'zh', label: '中文', html: 'zh-CN'}];
export const DEFAULT_LANG: Lang = 'en';
let lang: Lang = DEFAULT_LANG;

const isLang = (id: string): id is Lang => id in MESSAGES;
export const getLang = (): Lang => lang;
export function setLang(id: string): Lang{ if (isLang(id)) lang = id; return lang; }
export const htmlLang = (): string => LANGS.find(l => l.id === lang)!.html;

// tr('issueDist', {need, cap}); variables are pre-formatted text or numbers. Keys and variables are checked at compile time
export function tr<K extends MessageKey>(key: K, ...args: TrArgs<K>): string{
  const m: unknown = MESSAGES[lang][key];
  if (m === undefined) throw new Error(`missing message "${String(key)}" for ${lang}`);
  return typeof m === 'function' ? m(args[0]) : m as string;
}

// Location text, x and z start at 0
export const loc = (x: number, z: number): string => tr('loc', {x: x + 1, z: z + 1});

// Catalog names and notes: name and note in catalog.json are the Chinese originals (kept in exported USD and layout.json);
// other languages go under i18n.<lang>, and missing fields fall back to the original
export const catName = (t: CatalogItem): string => t.i18n?.[lang]?.name ?? t.name;
export const catNote = (t: CatalogItem): string => t.i18n?.[lang]?.note ?? t.note;
