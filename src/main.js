import * as THREE from 'three';
import { buildWorld, ROUTE, districtAt, rng } from './world.js';
import { createLook, LAYER_SPOT } from './look.js';
import { createPhysics } from './physics.js';
import { createHorde } from './horde.js';
import { createDebris, createDecals } from './debris.js';
import { createGun } from './gun.js';
import { createVehicle } from './vehicle.js';
import { createBosses } from './boss.js';
import { createPickups } from './pickups.js';
import { createAudio } from './audio.js';
import { createNightlife } from './nightlife.js';
import { createFires } from './fire.js';
import { createJuice } from './juice.js';

const q = new URLSearchParams(location.search);
// 데일리 시드: 로컬 날짜(YYYY-MM-DD)를 해시해 길·소품·수리 상자 배치를 정한다. 순위표도 같은 날짜 키를 쓴다.
const DAY = q.get('day') || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const DAY_SEED = [...DAY].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261);
const dayRand = rng(DAY_SEED ^ 0x9e3779b9);
const BOARD_URL = 'https://kingdombi-scores.midagedev.workers.dev';
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));   // 폰: 두 개의 풀해상도 RT + 그림자 패스라 1.5 로 캡
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const NIGHT = new THREE.Color(0x05060a);
const HORIZON = new THREE.Color(0x1b1e2a);
scene.background = NIGHT;
scene.fog = new THREE.FogExp2(HORIZON, 0.0068);
// 하늘: 지평선이 살짝 밝은 안개빛 → 검은 지붕선이 실루엣으로 읽힌다(느와르의 기본 문법). 카메라를 따라다닌다.
const sky = new THREE.Mesh(new THREE.SphereGeometry(640, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: NIGHT }, bottom: { value: HORIZON } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top, bottom; varying vec3 vP; void main(){ float h = clamp(vP.y / 640.0, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.45)), 1.0); }',
}));
scene.add(sky);

const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 700);

// ── 조명: 달(역광, 장그림자) + 낮은 하늘빛 + 등롱. 달·보조광·그림자 절두체는 마차를 따라간다 ──
const moonDir = new THREE.Vector3(-0.2, 0.36, -1).normalize();
const moon = new THREE.DirectionalLight(0xd8e0ff, 5.2);
scene.add(moon.target);
moon.castShadow = true;
moon.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
Object.assign(moon.shadow.camera, { left: -60, right: 60, top: 100, bottom: -60, near: 20, far: 520 });   // 마차 주변만 — 캐스터 수·해상도 둘 다 이득
moon.shadow.camera.updateProjectionMatrix();
moon.shadow.bias = -0.00035; moon.shadow.normalBias = 0.06;
scene.add(moon);
const hemi = new THREE.HemisphereLight(0x6672a8, 0x0c0b0a, 1.1);
scene.add(hemi);
// 카메라 쪽 보조광(그림자 없음): 기와 골·공포·창살이 중간톤으로 살아난다. 달 역광의 림·장그림자는 그대로.
const fill = new THREE.DirectionalLight(0xb8c4e0, 1.9);
scene.add(fill, fill.target);
function followLights(px, pz) {
  moon.position.set(px, 0, pz - 40).addScaledVector(moonDir, 220);
  moon.target.position.set(px, 0, pz - 40);
  fill.position.set(px + 60, 50, pz + 140); fill.target.position.set(px, 0, pz - 60);
}

// 달 원반 + 달무리 (세계 레이어 — 흑백으로 눌려 종이처럼 하얗게 뜬다)
const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(17, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
scene.add(moonDisc);
const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, fog: false }));
halo.scale.setScalar(150); scene.add(halo);

// ── 지면: 비에 젖은 흙길(마차를 따라감) + 길 전체 길이의 골목 띠 ──
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x33312e, roughness: 0.68, metalness: 0.0 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);
const streetLen = ROUTE.start - ROUTE.end + 160;
const street = new THREE.Mesh(new THREE.PlaneGeometry(16, streetLen), new THREE.MeshStandardMaterial({ color: 0x46433f, roughness: 0.55, metalness: 0.0 }));
street.rotation.x = -Math.PI / 2; street.position.set(0, -0.02, (ROUTE.start + ROUTE.end) / 2 - 50); street.receiveShadow = true; scene.add(street);

// ── 거리 등롱 둘: 실광원 예산 2. 마차가 지나치면 110m 앞으로 건너뛴다(개구리 뛰기) ──
const lanterns = [];
function addLantern(x, y, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  bulb.position.y = y; bulb.layers.set(LAYER_SPOT); g.add(bulb);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, y, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1a })); pole.position.y = y / 2; pole.castShadow = true; g.add(pole);
  const light = new THREE.PointLight(0xffb347, 60, 26, 1.8); light.position.y = y - 0.3; g.add(light);
  lanterns.push({ g, light, base: 60, phase: Math.random() * 7 });
}
addLantern(8.5, 3.4, -20); addLantern(-8.5, 3.0, -75);

const look = createLook(renderer, scene, camera);

// ── HUD: 점수(우상단)·진행(좌상단)·장갑(하단, 유일한 자원)·雷 버튼·타이틀(INSERT COIN)·CONTINUE ──
const hud = document.getElementById('hud');
hud.innerHTML = `
  <div id="fps"></div>
  <div id="score"><span id="scoreN">0000000</span><span class="lbl"><i id="killN">0</i> 처치</span></div>
  <div id="wave"><span id="waveN"></span><span class="lbl" id="waveL"></span></div>
  <div id="gauges"><div id="hp"><i id="hpFill"></i></div><div class="lbl"><span id="hpN">100</span> 장갑</div></div>
  <div id="bomb"><b>雷</b><span id="bombDots"></span></div>
  <div id="title"><div class="mark">K I N G D O M B I</div><div class="t1">킹덤비</div><div class="rule"></div><div class="coin">INSERT COIN</div><div class="t3">오늘의 길 ${DAY} · 궁궐까지 ${ROUTE.start - ROUTE.end} m · 恐龍이 기다린다<br>누르면 방아쇠, 드래그로 조준, 雷 는 비격진천뢰<br>장갑이 전부다 — 수리 상자를 쏘거나 들이받아라</div></div>
  <div id="cont"><div class="mark">CONTINUE?</div><div class="n">9</div><div class="t3">누르면 코인 한 개</div></div>
  <div id="end"></div>`;
const style = document.createElement('style');
style.textContent = `
  #score { position:absolute; top: max(env(safe-area-inset-top), 14px); right: 16px; text-align:right; }
  #score #scoreN { display:block; font: 300 34px/1 var(--mono); letter-spacing:.02em; font-variant-numeric: tabular-nums; }
  #score .lbl, #wave .lbl, #gauges .lbl { display:block; margin-top:4px; font: 300 10px/1 var(--serif); letter-spacing:.5em; opacity:.55; }
  #score .lbl i { font: 300 12px/1 var(--mono); font-style:normal; letter-spacing:0; opacity:1; color: var(--red); }
  #wave { position:absolute; top: max(env(safe-area-inset-top), 14px); left: 16px; text-align:left; }
  #wave #waveN { display:block; font: 300 22px/1 var(--mono); font-variant-numeric: tabular-nums; opacity:.85; }
  #wave.stop #waveN { color: var(--red); }
  #gauges { position:absolute; left:50%; bottom: max(env(safe-area-inset-bottom), 18px); transform:translateX(-50%); width: 42%; text-align:center; }
  #gauges .lbl { margin-top:8px; letter-spacing:.4em; } #gauges .lbl span { font: 300 13px/1 var(--mono); letter-spacing:0; opacity:1; color: var(--ink); }
  #hp { height:2px; background: rgba(233,230,223,.16); position:relative; }
  #hp i { position:absolute; left:0; top:-0.5px; height:3px; background: var(--ink); width:100%; transition: width .12s linear, background .25s; }
  #hp.low i { background: var(--red); } #hp.hit i { background: var(--red); } #hp.heal i { background:#ffb347; }
  #bomb { position:absolute; right: 18px; bottom: calc(max(env(safe-area-inset-bottom), 18px) + 26px); width: 62px; height: 62px; border: 1px solid rgba(233,230,223,.35); border-radius: 50%; display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:auto; touch-action:none; user-select:none; -webkit-user-select:none; opacity:0; transition: opacity .5s, transform .1s; }
  #bomb.on { opacity:.9; } #bomb.empty { opacity:.3; } #bomb:active { transform: scale(.92); }
  #bomb b { font: 300 24px/1 var(--serif); color: var(--ink); }
  #bomb span { display:flex; gap:4px; margin-top:5px; } #bomb span i { width:5px; height:5px; border-radius:50%; background:#ffb347; display:block; }
  #title, #end, #cont { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; background: rgba(0,0,0,.42); transition: opacity .7s; }
  #end { background: rgba(0,0,0,.76); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
  #title .mark, #cont .mark { font: 300 11px/1 var(--mono); letter-spacing:.55em; opacity:.6; margin-bottom: 22px; }
  #title .t1 { font: 200 84px/1 var(--serif); letter-spacing:.02em; color: var(--ink); }
  #title .rule { width: 28px; height:1px; background: var(--red); margin: 26px 0 24px; }
  #title .coin { font: 300 16px/1 var(--mono); letter-spacing:.5em; color:#e6c87a; margin-bottom: 26px; animation: blink 1.1s steps(2, start) infinite; }
  @keyframes blink { to { visibility: hidden; } }
  #title .t3, #cont .t3 { font: 300 13px/1.9 var(--serif); opacity:.7; letter-spacing:.06em; }
  #cont { opacity:0; pointer-events:none; background: rgba(60,0,4,.55); }
  #cont .n { font: 200 min(40vw, 220px)/1 var(--mono); color: var(--ink); margin: 0 0 18px; font-variant-numeric: tabular-nums; }
  #end { opacity:0; pointer-events:none; }
  .hidden { opacity:0 !important; pointer-events:none !important; }
`;
document.head.appendChild(style);
const $ = (id) => document.getElementById(id);

// ── 부팅 ──
const t0 = performance.now();
const world = buildWorld(scene, DAY_SEED);
console.log('[kb] world built ms', (performance.now() - t0).toFixed(0), 'buildings', world.buildings.length);

const physics = await createPhysics(scene);
// 살아있는 건물은 파편·시체가 통과하지 못하게 정적 박스
for (const b of world.buildings) {
  if (b.kind === 'prop') continue;   // 소품은 정적 콜라이더 없음(파편·시체가 통과)
  const c = b.center, s = b.bounds.getSize(new THREE.Vector3());
  b.staticCollider = physics.world.createCollider(physics.RAPIER.ColliderDesc.cuboid(s.x / 2, s.y / 2, s.z / 2).setTranslation(c.x, c.y, c.z).setCollisionGroups(0x0002FFFF)); // 그룹 2: 총알 레이가 무시
}
const fx = {
  shards: createDebris(scene, { count: 700, color: 0x8d8b86, size: 0.13, gravity: -30, life: 2.6 }),
  blood: createDebris(scene, { count: 500, layer: LAYER_SPOT, color: 0xc1121f, size: 0.1, gravity: -32, bounce: 0.02, life: 1.1 }),
  gibs: createDebris(scene, { count: 400, color: 0x141210, size: 0.09, gravity: -30, bounce: 0.05, life: 1.6 }),   // 살점: 잉크색, 세계 레이어
  decals: createDecals(scene, { count: 600, color: 0x8e0c16 }),
};

const vehicle = createVehicle(scene, physics, { x: 0, z: ROUTE.start });
const vpos = vehicle.pos;   // 좀비 표적·스폰·카메라·조명이 모두 이걸 따라간다

const game = { started: false, over: false, hp: 100, pendingDamage: 0, time: 0, dawnAt: Infinity, timeScale: 1, hitstop: 0, shake: 0, razed: 0, bloodNight: false, dying: 0, cont: 0, credits: 0, score: 0, lastReached: 0, nextLightning: 6, hpFx: 0, god: q.has('god'), demo: q.has('demo') };

// ── 연출자(director): 준비 → 달림 ↔ 정차 → 보스 → 새벽 ──
const director = { phase: 'title', stopIdx: 0, stopKills0: 0, stopT0: 0, district: null, lastBlast: 0, lastCull: -1, readyT: 0, stateT: 0, ramming: false, demoBombT: 0 };
const spawn = {
  // 달릴 땐 앞쪽 길가·골목에서 쏟아져 길로 모인다. 정차 땐 정면 + 양옆 골목(뒤에서는 절대 오지 않는다 — 조준 범위 밖).
  pick() {
    const r = Math.random();
    if (director.phase === 'drive' || director.phase === 'ready' || director.phase === 'title') {
      if (r < 0.35) return { x: (Math.random() - 0.5) * 10, z: vpos.z - 95 - Math.random() * 60 };
      return { x: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 26), z: vpos.z - 55 - Math.random() * 70 };
    }
    if (r < 0.55) return { x: (Math.random() - 0.5) * 34, z: vpos.z - 45 - Math.random() * 55 };
    return { x: (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 24), z: vpos.z - 30 + Math.random() * 42 };
  },
};
const zombieCount = +(q.get('n') || (isMobile ? 260 : 360));
const horde = createHorde(scene, physics, { count: zombieCount, spawn, target: vpos, buildings: world.buildings });
horde.uniforms.uMoonDir.value.copy(moonDir);

// ── 점수: 기본점 × 연쇄 배율. 들이받기는 배율 없이 헐값(킬 수 부풀리기 방지) ──
const KILL_SCORE = [100, 1000, 250, 150];
function addScore(n, glyph, noMult = false) {
  const v = Math.round(n * (noMult ? 1 : juice.mult()));
  game.score += v;
  if (glyph) juice.pop(v, glyph);
}
horde.hooks.onKill = (type, x, z, time) => {
  if (director.ramming) { addScore(30, null, true); return; }
  juice.onKill(time, horde.stats.kills);
  addScore(KILL_SCORE[type]);
  if (type === 1) { game.hitstop = 0.42; look.state.invert = 1; juice.stamp('巨'); audio.collapse(0.6); }
};
// 폭탄 좀비 폭발: 반경 안 좀비 즉사(연쇄), 건물 부위 파괴, 피·파편·플래시·굉음
horde.hooks.onExplode = (x, z, time) => {
  const R = 6.5;
  fx.blood.burst(x, 1.2, z, 40, { dirY: 0.8, spread: 1.6, power: 12, scale: 1.4, time });
  fx.shards.burst(x, 0.5, z, 30, { dirY: 1.0, spread: 1.5, power: 10, scale: 0.9, time });
  fx.gibs.burst(x, 1.0, z, 30, { dirY: 0.9, spread: 1.6, power: 11, scale: 1.3, time });
  fx.decals.add(x, z, 4.5, time);
  look.state.flash = Math.max(look.state.flash, 0.5);
  audio.collapse(0.9);
  juice.stamp('爆');
  setTimeout(() => horde.crushNear(x, z, R, time + 0.05), 60);   // 한 프레임 뒤 — 연쇄 폭발이 눈에 보이게
  gun.blastBuildings(x, z, R, time);
  shoveBodies(x, z, R, 6, 7);
  // 마차 옆에서 터지면 장갑도 상한다
  const dv = Math.hypot(vpos.x - x, vpos.z - z); if (dv < R + 2) damageArmor(6 * (1 - dv / (R + 2)));
};
// 시체·파편 날리기. 충격량은 질량 비례(속도 변화 상한 9 m/s) — 가벼운 파편이 하늘로 사라지지 않게
function shoveBodies(x, z, R, dvCorpse, dvChunk) {
  const shove = (body, dx, dz, d, dv) => { const m = body.mass() || 1; const f = Math.min(9, dv * (1 - d / R)) * m; body.applyImpulse({ x: dx / (d || 1) * f, y: f * 0.8, z: dz / (d || 1) * f }, true); };
  for (const c of physics.corpses) { if (!c.alive) continue; const t = c.body.translation(); const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz); if (d < R) shove(c.body, dx, dz, d, dvCorpse); }
  for (const c of physics.chunks) { if (!c.alive) continue; const t = c.body.translation(); const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz); if (d < R) shove(c.body, dx, dz, d, dvChunk); }
}
function damageArmor(n) { if (!game.god) game.pendingDamage += n; }
function repairArmor(n) { game.hp = Math.min(100, game.hp + n); game.pendingDamage = Math.max(0, game.pendingDamage - n * 0.5); game.hpFx = 1; hpEl.classList.add('heal'); setTimeout(() => hpEl.classList.remove('heal'), 900); }

const fires = createFires(scene);
const juice = createJuice(hud);
const nightlife = createNightlife(scene, world.buildings, { playerZ: ROUTE.start, maxLights: 0 });   // 라이트 예산: 거리등 2 + 총구 + 화재 1
const audio = createAudio();
const gun = createGun(scene, physics, horde, world.buildings, fx, audio, look, { parent: vehicle.mount, onCollapse: (b) => { nightlife.onBuildingCollapsed(b); if (b.kind !== 'prop') { const c = b.center, sz = b.bounds.getSize(new THREE.Vector3()); fires.ignite(c.x, c.z, Math.min(sz.x, sz.z) * 0.45); game.razed++; juice.stamp('滅'); addScore(b.kind === 'palace' ? 20000 : 800, b.kind === 'palace' ? '宮' : '家'); } else addScore(50); } });
gun.attachInput(canvas);
const bosses = createBosses(scene, physics, {
  fx, audio, look, juice, horde, gun, vehicle, game, hud, camera,
  onScore: (n, glyph) => addScore(n, glyph),
  onDamage: (n) => damageArmor(n),
  onDeath: (b, time) => {
    addScore(b.score, b.name.slice(-2), true);
    if (director.phase !== 'boss') return;
    if (director.stopIdx === ROUTE.stops.length - 1) {
      // 恐龍이 궁궐 정문 위로 무너진다 — 궁궐이 함께 무너지고 새벽이 온다
      const palace = world.buildings.find((x) => x.kind === 'palace');
      setTimeout(() => { if (palace) gun.razeBuilding(palace, 0, -1, game.time); }, 900);
      director.phase = 'dawn'; game.dawnAt = time + 3; juice.banner('새벽이 온다', 4000);
    } else { director.phase = 'clear'; director.stateT = 0; }
  },
});
const pickups = createPickups(scene, { vehicle, fx, audio, juice, onHeal: repairArmor, onScore: (n, g) => addScore(n, g, true) });
gun.targets.push(pickups);
// 차선 위 수리 상자: 70m 마다 하나(정차 지점 근처 제외). 정차·보스전엔 앞쪽에 하나 더 떨어진다(쏘면 열린다).
for (let z = ROUTE.start - 70; z > ROUTE.end; z -= 62 + dayRand() * 20) if (!ROUTE.stops.some((s) => Math.abs(s.z - z) < 14)) pickups.spawn((dayRand() - 0.5) * 5, z, 'lane');
gun.hooks.onBodyHit = (body, x, y, z, time) => bosses.onBodyHit(body, x, y, z, time);
// 비격진천뢰 폭발: 반경 안 좀비 즉사(날아감), 시체·파편 날림, 보스 쇠판 파괴·피해
gun.hooks.onBlast = (x, z, R, time) => {
  juice.stamp('雷'); game.shake = Math.max(game.shake, 1.2);
  horde.crushNear(x, z, R, time);
  shoveBodies(x, z, R, 8, 8);
  const b = bosses.active;
  if (b && b.alive) {
    const c = new THREE.Vector3();
    for (const p of b.parts) { if (p.destroyed || p.kind === 'body' || p.kind === 'core') continue; p.box.getCenter(c); if (Math.hypot(c.x - x, c.z - z) < R + 2) b.hit(p, 40, c.x, c.y, c.z, (c.x - x) / R, (c.z - z) / R, time); }   // 한 발로 쇠판이 다 벗겨지진 않게(48·70·90)
    const bp = b.root.position; if (b.alive && Math.hypot(bp.x - x, bp.z - z) < R + 4) { b.hp -= 60; b.flash = 1; if (b.hp <= 0) b.hit(b.parts[0], 1, bp.x, 3, bp.z, 0, -1, time); }
  }
  const dv = Math.hypot(vpos.x - x, vpos.z - z); if (dv < R) damageArmor(10 * (1 - dv / R));
};
$('bomb').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (game.started && !game.over && game.cont <= 0) gun.throwBomb(game.time); });

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const db = renderer.getDrawingBufferSize(new THREE.Vector2()); look.setSize(db.x, db.y);
  camera.aspect = w / h;
  camera.fov = w > h ? 34 : 48;   // 좁은 화각 — 망원 압축으로 떼가 빽빽해 보인다
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

function insertCoin() {
  game.started = true; game.credits = 1;
  audio.start(); audio.coin(); setTimeout(() => audio.setBgm('wave'), 700);
  $('title').classList.add('hidden'); $('best')?.classList.add('hidden'); $('credit')?.classList.add('hidden'); $('bomb').classList.add('on'); $('gauges').classList.remove('hidden');
  director.phase = 'ready'; director.readyT = 0; juice.banner('CREDIT 1 — READY', 1600);
  // 디버그: ?boss=giant|rex — 해당 정차 지점으로 순간이동해 곧바로 보스전
  if (q.get('boss')) { const i = q.get('boss') === 'rex' ? 2 : 1; director.stopIdx = i; vpos.z = ROUTE.stops[i].z + 0.5; director.stopKills0 = horde.stats.kills - ROUTE.stops[i].quota; director.district = districtAt(vpos.z); cullBuildings(); }
}
function doContinue() {
  game.cont = 0; game.dying = 0; game.credits++;
  game.hp = 100; game.pendingDamage = 0; game.hpFx = 1;
  audio.coin(); audio.setBgm('wave');
  contEl.style.opacity = 0; contEl.style.pointerEvents = 'none';
  // 부활 충격파: 마차 주변 좀비가 날아간다
  horde.crushNear(vpos.x, vpos.z, 14, game.time); shoveBodies(vpos.x, vpos.z, 14, 8, 8);
  look.state.flash = 1; look.state.invert = 1; juice.stamp('續'); juice.banner(`CREDIT ${game.credits}`, 1600);
  gun.state.bombs = gun.state.bombsMax;
}
canvas.addEventListener('pointerdown', () => {
  if (!game.started) insertCoin();
  else if (game.over) location.reload();
  else if (game.cont > 0) doContinue();
  else audio.start();
}, { passive: true });

// ── 카메라: 마차 뒤 어깨 너머. 반동·마차 덜컹거림·보스 타격으로만 흔들린다 ──
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), tmpV = new THREE.Vector3(), camBase = new THREE.Vector3(), muzzleW = new THREE.Vector3(), aimW = new THREE.Vector3();
function updateCamera(dt) {
  camBase.set(vpos.x, vpos.y + 3.2, vpos.z + 0.5);
  const yaw = gun.state.yaw * 0.6;
  camPos.set(Math.sin(yaw) * -1.0 + Math.cos(yaw) * 1.8, 10.2, Math.cos(yaw) * 14.0 + Math.sin(yaw) * 1.8).add(camBase);   // 마차 전체(바퀴까지)가 아래에 보이도록 조금 더 뒤·위
  const r = gun.state.recoil + game.shake;
  camPos.x += (Math.random() - 0.5) * r * 0.12; camPos.y += (Math.random() - 0.5) * r * 0.1;
  camera.position.lerp(camPos, Math.min(1, dt * 9));
  tmpV.set(-Math.sin(gun.state.yaw), Math.sin(gun.state.pitch) * 0.6 - 0.02, -Math.cos(gun.state.yaw)).multiplyScalar(34).add(camBase).add(new THREE.Vector3(0, -3.2, 0));
  camTarget.lerp(tmpV, Math.min(1, dt * 12));
  camera.lookAt(camTarget);
  camera.rotation.z += (Math.random() - 0.5) * r * 0.01;
  game.shake *= Math.exp(-dt * 4);
  // 하늘·달은 카메라에 붙어 다닌다
  sky.position.copy(camera.position);
  moonDisc.position.copy(camera.position).addScaledVector(moonDir, 520); moonDisc.lookAt(camera.position);
  halo.position.copy(camera.position).addScaledVector(moonDir, 517);
}

// 마차 근처 건물만 그린다(랜드마크는 항상). 등롱은 nightlife 가 이 플래그를 따른다.
function cullBuildings() {
  for (const b of world.buildings) b.merged.visible = !!b.landmark || (b.center.z - vpos.z < 200 && b.center.z - vpos.z > -60);   // 앞 200m, 뒤 60m
}

function updateDirector(dt, time) {
  const stop = ROUTE.stops[director.stopIdx];
  if (director.phase === 'ready') {
    vehicle.state.targetSpeed = 0; director.readyT += dt;
    if (director.readyT > 1.6) { director.phase = 'drive'; juice.banner('GO', 900); juice.stamp('進'); }
  } else if (director.phase === 'drive') {
    // 정차 지점 앞에서 미리 감속(v²/2a ≈ 5 m) — 넘어가서 서면 恐龍이 문루 안에 서게 된다
    const stop0 = ROUTE.stops[director.stopIdx];
    vehicle.state.targetSpeed = stop0 && vpos.z <= stop0.z + (vehicle.state.speed * vehicle.state.speed) / (2 * 5.5) + 0.5 ? 0 : 7.5;
    if (stop0 && vehicle.state.speed < 0.05 && vpos.z > stop0.z && vpos.z <= stop0.z + 6) vpos.z = stop0.z;   // 미세 오차는 그냥 맞춘다
    const d = districtAt(vpos.z);
    if (d !== director.district) { director.district = d; if (time > 3) juice.banner(d.name, 2600); }
    if (stop && vpos.z <= stop.z) {
      director.phase = 'stop'; if (!q.get('boss')) director.stopKills0 = horde.stats.kills; director.stopT0 = time;
      Object.assign(horde.mix, stop.mix); gun.state.bombs = gun.state.bombsMax;
      pickups.spawn(vpos.x + (Math.random() - 0.5) * 14, vpos.z - 15 - Math.random() * 8, 'stop');
      juice.banner(`STAGE ${director.stopIdx + 1} · ${stop.name} · ${stop.sub}`, 3400); juice.stamp('止'); audio.thunder();
    }
  } else if (director.phase === 'stop') {
    vehicle.state.targetSpeed = 0;
    const remaining = stop.quota - (horde.stats.kills - director.stopKills0);
    if (remaining <= 0 || time - director.stopT0 > stop.cap) {
      addScore(5000 + Math.max(0, Math.round((stop.cap - (time - director.stopT0)) * 60)), '段', true);
      if (director.stopIdx === 0) { director.phase = 'clear'; director.stateT = 0; }
      else {
        director.phase = 'boss';
        bosses.spawn(director.stopIdx === 1 ? 'giant' : 'rex', vpos.x, vpos.z - (director.stopIdx === 1 ? 48 : 40), time);
        Object.assign(horde.mix, { brute: 0, bomber: 0.06, runner: 0.25 });
        pickups.spawn(vpos.x + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6), vpos.z - 12 - Math.random() * 6, 'stop');
      }
    }
  } else if (director.phase === 'boss') { vehicle.state.targetSpeed = 0; }
  else if (director.phase === 'clear') {
    vehicle.state.targetSpeed = 0; director.stateT += dt;
    if (director.stateT > 2.2) { director.phase = 'drive'; director.stopIdx++; juice.banner('길이 열렸다', 2200); juice.stamp('進'); gun.state.bombs = gun.state.bombsMax; }
  } else vehicle.state.targetSpeed = 0;

  vehicle.update(dt);
  // 들이받기: 정면 쐐기 구역의 좀비는 날아가고, 차선 위 소품은 부서진다
  if (vehicle.state.speed > 2) {
    director.ramming = true;
    const n = horde.ram(vpos.x, vpos.z, 1.9, 3.8, -1.0, time);
    director.ramming = false;
    if (n) { look.state.flash = Math.max(look.state.flash, 0.08); audio.hitFlesh(); fx.blood.burst(vpos.x, 1.2, vpos.z - 3.2, 6 * n, { dirY: 0.6, dirZ: -0.6, spread: 1.0, power: 7, scale: 1.1, time }); fx.decals.add(vpos.x, vpos.z - 3, 1.2 + n * 0.4, time); }
    if (time - director.lastBlast > 0.1) { director.lastBlast = time; gun.blastBuildings(vpos.x, vpos.z - 3.4, 2.4, time); }
  }
  if (Math.abs(vpos.z - director.lastCull) > 12) { director.lastCull = vpos.z; cullBuildings(); }
  // 거리 등롱 개구리 뛰기
  for (const l of lanterns) if (l.g.position.z > vpos.z + 30) l.g.position.z -= 110;
  followLights(vpos.x, vpos.z);
  ground.position.z = vpos.z;
}

const fpsEl = $('fps'), scoreEl = $('scoreN'), killsEl = $('killN'), hpEl = $('hp'), hpFill = $('hpFill'), hpN = $('hpN'), waveEl = $('wave'), waveN = $('waveN'), waveL = $('waveL'), bombEl = $('bomb'), bombDots = $('bombDots'), contEl = $('cont'), contN = contEl.querySelector('.n');
let frames = 0, acc = 0, last = performance.now(), hpShown = 100;
window.__kb = { renderer, scene, camera, world, look, horde, gun, physics, game, audio, vehicle, director, bosses, pickups, juice, fps: 0 };
cullBuildings(); followLights(0, ROUTE.start);
$('gauges').classList.add('hidden');   // 타이틀에선 장갑 게이지 대신 크레딧이 그 자리에 있다

let captureRequest = null;   // 사망 프레임 캡처 콜백(렌더 직후 1회)
renderer.setAnimationLoop((now) => {
  const rawDt = Math.min(0.05, (now - last) / 1000); last = now;
  // 히트스톱(거대 킬·보스 킬)·사망 슬로우·컨티뉴 정지: 시간 배율
  if (game.hitstop > 0) { game.hitstop -= rawDt; game.timeScale = 0.16; } else if (game.cont > 0) { game.timeScale = 0.04; } else if (game.dying > 0) { game.timeScale = 0.2; } else game.timeScale = 1;
  const dt = rawDt * game.timeScale;
  const started = game.started && !game.over;
  if (started) game.time += dt;
  const time = game.time;
  look.state.invert *= Math.exp(-rawDt * 22);

  const reachedBefore = game.lastReached;
  if (started && game.demo) {
    // 자동 데모: 보스가 있으면 약점(노출 코어 > 쇠판 > QTE 덩어리), 아니면 가장 가까운 좀비를 겨눈 채 훑는다 (클립 녹화용)
    gun.state.firing = game.cont <= 0 && !q.has('nofire');   // ?nofire=1: 조준만 하고 쏘지 않는다(보스 스크린샷용)
    gun.muzzle.getWorldPosition(muzzleW);
    let tx = null;
    if (bosses.aimPoint(aimW)) tx = aimW;
    else {
      const phase = (time % 16);
      if (phase < 12) {
        let best = -1, bestD = 1e9;
        for (let i = 0; i < horde.N; i++) { if (!horde.alive[i]) continue; const dz = horde.pz[i] - vpos.z; if (dz > 2) continue; const d = Math.hypot(horde.px[i] - vpos.x, dz); if (d > 5 && d < bestD) { bestD = d; best = i; } }
        if (best >= 0) tx = aimW.set(horde.px[best], 1.1, horde.pz[best]);
      } else {
        const ty = phase < 14 ? 0.62 : -0.6;
        gun.state.yaw += (ty - gun.state.yaw) * Math.min(1, dt * 4); gun.state.pitch += (0.02 - gun.state.pitch) * Math.min(1, dt * 4);
      }
    }
    if (tx) {
      const dx = tx.x - muzzleW.x, dz = tx.z - muzzleW.z, dist = Math.hypot(dx, dz);
      const ty = Math.atan2(-dx, -dz) + (bosses.active ? 0 : Math.sin(time * 2.1) * 0.06);
      const tp = Math.atan2(tx.y - muzzleW.y, dist);
      gun.state.yaw += (THREE.MathUtils.clamp(ty, -1.5, 1.5) - gun.state.yaw) * Math.min(1, dt * 6);
      gun.state.pitch += (THREE.MathUtils.clamp(tp, -0.62, gun.state.pitchMax) - gun.state.pitch) * Math.min(1, dt * 6);
    }
    if ((director.phase === 'stop' || director.phase === 'boss') && time - director.demoBombT > 13 && gun.state.bombs > 0) { director.demoBombT = time; gun.throwBomb(time); }
  }
  if (started) {
    updateDirector(dt, time);
    horde.update(dt, time);
    bosses.update(dt, time);
    pickups.update(dt, time);
    // 장갑 피해는 풀에 쌓아 초당 9 까지만 빠진다 — 떼가 한꺼번에 붙어도 최소 11초는 버티며 쏴 낼 수 있다
    if (horde.stats.reached > reachedBefore) { game.pendingDamage += horde.stats.reachDamage; horde.stats.reachDamage = 0; look.state.flash = Math.max(look.state.flash, 0.1); game.lastReached = horde.stats.reached; }
    if (game.pendingDamage > 0) { const d = Math.min(game.pendingDamage, 9 * dt); game.pendingDamage -= d; if (!game.god) game.hp -= d; }
    gun.update(dt, time);
    physics.step(dt, time);
    fx.shards.update(dt, time); fx.blood.update(dt, time); fx.gibs.update(dt, time); fx.decals.update(time);
    audio.setGroan(Math.min(1, horde.stats.alive / 200) * 0.3);
  } else {
    horde.update(0, time);           // 정지 포즈 유지(타이틀 뒤 배경)
    gun.state.firing = false;
    gun.update(dt, time);
    vehicle.update(dt);
  }
  updateCamera(dt);

  // 천둥·번개: 한 번씩 세계를 하얗게 찢는다
  if (started && time > game.nextLightning) {
    game.nextLightning = time + 9 + Math.random() * 16;
    look.state.flash = Math.max(look.state.flash, 0.65);
    moon.intensity = 16;
    setTimeout(() => audio.thunder(), 500 + Math.random() * 600);
  }
  moon.intensity += (5.2 - moon.intensity) * Math.min(1, dt * 6);
  look.state.flash *= Math.exp(-dt * 9);
  nightlife.update(dt);
  for (const l of lanterns) l.light.intensity = l.base * (0.85 + 0.15 * Math.sin(now * 0.011 + l.phase) + 0.08 * Math.sin(now * 0.037 + l.phase * 3));

  // 붉은 밤: 장갑 28% 미만이면 세계가 붉게 물든다
  const wantBlood = started && game.hp < 28;
  if (wantBlood && !game.bloodNight) { game.bloodNight = true; juice.banner('마차가 불탄다 — 붉은 밤'); juice.stamp('危'); audio.thunder(); audio.setBgm('bloodnight'); }
  if (!wantBlood && game.bloodNight) { game.bloodNight = false; if (!game.over && game.cont <= 0) audio.setBgm('wave'); }
  look.state.blood += ((game.bloodNight ? 1 : 0) - look.state.blood) * Math.min(1, rawDt * 2.5);
  fires.update(dt); juice.update(time);

  // 새벽: 恐龍을 쓰러뜨리면 밝아진다
  if (started && time > game.dawnAt) { look.state.darkness = Math.max(-0.6, look.state.darkness - dt * 0.05); if (!game.dawnBgm) { game.dawnBgm = true; audio.setBgm('lull'); } }
  if (started && time > game.dawnAt + 12) endGame(true);
  // 사망 → 슬로우 → CONTINUE? 카운트다운(실시간 9초) → 종료
  if (started && game.hp <= 0 && !game.dying && game.cont <= 0) { game.dying = 0.9; juice.stamp('終'); look.state.invert = 1; audio.setBgm('death'); }
  if (game.dying > 0) { game.dying -= rawDt; if (game.dying <= 0) { game.dying = 0; if (game.demo) endGame(false); else { game.cont = 9.99; contEl.style.opacity = 1; contEl.style.pointerEvents = 'auto'; } } }
  if (game.cont > 0) { game.cont -= rawDt; contN.textContent = Math.max(0, Math.ceil(game.cont - 0.99)); if (game.cont <= 0) { game.cont = 0; contEl.style.opacity = 0; endGame(false); } }

  renderer.info.reset();
  look.render(now / 1000);
  if (captureRequest) { const cb = captureRequest; captureRequest = null; canvas.toBlob((b) => cb(b), 'image/png'); }

  frames++; acc += dt;
  if (acc >= 0.5) {
    window.__kb.fps = frames / acc;
    if (q.has('stats')) fpsEl.textContent = `${(frames / acc).toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tri · z${horde.stats.alive} · ${vpos.z.toFixed(0)}m · ${director.phase}`;
    frames = 0; acc = 0;
  }
  scoreEl.textContent = String(game.score).padStart(7, '0'); killsEl.textContent = horde.stats.kills;
  // 장갑: 유일한 자원. 깎이면 붉게 번쩍, 고치면 호박색
  const hpNow = Math.max(0, game.hp);
  if (hpNow < hpShown - 0.5) { hpEl.classList.add('hit'); game.hpFx = 0.5; } else if (game.hpFx <= 0) hpEl.classList.remove('hit');
  game.hpFx -= rawDt; hpShown = hpNow;
  hpFill.style.width = `${hpNow}%`; hpN.textContent = Math.round(hpNow); hpEl.classList.toggle('low', hpNow < 28);
  if (bombDots.childElementCount !== gun.state.bombs) { bombDots.innerHTML = '<i></i>'.repeat(gun.state.bombs); bombEl.classList.toggle('empty', gun.state.bombs === 0); }
  // 좌상단: 달릴 땐 궁궐까지 거리, 정차 땐 남은 처치 수, 보스전엔 BOSS
  if (game.started) {
    const stop = ROUTE.stops[director.stopIdx];
    if (director.phase === 'stop' && stop) { waveEl.classList.add('stop'); waveN.textContent = Math.max(0, stop.quota - (horde.stats.kills - director.stopKills0)); waveL.textContent = stop.name; }
    else if (director.phase === 'boss') { waveEl.classList.add('stop'); waveN.textContent = 'BOSS'; waveL.textContent = stop?.name ?? ''; }
    else { waveEl.classList.remove('stop'); waveN.textContent = `${Math.max(0, Math.round(vpos.z - ROUTE.end))} m`; waveL.textContent = director.phase === 'dawn' ? '새벽' : '궁궐까지'; }
  }
});

function endGame(win) {
  if (game.over) return;
  game.over = true;
  contEl.style.opacity = 0; contEl.style.pointerEvents = 'none';
  const st = { win, score: game.score, credits: game.credits, kills: horde.stats.kills, time: game.time, accuracy: gun.state.shots ? gun.state.hits / gun.state.shots : 0, razed: game.razed, reachedM: Math.max(0, Math.round(vpos.z - ROUTE.end)), day: DAY };
  captureRequest = (blob) => juice.endCard($('end'), st, blob, () => location.reload(), { url: BOARD_URL, day: DAY, demo: game.demo });
}
