// three.js 场景：地板网格、设备模型、管线连线、选中框、放置预览、拾取、渲染循环
import * as THREE from 'three';
import {CAT} from './catalog.js';
import {GRID, clamp, keyOf, nearest} from './grid.js';
import {state} from './state.js';

const {GW, GD, CX, CZ} = GRID;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const col = n => new THREE.Color(css(n));

export let camera;
let renderer, scene, itemRoot, floor, gridLines, linkObj, ghost, outline;
const ray = new THREE.Raycaster();

const cellPos = (x, z) => new THREE.Vector3((x - (GW - 1) / 2) * CX, 0, (z - (GD - 1) / 2) * CZ);

export function initScene(stage){
  renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stage.prepend(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(6, 14, 9); scene.add(sun);
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
  [floor, gridLines].forEach(o => o && scene.remove(o));
  scene.background = col('--hall');
  floor = new THREE.Mesh(new THREE.PlaneGeometry(GW * CX + .6, GD * CZ + .6),
    new THREE.MeshStandardMaterial({color: col('--floor'), roughness: .95}));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const pts = [], w = GW * CX / 2, d = GD * CZ / 2;
  for (let i = 0; i <= GW; i++){ const x = -w + i * CX; pts.push(new THREE.Vector3(x, .002, -d), new THREE.Vector3(x, .002, d)); }
  for (let j = 0; j <= GD; j++){ const z = -d + j * CZ; pts.push(new THREE.Vector3(-w, .002, z), new THREE.Vector3(w, .002, z)); }
  gridLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({color: col('--grid')}));
  scene.add(gridLines);
}

function makeMesh(key, it){
  const t = CAT[it.type], h = t.h, g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(CX * .92, h, CZ * .94),
    new THREE.MeshStandardMaterial({color: col('--rack'), roughness: .55, metalness: .35}));
  body.position.y = h / 2; g.add(body);
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
  g.position.copy(cellPos(it.x, it.z));
  g.userData = {key, stripeMat};
  g.traverse(o => o.userData.key = key);
  return g;
}

export function addMesh(key, it){
  it.mesh = makeMesh(key, it);
  itemRoot.add(it.mesh);
}
export function removeMesh(it){
  itemRoot.remove(it.mesh);
  it.mesh.traverse(o => { o.geometry && o.geometry.dispose(); });
}

export function rebuildLinks(){
  if (linkObj){ scene.remove(linkObj); linkObj.traverse(o => o.geometry && o.geometry.dispose()); }
  linkObj = new THREE.Group();
  const list = [...state.items.values()];
  const cdus = list.filter(i => i.type === 'cdu'), rpps = list.filter(i => i.type === 'rpp');
  const run = (arr, filter, y, cssVar) => {
    const pts = [];
    list.filter(filter).forEach(it => {
      const n = nearest(it, arr); if (!n) return;
      const A = cellPos(it.x, it.z), B = cellPos(n.a.x, n.a.z);
      const ha = CAT[it.type].h, hb = CAT[n.a.type].h;
      pts.push(A.clone().setY(ha), A.clone().setY(y), A.clone().setY(y), B.clone().setY(y), B.clone().setY(y), B.clone().setY(hb));
    });
    if (!pts.length) return;
    const m = new THREE.LineBasicMaterial({color: col(cssVar), transparent: true, opacity: state.powered ? .95 : .35});
    linkObj.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), m));
  };
  run(cdus, i => CAT[i.type].liq > 0, 2.85, '--coolant');
  run(rpps, i => CAT[i.type].kw > 0, 3.15, '--copper');
  scene.add(linkObj);
}

export function setOutline(){
  if (outline){ scene.remove(outline); outline = null; }
  const it = state.selected && state.items.get(state.selected); if (!it) return;
  const h = CAT[it.type].h;
  outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CX * .98, h + .1, CZ)),
    new THREE.LineBasicMaterial({color: col('--warn')}));
  outline.position.copy(cellPos(it.x, it.z)).setY((h + .1) / 2);
  scene.add(outline);
}

export function setGhost(cell){
  if (!ghost){
    ghost = new THREE.Mesh(new THREE.BoxGeometry(CX * .92, 1, CZ * .94),
      new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: .25, depthWrite: false}));
    scene.add(ghost);
  }
  const show = state.tool && cell && !state.items.has(keyOf(cell.x, cell.z));
  ghost.visible = !!show;
  if (!show) return;
  const h = CAT[state.tool].h;
  ghost.scale.y = h;
  ghost.material.color = col(CAT[state.tool].c);
  ghost.position.copy(cellPos(cell.x, cell.z)).setY(h / 2);
}
export function hideGhost(){ if (ghost) ghost.visible = false; }

// 配色切换：地板和所有设备按新的 CSS 变量重建
export function retheme(){
  buildHall();
  state.items.forEach((it, key) => { removeMesh(it); addMesh(key, it); });
  if (ghost){ scene.remove(ghost); ghost = null; }
  rebuildLinks(); setOutline();
}

function ndc(e){
  const r = renderer.domElement.getBoundingClientRect();
  return new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
}
export function pickItem(e){
  ray.setFromCamera(ndc(e), camera);
  const hit = ray.intersectObjects(itemRoot.children, true)[0];
  return hit ? hit.object.userData.key : null;
}
export function pickCell(e){
  ray.setFromCamera(ndc(e), camera);
  const hit = ray.intersectObject(floor)[0]; if (!hit) return null;
  const x = Math.round(hit.point.x / CX + (GW - 1) / 2), z = Math.round(hit.point.z / CZ + (GD - 1) / 2);
  return x >= 0 && x < GW && z >= 0 && z < GD ? {x, z} : null;
}

export function startLoop(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(now){
    state.items.forEach(it => {
      const m = it.mesh.userData.stripeMat;
      if (!state.powered){ m.emissiveIntensity = .12; return; }
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
