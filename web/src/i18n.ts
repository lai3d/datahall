// 界面语言：默认英文，支持简体中文。纯模块，不依赖 DOM；页面上的切换和持久化在 main.ts。
// 容量问题、导入提示等文本在生成时按当前语言输出，所以 sim.ts、supply.ts 这些纯函数也从这里取文案。
import en from './locales/en.ts';
import zh from './locales/zh.ts';
import type {CatalogItem} from './types.ts';

export type Messages = typeof en;
export type MessageKey = keyof Messages;
// 某条文案需要的变量；纯文本文案没有变量
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

// tr('issueDist', {need, cap})；变量都是已格式化好的文本或数字。键和变量在编译期检查
export function tr<K extends MessageKey>(key: K, ...args: TrArgs<K>): string{
  const m: unknown = MESSAGES[lang][key];
  if (m === undefined) throw new Error(`missing message "${String(key)}" for ${lang}`);
  return typeof m === 'function' ? m(args[0]) : m as string;
}

// 位置文本，x、z 从 0 开始
export const loc = (x: number, z: number): string => tr('loc', {x: x + 1, z: z + 1});

// 设备目录的名称和说明：catalog.json 里 name、note 是中文原文（导出的 USD、layout.json 沿用），
// 其他语言写在 i18n.<lang> 下，缺的字段回退到原文
export const catName = (t: CatalogItem): string => t.i18n?.[lang]?.name ?? t.name;
export const catNote = (t: CatalogItem): string => t.i18n?.[lang]?.note ?? t.note;
