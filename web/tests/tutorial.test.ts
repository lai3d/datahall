import {describe, expect, it} from 'vitest';
import {advance, LAST, STEPS} from '../src/tutorial.ts';
import type {TutorialContext} from '../src/tutorial.ts';

const idAt = (i: number) => STEPS[i].id;
const index = (id: string) => STEPS.findIndex(s => s.id === id);
// An empty hall with nothing selected
const ctx = (patch: Partial<TutorialContext> = {}): TutorialContext =>
  ({tool: null, counts: {}, reasons: [], overloads: [], blocking: false, powered: false, ...patch});
const shortOf8Racks = ctx({tool: 'gb200', counts: {gb200: 8}, reasons: ['dist', 'liquid', 'air', 'network'], blocking: true});

describe('tutorial steps', () => {
  it('starts by picking a GB200 rack and waits there', () => {
    expect(idAt(advance(0, ctx()))).toBe('pick');
    expect(idAt(advance(0, ctx({tool: 'gb200'})))).toBe('place');
  });

  it('stops at the explanation after 8 racks, and "Next" moves on to power distribution', () => {
    const at = advance(0, shortOf8Racks);
    expect(idAt(at)).toBe('why');
    expect(advance(at, shortOf8Racks)).toBe(at);
    expect(idAt(advance(at, shortOf8Racks, true))).toBe('power');
  });

  it('each facility step completes when its shortage and per-device overload are gone', () => {
    let step = index('power');
    step = advance(step, ctx({counts: {gb200: 8}, reasons: ['liquid', 'air', 'network'], overloads: ['rpp'], blocking: true}));
    expect(idAt(step)).toBe('power');   // enough distribution in total, but one RPP is overloaded
    step = advance(step, ctx({counts: {gb200: 8}, reasons: ['liquid', 'air', 'network'], blocking: true}));
    expect(idAt(step)).toBe('liquid');
    step = advance(step, ctx({counts: {gb200: 8}, reasons: ['network'], blocking: true}));
    expect(idAt(step)).toBe('network');   // liquid and air were fixed together
    step = advance(step, ctx({counts: {gb200: 8}}));
    expect(idAt(step)).toBe('powerOn');
    step = advance(step, ctx({counts: {gb200: 8}, powered: true}));
    expect(step).toBe(LAST);
    expect(advance(step, ctx({counts: {gb200: 8}, powered: true}), true)).toBe(LAST);
  });

  it('never goes backwards when the hall gets worse again', () => {
    const step = index('air');
    expect(advance(step, ctx({counts: {gb200: 8}, reasons: ['dist', 'air'], blocking: true}))).toBe(step);
  });

  it('every step except the last has a condition or is manual, and targets are selectors', () => {
    for (const s of STEPS.slice(0, -1)) expect(!!s.manual || !!s.done, s.id).toBe(true);
    expect(STEPS.at(-1)!.id).toBe('done');
  });
});
