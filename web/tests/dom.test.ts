// @vitest-environment happy-dom
import {describe, expect, it} from 'vitest';
import {setHTML} from '../src/dom.ts';

const root = (html = '') => { const el = document.createElement('div'); el.innerHTML = html; document.body.replaceChildren(el); return el; };
const buttons = (pressed: number) => [2, 5, 10].map(u => `<button type="button" data-u="${u}" aria-pressed="${u === pressed}">${u} MW</button>`).join('');

describe('setHTML', () => {
  it('内容没变时不重写，节点和焦点都保留', () => {
    const el = root();
    setHTML(el, buttons(2));
    const first = el.querySelector('button')!;
    first.focus();
    setHTML(el, buttons(2));
    expect(el.querySelector('button')).toBe(first);
    expect(document.activeElement).toBe(first);
  });

  it('内容变了时按 data-* 属性把焦点还给对应的新控件', () => {
    const el = root();
    setHTML(el, buttons(2));
    el.querySelector<HTMLElement>('[data-u="5"]')!.focus();
    setHTML(el, buttons(5));
    expect(document.activeElement).toBe(el.querySelector('[data-u="5"]'));
    expect(document.activeElement!.getAttribute('aria-pressed')).toBe('true');
  });

  it('按 id 找回下拉框', () => {
    const el = root();
    setHTML(el, '<table><tr><td><select id="itemPhase"><option value="1">1</option></select></td></tr></table>');
    el.querySelector<HTMLElement>('#itemPhase')!.focus();
    setHTML(el, '<p>changed</p><table><tr><td><select id="itemPhase"><option value="1">1</option><option value="2">2</option></select></td></tr></table>');
    expect(document.activeElement).toBe(el.querySelector('#itemPhase'));
  });

  it('没有可识别属性时按第几个可聚焦控件找回', () => {
    const el = root();
    setHTML(el, '<button>a</button><button>b</button>');
    el.querySelectorAll('button')[1].focus();
    setHTML(el, '<button>a2</button><button>b2</button>');
    expect(document.activeElement!.textContent).toBe('b2');
  });

  it('焦点不在这块区域时不去抢焦点；别处改过内容时照样重写', () => {
    const outside = document.createElement('input');
    const el = root();
    document.body.append(outside);
    outside.focus();
    setHTML(el, buttons(2));
    expect(document.activeElement).toBe(outside);
    el.innerHTML = '';
    setHTML(el, buttons(2));
    expect(el.querySelectorAll('button').length).toBe(3);
  });
});
