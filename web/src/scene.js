// three.js 场景：地板网格、设备模型、管线连线、选中框、放置预览、拾取、渲染循环
import * as THREE from 'three';
import {CAT} from './catalog.js';
import {GRID, clamp} from './grid.js';
import {supplyLoads} from './supply.js';
import {state} from './state.js';

const {GW, GD, CX, CZ} = GRID;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const col = n => new THREE.Color(css(n));

export let camera;
let renderer, scene, itemRoot, floor, gridLines, linkObj, outline;
const ghosts = [];   // 放置预览，整排放置时每格一个
const ray = new THREE.Raycaster();

const cellPos = (x, z) => new THREE.Vector3((x - (GW - 1) / 2) * CX, 0, (z - (GD - 1) / 2) * CZ);

export function initScene(stage){
  renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  stage.prepend(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  // three r155 起光照按物理单位计算，强度乘 π 才和 r128 时的亮度相当
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 0.75 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75 * Math.PI); sun.position.set(6, 14, 9);
  // 设备投到地板上的影子：阴影相机盖住整个机房
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
  [floor, gridLines].forEach(o => o && scene.remove(o));
  scene.background = col('--hall');
  floor = new THREE.Mesh(new THREE.PlaneGeometry(GW * CX + .6, GD * CZ + .6),
    new THREE.MeshStandardMaterial({color: col('--floor'), roughness: .95}));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
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
  // 超载或没接上时显示的红色顶盖，由 setAlerts 控制
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

export function addMesh(key, it){
  it.mesh = makeMesh(key, it);
  itemRoot.add(it.mesh);
}
// 拖动移动：设备已经在 state 里换了位置和 key，这里只挪模型
export function moveMesh(it, key){
  it.mesh.position.copy(cellPos(it.x, it.z));
  it.mesh.traverse(o => o.userData.key = key);
}
export function removeMesh(it){
  itemRoot.remove(it.mesh);
  it.mesh.traverse(o => { o.geometry && o.geometry.dispose(); });
}

// 供液、配电连线，拓扑与 USD 导出一致（supplyLinks）。接到超载 CDU、RPP 的连线画成红色，手动指定的画成虚线
export function rebuildLinks(){
  if (linkObj){ scene.remove(linkObj); linkObj.traverse(o => o.geometry && o.geometry.dispose()); }
  linkObj = new THREE.Group();
  const list = [...state.items].filter(([key]) => !state.failed.has(key)).map(([, it]) => it);
  const {supplies, links} = supplyLoads(list, CAT);
  const run = (field, y, cssVar) => {
    const pts = {ok: [], bad: [], okManual: [], badManual: []};
    list.forEach(it => {
      const source = links.get(it)?.[field]; if (!source) return;
      const A = cellPos(it.x, it.z), B = cellPos(source.x, source.z);
      const ha = CAT[it.type].h, hb = CAT[source.type].h;
      const want = it.feeds?.[field], manual = !!want && want[0] === source.x && want[1] === source.z;
      pts[(supplies.get(source).overloaded ? 'bad' : 'ok') + (manual ? 'Manual' : '')].push(
        A.clone().setY(ha), A.clone().setY(y), A.clone().setY(y), B.clone().setY(y), B.clone().setY(y), B.clone().setY(hb));
    });
    for (const [kind, p] of Object.entries(pts)){
      if (!p.length) continue;
      const bad = kind.startsWith('bad'), manual = kind.endsWith('Manual');
      const opts = {color: col(bad ? '--bad' : cssVar), transparent: true, opacity: bad || state.powered ? .95 : manual ? .75 : .35};
      const m = manual ? new THREE.LineDashedMaterial({...opts, dashSize: .14, gapSize: .09}) : new THREE.LineBasicMaterial(opts);
      const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(p), m);
      if (manual) lines.computeLineDistances();
      linkObj.add(lines);
    }
  };
  run('coolantSource', 2.85, '--coolant');
  run('powerFeed', 3.15, '--copper');
  scene.add(linkObj);
}

// keys：需要显示红色顶盖的设备（超载的 CDU、RPP，没接上的设备）
export function setAlerts(keys){
  state.items.forEach((it, key) => { it.mesh.userData.alert.visible = keys.has(key); });
}

// 故障演练：故障设施半透明、不投影子（红色顶盖不受影响）
export function setFailed(keys){
  state.items.forEach((it, key) => {
    const failed = keys.has(key), g = it.mesh;
    if (g.userData.failed === failed) return;
    g.userData.failed = failed;
    g.traverse(o => {
      if (!o.material || o === g.userData.alert) return;
      Object.assign(o.material, {transparent: failed, opacity: failed ? .25 : 1, depthWrite: !failed, needsUpdate: true});
      o.castShadow = !failed && o.userData.castsShadow;
    });
  });
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

export const visibleGhosts = () => ghosts.filter(g => g.visible).map(g => ({x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2)}));
// cells：要预览的空格子；type：设备类型，为空时隐藏全部预览
export function setGhost(cells, type){
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
    const h = CAT[type].h;
    g.scale.y = h;
    g.material.color = col(CAT[type].c);
    g.position.copy(cellPos(c.x, c.z)).setY(h / 2);
  });
}

// 配色切换：地板和所有设备按新的 CSS 变量重建
export function retheme(){
  buildHall();
  state.items.forEach((it, key) => { removeMesh(it); addMesh(key, it); });
  ghosts.splice(0).forEach(g => { scene.remove(g); g.geometry.dispose(); });
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
// 格子中心在页面上的坐标（clientX/Y），y 是离地高度
export function cellToScreen(x, z, y = 0){
  const v = cellPos(x, z).setY(y).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return {x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height};
}
export function pickCell(e){
  ray.setFromCamera(ndc(e), camera);
  const hit = ray.intersectObject(floor)[0]; if (!hit) return null;
  const x = Math.round(hit.point.x / CX + (GW - 1) / 2), z = Math.round(hit.point.z / CZ + (GD - 1) / 2);
  return x >= 0 && x < GW && z >= 0 && z < GD ? {x, z} : null;
}

// 立即画一帧：浏览器自动化时窗口在后台，requestAnimationFrame 可能暂停
export function renderOnce(){ camera.updateMatrixWorld(); renderer.render(scene, camera); }

export function startLoop(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(now){
    state.items.forEach((it, key) => {
      const m = it.mesh.userData.stripeMat;
      // 故障的设施和超载、没接上的设备不亮
      if (!state.powered || state.failed.has(key) || it.mesh.userData.alert.visible){ m.emissiveIntensity = .12; return; }
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
