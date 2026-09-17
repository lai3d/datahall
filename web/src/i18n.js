// 界面语言：默认英文，支持简体中文。纯模块，不依赖 DOM；页面上的切换和持久化在 main.js。
// 容量问题、导入提示等文本在生成时按当前语言输出，所以 sim.js、supply.js 这些纯函数也从这里取文案。
import en from './locales/en.js';
import zh from './locales/zh.js';

const MESSAGES = {en, zh};
export const LANGS = [{id: 'en', label: 'English', html: 'en'}, {id: 'zh', label: '中文', html: 'zh-CN'}];
export const DEFAULT_LANG = 'en';
let lang = DEFAULT_LANG;

export const getLang = () => lang;
export function setLang(id){ if (MESSAGES[id]) lang = id; return lang; }
export const htmlLang = () => LANGS.find(l => l.id === lang).html;

// tr('issueDist', {need, cap})；变量都是已格式化好的文本或数字
export function tr(key, vars = {}){
  const m = MESSAGES[lang][key];
  if (m === undefined) throw new Error(`missing message "${key}" for ${lang}`);
  return typeof m === 'function' ? m(vars) : m;
}

// 位置文本，x、z 从 0 开始
export const loc = (x, z) => tr('loc', {x: x + 1, z: z + 1});

// 设备目录的名称和说明：catalog.json 里 name、note 是中文原文（导出的 USD、layout.json 沿用），
// 其他语言写在 i18n.<lang> 下，缺的字段回退到原文
export const catName = t => t.i18n?.[lang]?.name ?? t.name;
export const catNote = t => t.i18n?.[lang]?.note ?? t.note;
