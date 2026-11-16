// Orbit camera and pointer input: one-finger drag rotates, two fingers or the wheel zoom, a click without movement goes to onTap.
// If there is a device under the press (drag.start returns true), the drag moves the device instead of rotating; a second finger landing cancels the move
import * as THREE from 'three';
import {clamp} from './grid.ts';
import {FRAME_ALL} from './viz.ts';
import type {Framing} from './viz.ts';

// Device dragging: start is called on press and returns whether there is a device at the pressed position
export interface DragHandlers {
  start(e: PointerEvent): boolean;
  move(e: PointerEvent): void;
  end(): void;
  cancel(): void;
}
export interface ControlHandlers {
  onTap(e: PointerEvent): void;
  onHover(e: PointerEvent): void;
  onLeave(): void;
  drag: DragHandlers;
}

// Returns frame, which points the orbit at a framing (viz.ts); resetAngles also puts the viewing direction back to the initial one
export interface Controls {frame(f: Framing, resetAngles: boolean): void}
export function initControls(el: HTMLElement, camera: THREE.PerspectiveCamera, {onTap, onHover, onLeave, drag}: ControlHandlers): Controls{
  const orb = {theta: .75, phi: .95, r: FRAME_ALL.r, target: new THREE.Vector3(FRAME_ALL.x, .8, FRAME_ALL.z)};
  function updCam(){
    const sp = Math.sin(orb.phi);
    camera.position.set(orb.target.x + orb.r * sp * Math.sin(orb.theta),
      orb.target.y + orb.r * Math.cos(orb.phi), orb.target.z + orb.r * sp * Math.cos(orb.theta));
    camera.lookAt(orb.target);
  }

  const ptrs = new Map<number, {x: number; y: number}>();
  let down: {x: number; y: number; moved: boolean; dragging: boolean} | null = null, pinch0 = 0, r0 = 0;
  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (ptrs.size === 1) down = {x: e.clientX, y: e.clientY, moved: false, dragging: e.button === 0 && drag.start(e)};
    if (ptrs.size === 2){
      const [a, b] = [...ptrs.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y); r0 = orb.r;
      if (down){
        if (down.dragging){ drag.cancel(); down.dragging = false; }
        down.moved = true;
      }
    }
  });
  el.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p){ if (e.pointerType === 'mouse') onHover(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1 && down){
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
      if (down.moved && down.dragging) drag.move(e);
      else if (down.moved){ orb.theta -= dx * .006; orb.phi = clamp(orb.phi - dy * .006, .2, 1.45); updCam(); }
    } else if (ptrs.size === 2){
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0){ orb.r = clamp(r0 * pinch0 / d, 5, 34); updCam(); }
    }
  });
  const endPtr = (e: PointerEvent) => {
    const wasTap = down && !down.moved && ptrs.size === 1;
    if (down?.dragging && ptrs.size === 1){ e.type === 'pointerup' ? drag.end() : drag.cancel(); down.dragging = false; }
    ptrs.delete(e.pointerId);
    if (wasTap && e.type === 'pointerup') onTap(e);
    if (!ptrs.size) down = null;
  };
  el.addEventListener('pointerup', endPtr);
  el.addEventListener('pointercancel', endPtr);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('wheel', e => { e.preventDefault(); orb.r = clamp(orb.r * (1 + e.deltaY * .001), 5, 34); updCam(); }, {passive: false});

  updCam();
  return {frame(f, resetAngles){
    if (resetAngles){ orb.theta = .75; orb.phi = .95; }
    orb.r = clamp(f.r, 5, 34); orb.target.x = f.x; orb.target.z = f.z;
    updCam();
  }};
}
