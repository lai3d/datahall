// three.js scene: floor grid, device models, supply links, selection box, placement preview, picking, render loop
import * as THREE from 'three';
import {CAT} from './catalog.ts';
import {GRID, clamp} from './grid.ts';
import {supplyLoads} from './supply.ts';
import {state, isActive, inView} from './state.ts';
import type {PlacedItem} from './state.ts';
import type {FeedField, Item, Pos} from './types.ts';

const {GW, GD, CX, CZ} = GRID;
const css = (n: string): string => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const col = (n: string): THREE.Color => new THREE.Color(css(n));

// Set only after initScene
export let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer, scene: THREE.Scene, itemRoot: THREE.Group;
let floor: THREE.Mesh | undefined, gridLines: THREE.LineSegments | undefined, linkObj: THREE.Group | undefined, outline: THREE.LineSegments | null = null;
type Ghost = THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
const ghosts: Ghost[] = [];   // Placement previews, one per cell during row placement
const ray = new THREE.Raycaster();

const cellPos = (x: number, z: number): THREE.Vector3 => new THREE.Vector3((x - (GW - 1) / 2) * CX, 0, (z - (GD - 1) / 2) * CZ);

export function initScene(stage: HTMLElement): HTMLCanvasElement{
  renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  stage.prepend(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  // Since three r155 lighting uses physical units; multiply intensity by π to match r128 brightness
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 0.75 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75 * Math.PI); sun.position.set(6, 14, 9);
  // Device shadows on the floor: the shadow camera covers the whole hall
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40});
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  itemRoot = new THREE.Group(); scene.add(itemRoot);
  buildHall();
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();
  return renderer.domElement;
}

function buildHall(){
  [floor, gridLines].forEach(o => { if (o) scene.remove(o); });
  scene.background = col('--hall');
  floor = new THREE.Mesh(new THREE.PlaneGeometry(GW * CX + .6, GD * CZ + .6),
    new THREE.MeshStandardMaterial({color: col('--floor'), roughness: .95}));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const pts: THREE.Vector3[] = [], w = GW * CX / 2, d = GD * CZ / 2;
  for (let i = 0; i <= GW; i++){ const x = -w + i * CX; pts.push(new THREE.Vector3(x, .002, -d), new THREE.Vector3(x, .002, d)); }
  for (let j = 0; j <= GD; j++){ const z = -d + j * CZ; pts.push(new THREE.Vector3(-w, .002, z), new THREE.Vector3(w, .002, z)); }
  gridLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({color: col('--grid')}));
  scene.add(gridLines);
}

function makeMesh(key: string, it: Item): THREE.Group{
  const t = CAT[it.type], h = t.h, g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(CX * .92, h, CZ * .94),
    new THREE.MeshStandardMaterial({color: col('--rack'), roughness: .55, metalness: .35}));
  body.position.y = h / 2; body.castShadow = body.userData.castsShadow = true; g.add(body);
  const accent = col(t.c);
  const stripeMat = new THREE.MeshStandardMaterial({color: accent, emissive: accent, emissiveIntensity: .12});
  const n = t.group === 'gpu' ? 9 : 3;
  const sGeo = new THREE.BoxGeometry(CX * .78, t.group === 'gpu' ? .04 : .12, .02);
  for (let i = 0; i < n; i++){
    const s = new THREE.Mesh(sGeo, stripeMat);
    s.position.set(0, .3 + i * (h - .5) / Math.max(n - 1, 1), CZ * .47 + .012);
    g.add(s);
  }
  if (t.liq || t.liqCool){
    const pipeMat = new THREE.MeshStandardMaterial({color: col('--coolant'), roughness: .3});
    [-.12, .12].forEach(dx => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, CZ * .8, 10), pipeMat);
      p.rotation.x = Math.PI / 2; p.position.set(dx, h + .05, 0); g.add(p);
    });
  }
  if (t.future){
    const tag = new THREE.Mesh(new THREE.BoxGeometry(CX * .92, .06, CZ * .94),
      new THREE.MeshStandardMaterial({color: col('--warn')}));
    tag.position.y = h + .02; g.add(tag);
  }
  // Red cap shown when overloaded or unconnected, controlled by setAlerts
  const bad = col('--bad');
  const alert = new THREE.Mesh(new THREE.BoxGeometry(CX * .92, .08, CZ * .94),
    new THREE.MeshStandardMaterial({color: bad, emissive: bad, emissiveIntensity: .45}));
  alert.position.y = h + (t.future ? .1 : .04);
  alert.visible = false;
  g.add(alert);
  g.position.copy(cellPos(it.x, it.z));
  g.userData = {key, stripeMat, alert};
  g.traverse(o => o.userData.key = key);
  return g;
}

// The model is built before it goes into state.items, so mesh may not exist yet in the parameter type
export function addMesh(key: string, it: Item & {mesh?: THREE.Group}): void{
  it.mesh = makeMesh(key, it);
  itemRoot.add(it.mesh);
}
// Drag move: the device already has its new position and key in state; only move the model here
export function moveMesh(it: PlacedItem, key: string): void{
  it.mesh.position.copy(cellPos(it.x, it.z));
  it.mesh.traverse(o => o.userData.key = key);
}
export function removeMesh(it: PlacedItem): void{
  itemRoot.remove(it.mesh);
  it.mesh.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
}

// Coolant and power links, same topology as the USD export (supplyLinks). Links to overloaded CDUs/RPPs are drawn red, manual assignments dashed
export function rebuildLinks(): void{
  if (linkObj){ scene.remove(linkObj); linkObj.traverse(o => { if (o instanceof THREE.LineSegments) o.geometry.dispose(); }); }
  linkObj = new THREE.Group();
  const list = [...state.items].filter(([key, it]) => isActive(key, it)).map(([, it]) => it);
  const {supplies, links} = supplyLoads(list, CAT);
  const group = linkObj;
  const run = (field: FeedField, y: number, cssVar: string) => {
    const pts: Record<'ok' | 'bad' | 'okManual' | 'badManual', THREE.Vector3[]> = {ok: [], bad: [], okManual: [], badManual: []};
    list.forEach(it => {
      const source = links.get(it)?.[field]; if (!source) return;
      const A = cellPos(it.x, it.z), B = cellPos(source.x, source.z);
      const ha = CAT[it.type].h, hb = CAT[source.type].h;
      const want = it.feeds?.[field], manual = !!want && want[0] === source.x && want[1] === source.z;
      pts[`${supplies.get(source)!.overloaded ? 'bad' : 'ok'}${manual ? 'Manual' : ''}` as const].push(
        A.clone().setY(ha), A.clone().setY(y), A.clone().setY(y), B.clone().setY(y), B.clone().setY(y), B.clone().setY(hb));
    });
    for (const [kind, p] of Object.entries(pts)){
      if (!p.length) continue;
      const bad = kind.startsWith('bad'), manual = kind.endsWith('Manual');
      const opts = {color: col(bad ? '--bad' : cssVar), transparent: true, opacity: bad || state.powered ? .95 : manual ? .75 : .35};
      const m = manual ? new THREE.LineDashedMaterial({...opts, dashSize: .14, gapSize: .09}) : new THREE.LineBasicMaterial(opts);
      const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(p), m);
      if (manual) lines.computeLineDistances();
      group.add(lines);
    }
  };
  run('coolantSource', 2.85, '--coolant');
  run('powerFeed', 3.15, '--copper');
  scene.add(linkObj);
}

// keys: devices that should show the red cap (overloaded CDUs/RPPs, unconnected devices)
export function setAlerts(keys: Set<string>): void{
  state.items.forEach((it, key) => { it.mesh.userData.alert.visible = keys.has(key); });
}

// Devices excluded from computation are drawn semi-transparent without shadows (red caps unaffected): failed facilities in the failure drill, and devices after the viewed phase (fainter)
export function setDimmed(): void{
  state.items.forEach((it, key) => {
    const opacity = !inView(it) ? .12 : state.failed.has(key) ? .25 : 1, g = it.mesh;
    if (g.userData.opacity === opacity) return;
    g.userData.opacity = opacity;
    const dim = opacity < 1;
    g.traverse(o => {
      if (!(o instanceof THREE.Mesh) || o === g.userData.alert) return;
      Object.assign(o.material, {transparent: dim, opacity, depthWrite: !dim, needsUpdate: true});
      o.castShadow = !dim && o.userData.castsShadow;
    });
  });
}

export function setOutline(): void{
  if (outline){ scene.remove(outline); outline = null; }
  const it = state.selected && state.items.get(state.selected); if (!it) return;
  const h = CAT[it.type].h;
  outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CX * .98, h + .1, CZ)),
    new THREE.LineBasicMaterial({color: col('--warn')}));
  outline.position.copy(cellPos(it.x, it.z)).setY((h + .1) / 2);
  scene.add(outline);
}

export const visibleGhosts = (): Pos[] => ghosts.filter(g => g.visible).map(g => ({x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2)}));
// cells: empty cells to preview; type: device type, empty hides all previews
export function setGhost(cells: Pos[], type: string | null): void{
  if (!type) cells = [];
  while (ghosts.length < cells.length){
    const g = new THREE.Mesh(new THREE.BoxGeometry(CX * .92, 1, CZ * .94),
      new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: .25, depthWrite: false}));
    scene.add(g); ghosts.push(g);
  }
  ghosts.forEach((g, i) => {
    const c = cells[i];
    g.visible = !!c;
    if (!c) return;
    const t = CAT[type!], h = t.h;
    g.scale.y = h;
    g.material.color = col(t.c);
    g.position.copy(cellPos(c.x, c.z)).setY(h / 2);
  });
}

// Theme switch: rebuild the floor and all devices from the new CSS variables
export function retheme(): void{
  buildHall();
  state.items.forEach((it, key) => { removeMesh(it); addMesh(key, it); });
  ghosts.splice(0).forEach(g => { scene.remove(g); g.geometry.dispose(); });
  rebuildLinks(); setOutline();
}

function ndc(e: {clientX: number; clientY: number}): THREE.Vector2{
  const r = renderer.domElement.getBoundingClientRect();
  return new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
}
export function pickItem(e: PointerEvent): string | null{
  ray.setFromCamera(ndc(e), camera);
  const hit = ray.intersectObjects(itemRoot.children, true)[0];
  return hit ? hit.object.userData.key as string : null;
}
// Page coordinates (clientX/Y) of a cell center; y is the height above the floor
export function cellToScreen(x: number, z: number, y = 0): {x: number; y: number}{
  const v = cellPos(x, z).setY(y).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return {x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height};
}
export function pickCell(e: PointerEvent): Pos | null{
  if (!floor) return null;
  ray.setFromCamera(ndc(e), camera);
  const hit = ray.intersectObject(floor)[0]; if (!hit) return null;
  const x = Math.round(hit.point.x / CX + (GW - 1) / 2), z = Math.round(hit.point.z / CZ + (GD - 1) / 2);
  return x >= 0 && x < GW && z >= 0 && z < GD ? {x, z} : null;
}

// Render one frame now: during browser automation the window is in the background and requestAnimationFrame may be paused
export function renderOnce(): void{ camera.updateMatrixWorld(); renderer.render(scene, camera); }

export function startLoop(): void{
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(now: number){
    state.items.forEach((it, key) => {
      const m = it.mesh.userData.stripeMat;
      // Failed facilities and overloaded or unconnected devices do not light up
      if (!state.powered || !isActive(key, it) || it.mesh.userData.alert.visible){ m.emissiveIntensity = .12; return; }
      const delay = (Math.abs(it.x - GW / 2) + it.z) * 70;
      const t = (now - state.powerStart - delay) / 400;
      const on = reduce ? 1 : clamp(t, 0, 1);
      m.emissiveIntensity = .12 + on * (reduce ? .9 : .8 + .12 * Math.sin(now / 350 + it.x));
    });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
