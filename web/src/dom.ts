// Get an element that must exist in index.html; if it is missing, the page and code are out of sync, so throw
export function $<T extends HTMLElement = HTMLElement>(selector: string): T{
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`element not found: ${selector}`);
  return el;
}

// Panels are fully redrawn on every state change. Writing innerHTML directly drops keyboard focus to body and closes any open dropdown,
// so: skip the write if the content is unchanged; if it changed and focus was inside this region, give focus back to the matching control after the redraw
// Remember the last written content and the first child node after writing; if something else changed the region (first child differs), it does not count as "unchanged"
const rendered = new WeakMap<HTMLElement, {html: string; first: ChildNode | null}>();
// Attributes used to recognize the "same" control before and after a redraw
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
  // No identifying attribute: match by index among the focusable controls in the region
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
