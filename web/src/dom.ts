// Get an element that must exist in index.html; if it is missing, the page and code are out of sync, so throw
export function $<T extends HTMLElement = HTMLElement>(selector: string): T{
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`element not found: ${selector}`);
  return el;
}

