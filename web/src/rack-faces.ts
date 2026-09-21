// Procedural front panels for the device models: a color, a bump and a glow map drawn on canvases, one set per device type
// and theme, shared by every device of that type. The layouts are illustrative (roughly what the front of each kind of rack
// looks like: compute and switch trays, power shelves, switch ports, drive bays, doors), not engineering drawings, and no
// vendor artwork is used. Glow marks the status lights: the material's emissive color is the device's accent color, so
// they light up with the power-on animation in scene.ts
import * as THREE from 'three';
import type {CatalogItem} from './types.ts';

export interface FacePalette {body: string; accent: string}
export interface FaceMaps {map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture}

const PX_PER_M = 440;
type Kind = 'compute' | 'switch' | 'psu' | 'blank' | 'grill' | 'bays' | 'ports' | 'cable' | 'blades';
type Stack = [kind: Kind, units: number, repeat?: number][];

// Front layouts, top to bottom, in rack units scaled to the face height
const NVL72: Stack = [['switch', 1], ['psu', 1, 4], ['compute', 1, 10], ['switch', 1, 9], ['compute', 1, 8], ['psu', 1, 4], ['blank', 2]];
const STACKS: Record<string, Stack> = {
  gb200: NVL72, gb300: NVL72, vr200: NVL72,
  kyber: [['psu', 1, 3], ['blades', 9], ['blank', .5], ['blades', 9], ['blank', .5], ['blades', 9], ['blank', .5], ['blades', 9], ['psu', 1, 3]],
  dgx: [['switch', 1], ['grill', 8], ['bays', 2], ['grill', 8], ['bays', 2], ['grill', 8], ['bays', 2], ['grill', 8], ['bays', 2], ['blank', 2]],
  helios: [['switch', 1], ['psu', 1, 3], ['compute', 1, 9], ['switch', 1, 6], ['compute', 1, 9], ['psu', 1, 3], ['blank', 2]],
  mi355: [['switch', 1], ['psu', 1, 2], ['grill', 3], ['bays', 1], ['grill', 3], ['bays', 1], ['grill', 3], ['bays', 1], ['grill', 3], ['bays', 1],
    ['grill', 3], ['bays', 1], ['grill', 3], ['bays', 1], ['grill', 3], ['bays', 1], ['grill', 3], ['bays', 1], ['blank', 3]],
  cm384: [['switch', 1], ['psu', 1, 2], ['compute', 2, 8], ['switch', 1, 2], ['blank', 6], ['psu', 1, 2]],
  ib: [['switch', 1], ['blank', 3], ['ports', 4], ['cable', 5], ['ports', 4], ['cable', 5], ['blank', 8], ['psu', 1, 2]],
  stor: [['switch', 1], ['bays', 2, 14], ['blank', 3], ['psu', 1, 2]],
};

// Three canvases painted together: color, height (bump, 0.5 = the panel surface) and glow
class Painter{
  readonly w: number; readonly h: number;
  private color: CanvasRenderingContext2D; private bump: CanvasRenderingContext2D; private glow: CanvasRenderingContext2D;
  constructor(w: number, h: number, base: string){
    this.w = w; this.h = h;
    // CPU-backed canvases: a GPU-backed one is read back from the GPU on every texture upload, which under software
    // rendering (CI) nearly doubled page load
    const ctx = (fill: string) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', {willReadFrequently: true})!; x.fillStyle = fill; x.fillRect(0, 0, w, h); return x;
    };
    this.color = ctx(base); this.bump = ctx('#808080'); this.glow = ctx('#000');
  }
  // height: 0 recessed … 1 raised; glow: a status light
  rect(x: number, y: number, w: number, h: number, color: string, height = .5, glow = false){
    this.color.fillStyle = color; this.color.fillRect(x, y, w, h);
    const g = Math.round(height * 255);
    this.bump.fillStyle = `rgb(${g},${g},${g})`; this.bump.fillRect(x, y, w, h);
    if (glow){ this.glow.fillStyle = '#fff'; this.glow.fillRect(x, y, w, h); }
  }
  dot(x: number, y: number, r: number, color: string, height = .2){
    for (const [c, fill] of [[this.color, color], [this.bump, `rgb(${height * 255},${height * 255},${height * 255})`]] as const){
      c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
  }
  textures(): FaceMaps{
    const tex = (c: CanvasRenderingContext2D, srgb: boolean) => {
      const t = new THREE.CanvasTexture(c.canvas);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    return {map: tex(this.color, true), bumpMap: tex(this.bump, false), emissiveMap: tex(this.glow, true)};
  }
}

// Shades of the body color, so both themes keep their contrast
const shade = (hex: string, k: number): string => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const tint = (hex: string, toward: string, k: number): string => '#' + new THREE.Color(hex).lerp(new THREE.Color(toward), k).getHexString();

function drawUnit(p: Painter, kind: Kind, x: number, y: number, w: number, h: number, pal: FacePalette){
  const {body, accent} = pal;
  const bezel = tint(body, '#ffffff', .1), hole = shade(body, .35), gap = Math.max(1, Math.round(h * .08));
  if (kind === 'blank'){ p.rect(x, y, w, h - gap, tint(body, '#ffffff', .04), .55); return; }
  p.rect(x, y, w, h - gap, bezel, .62);
  p.rect(x, y + h - gap, w, gap, shade(body, .5), .3);
  const led = (lx: number, ly: number, s = Math.max(2, h * .16)) => p.rect(lx, ly, s * 1.6, s, accent, .6, true);
  const inner = h - gap;
  switch (kind){
    case 'compute': {
      // Vent field, two drive or port slots and a pair of status lights
      for (let vx = x + w * .06; vx < x + w * .62; vx += 5) for (let vy = y + inner * .22; vy < y + inner * .8; vy += 4) p.rect(vx, vy, 3, 2, hole, .2);
      p.rect(x + w * .65, y + inner * .2, w * .1, inner * .6, shade(body, .6), .35);
      // Light bar: the rows of accent light that make the rack's family readable from across the hall
      p.rect(x + w * .78, y + inner * .3, w * .19, Math.max(2, inner * .4), accent, .6, true);
      break;
    }
    case 'switch': {
      for (let i = 0; i < 18; i++){
        const px = x + w * .05 + i * (w * .8 / 18);
        p.rect(px, y + inner * .25, w * .8 / 18 - 2, inner * .5, hole, .15);
      }
      led(x + w * .9, y + inner * .35);
      break;
    }
    case 'psu': {
      const n = 6, cw = w * .9 / n;
      for (let i = 0; i < n; i++){
        const cx = x + w * .05 + i * cw;
        p.rect(cx + 1, y + inner * .12, cw - 3, inner * .76, shade(body, .8), .5);
        p.dot(cx + cw * .35, y + inner * .5, Math.min(cw, inner) * .28, hole);
        p.rect(cx + cw * .7, y + inner * .4, 3, 2, accent, .6, true);
      }
      break;
    }
    case 'grill': {
      for (let gy = y + inner * .08; gy < y + inner * .92; gy += 6) for (let gx = x + w * .05 + ((gy / 6) % 2) * 3; gx < x + w * .95; gx += 6) p.dot(gx, gy, 1.8, hole);
      p.rect(x + w * .05, y + inner * .04, w * .9, 2, accent, .6);
      led(x + w * .88, y + inner * .9 - 6, 4);
      break;
    }
    case 'bays': {
      const n = 12, bw = w * .9 / n;
      for (let i = 0; i < n; i++){
        p.rect(x + w * .05 + i * bw + 1, y + inner * .1, bw - 2, inner * .8, shade(body, .7), .4);
        p.rect(x + w * .05 + i * bw + bw * .35, y + inner * .78, 2, 2, accent, .6, true);
      }
      break;
    }
    case 'ports': {
      // Twin-port cages in two rows, as on a high-radix switch
      const cols = 18, cw = w * .9 / cols;
      for (let r = 0; r < 2; r++) for (let i = 0; i < cols; i++){
        const cx = x + w * .05 + i * cw, cy = y + inner * (.15 + r * .4);
        p.rect(cx + 1, cy, cw - 2, inner * .3, hole, .12);
        p.rect(cx + 2, cy + 2, 2, 2, accent, .6, true);
      }
      break;
    }
    case 'cable': {
      p.rect(x, y, w, h, shade(body, .45), .45);
      for (let i = 0; i < 24; i++){
        const cx = x + w * .06 + i * (w * .88 / 24);
        p.rect(cx, y, 3, h, i % 3 ? '#262a31' : '#3a3f48', .8);
      }
      break;
    }
    case 'blades': {
      const n = 18, bw = w * .92 / n;
      for (let i = 0; i < n; i++){
        const bx = x + w * .04 + i * bw;
        p.rect(bx + 1, y + inner * .04, bw - 2, inner * .92, tint(body, '#ffffff', .14), .65);
        for (let vy = y + inner * .1; vy < y + inner * .7; vy += 5) p.rect(bx + 2, vy, bw - 4, 2, hole, .2);
        p.rect(bx + bw * .3, y + inner * .85, 3, 3, accent, .6, true);
      }
      break;
    }
  }
}

// Rack posts and the top and bottom rails around the equipment
function frame(p: Painter, body: string): {x: number; y: number; w: number; h: number}{
  const post = Math.round(p.w * .05), rail = Math.round(p.h * .018);
  p.rect(0, 0, p.w, p.h, shade(body, .55), .4);
  p.rect(0, 0, post, p.h, shade(body, .8), .7);
  p.rect(p.w - post, 0, post, p.h, shade(body, .8), .7);
  p.rect(0, 0, p.w, rail, shade(body, .8), .7);
  p.rect(0, p.h - rail, p.w, rail, shade(body, .8), .7);
  return {x: post + 2, y: rail + 2, w: p.w - 2 * post - 4, h: p.h - 2 * rail - 4};
}

function drawStack(p: Painter, stack: Stack, pal: FacePalette){
  const box = frame(p, pal.body);
  // Nameplate in the accent color, so the rack's family reads from across the hall
  p.rect(box.x, box.y, box.w, 10, pal.accent, .6, true);
  const units = stack.flatMap(([k, u, n = 1]) => Array.from({length: n}, () => [k, u] as const));
  const total = units.reduce((s, [, u]) => s + u, 0), unit = (box.h - 12) / total;
  let y = box.y + 12;
  for (const [k, u] of units){ drawUnit(p, k, box.x, Math.round(y), box.w, Math.round(u * unit), pal); y += u * unit; }
}

// Facility units: a coolant unit with a display and louvers, a power panel with breakers, an in-row cooler with a perforated
// door and fans. CDUs and RPPs keep the right third free: scene.ts mounts the load meter there, over a dark recess
export const METER_X = .7;   // center of the meter column, as a share of the face width
function drawFacility(p: Painter, id: string, pal: FacePalette){
  const {body, accent} = pal, hole = shade(body, .35);
  p.rect(0, 0, p.w, p.h, tint(body, '#ffffff', .06), .55);
  p.rect(0, 0, p.w, 10, accent, .6, true);
  if (id === 'cdu' || id === 'rpp'){
    const mx = p.w * METER_X, mw = p.w * .3;
    p.rect(mx - mw / 2 - 3, p.h * .16, mw + 6, p.h * .7, '#10161d', .3);
    p.rect(p.w * .06, p.h * .5, 4, p.h * .08, shade(body, 1.4), .8);   // handle
  }
  if (id === 'cdu'){
    p.rect(p.w * .1, p.h * .06, p.w * .4, p.h * .05, '#10161d', .4);
    p.rect(p.w * .12, p.h * .065, p.w * .36, p.h * .04, accent, .4, true);
    for (let y = p.h * .18; y < p.h * .45; y += 7) p.rect(p.w * .1, y, p.w * .4, 3, hole, .2);
    for (let y = p.h * .64; y < p.h * .95; y += 7) p.rect(p.w * .1, y, p.w * .4, 3, hole, .2);
  } else if (id === 'rpp'){
    p.rect(p.w * .08, p.h * .08, p.w * .44, p.h * .38, shade(body, .6), .35);
    for (let r = 0; r < 12; r++) for (let c = 0; c < 4; c++)
      p.rect(p.w * .11 + c * p.w * .1, p.h * .1 + r * p.h * .029, p.w * .07, p.h * .018, c === 3 ? accent : shade(body, 1.3), .7, c === 3);
    for (let y = p.h * .64; y < p.h * .95; y += 7) p.rect(p.w * .1, y, p.w * .4, 3, hole, .2);
  } else {
    for (let y = p.h * .06; y < p.h * .94; y += 6) for (let x = p.w * .06 + ((y / 6) % 2) * 3; x < p.w * .94; x += 6) p.dot(x, y, 1.6, hole);
    for (const fy of [.15, .35]) p.dot(p.w / 2, p.h * fy, p.w * .3, shade(body, .45), .25);
  }
}

const cache = new Map<string, FaceMaps>();

// Front maps for a device type, cached per palette; `h` is the device height in meters
export function faceMaps(t: CatalogItem, width: number, pal: FacePalette): FaceMaps{
  const key = `${t.id}|${pal.body}|${pal.accent}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Painter(Math.round(width * PX_PER_M), Math.round(t.h * PX_PER_M), pal.body);
  const stack = STACKS[t.id] ?? (t.group === 'gpu' ? NVL72 : null);
  if (stack) drawStack(p, stack, pal); else drawFacility(p, t.id, pal);
  const maps = p.textures();
  cache.set(key, maps);
  return maps;
}

// Side panels: seams and a slight texture, shared by every device of the same height
export function sideMaps(h: number, depth: number, body: string): FaceMaps{
  const key = `side|${h}|${depth}|${body}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Painter(Math.round(depth * PX_PER_M / 2), Math.round(h * PX_PER_M / 2), body);
  for (const f of [.33, .66]) p.rect(p.w * f, 0, 1, p.h, shade(body, .6), .3);
  p.rect(0, 0, p.w, 3, shade(body, .7), .4);
  const maps = p.textures();
  cache.set(key, maps);
  return maps;
}

// Theme changes redraw everything
export function clearFaces(): void{
  cache.forEach(m => { m.map.dispose(); m.bumpMap.dispose(); m.emissiveMap.dispose(); });
  cache.clear();
}
