// 取 index.html 里一定存在的元素；找不到说明页面和代码对不上，直接报错
export function $<T extends HTMLElement = HTMLElement>(selector: string): T{
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`element not found: ${selector}`);
  return el;
}

// 面板每次状态变化都整块重画。直接写 innerHTML 会把键盘焦点丢到 body、关掉正开着的下拉框，
// 所以：内容没变就不写；变了的话，重画前焦点在这块区域里，重画后把焦点还给对应的控件
// 记下上次写入的内容和写入后的第一个子节点；别处改过这块区域（第一个子节点变了）就不算“没变”
const rendered = new WeakMap<HTMLElement, {html: string; first: ChildNode | null}>();
// 按这些属性认出重画前后的“同一个”控件
const KEY_ATTRS = ['id', 'data-u', 'data-t', 'data-mode', 'data-lang', 'data-phase', 'data-feed', 'data-preset'];
const FOCUSABLE = 'button, select, input, textarea, a[href], [tabindex]';

function focusTarget(root: HTMLElement, active: HTMLElement): (next: HTMLElement) => HTMLElement | null{
  for (const attr of KEY_ATTRS){
    const value = active.getAttribute(attr);
    if (value !== null){
      const selector = `${active.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
      return next => next.querySelector<HTMLElement>(selector);
    }
  }
  // 没有可识别的属性：按区域里第几个可聚焦控件找
  const index = [...root.querySelectorAll(FOCUSABLE)].indexOf(active);
  return next => index < 0 ? null : next.querySelectorAll<HTMLElement>(FOCUSABLE)[index] ?? null;
}

export function setHTML(el: HTMLElement, html: string): void{
  const last = rendered.get(el);
  if (last && last.html === html && last.first === el.firstChild) return;
  const active = document.activeElement;
  const find = active instanceof HTMLElement && active !== el && el.contains(active) ? focusTarget(el, active) : null;
  el.innerHTML = html;
  rendered.set(el, {html, first: el.firstChild});
  find?.(el)?.focus({preventScroll: true});
}
