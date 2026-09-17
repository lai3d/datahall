// 取 index.html 里一定存在的元素；找不到说明页面和代码对不上，直接报错
export function $<T extends HTMLElement = HTMLElement>(selector: string): T{
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`element not found: ${selector}`);
  return el;
}
