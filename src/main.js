import * as THREE from 'three';
import { buildWorld, ROUTE, ROAD_HALF, districtAt, rng, createRoutePath } from './world.js';
import { createLook, LAYER_SPOT } from './look.js';
import { createPhysics } from './physics.js';
import { createHorde } from './horde.js';
import { createDebris, createDecals, createMist } from './debris.js';
import { createGun } from './gun.js';
import { createVehicle } from './vehicle.js';
import { createBosses } from './boss.js';
import { createPickups } from './pickups.js';
import { createAudio } from './audio.js';
import { createNightlife } from './nightlife.js';
import { createSky } from './sky.js';
import { createGround } from './ground.js';
import { createFires } from './fire.js';
import { createJuice, rankOf } from './juice.js';
import { createCine } from './cine.js';
import { createSkills } from './skills.js';
import { LANG, S, setLang } from './i18n.js';

const q = new URLSearchParams(location.search);
// 데일리 시드: 로컬 날짜(YYYY-MM-DD)를 해시해 길·소품·수리 상자 배치를 정한다. 순위표도 같은 날짜 키를 쓴다.
const DAY = q.get('day') || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const DAY_SEED = [...DAY].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261);
const dayRand = rng(DAY_SEED ^ 0x9e3779b9);
const BOARD_URL = 'https://kingdombi-scores.midagedev.workers.dev';
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
// 저자극(2026-09-03): 반전 프레임 없음·플래시 상한·흔들림 30%. OS 설정(prefers-reduced-motion) 또는 ?calm=1 또는 타이틀 토글.
let calmStore = null; try { calmStore = localStorage.getItem('kb.calm'); } catch {}
let CALM = q.has('calm') || calmStore === '1' || (calmStore !== '0' && matchMedia('(prefers-reduced-motion: reduce)').matches);
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

// 하늘(src/sky.js): 돔·별·크레이터 달·구름·먹 산. 카메라를 따라다닌다.
const sky = createSky(scene, { night: NIGHT, horizon: HORIZON, moonDir, isMobile });

// 레일(src/path.js): 마차·스폰·컬링·HUD 거리가 전부 s(진행 거리) 로 말한다.
const path = createRoutePath();
const sV = () => vehicle.state.s;   // 마차의 s (vehicle 은 아래서 만든다 — 호출 시점엔 있다)
// 지면(src/ground.js): 젖은 흙땅(마차를 따라감, 무늬는 월드 고정) + 구간마다 바큇자국 난 길 띠
const ground = createGround(scene, path, { roadHalf: ROAD_HALF, end: ROUTE.end, stub: ROUTE.stub });

// ── 거리 등롱 둘: 실광원 예산 2. 마차가 지나치면 110m 앞으로 건너뛴다(개구리 뛰기) ──
const lanterns = [];
function addLantern(lat, y, s) {
  const g = new THREE.Group(); path.at(s, lat, g.position); scene.add(g);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  bulb.position.y = y; bulb.layers.set(LAYER_SPOT); g.add(bulb);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, y, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1a })); pole.position.y = y / 2; pole.castShadow = true; g.add(pole);
  const light = new THREE.PointLight(0xffb347, 60, 26, 1.8); light.position.y = y - 0.3; g.add(light);
  lanterns.push({ g, light, base: 60, phase: Math.random() * 7, s, lat });
}
addLantern(8.5, 3.4, 34); addLantern(-8.5, 3.0, 89);

const look = createLook(renderer, scene, camera);

// ── HUD: 점수(우상단)·진행(좌상단)·장갑(하단, 유일한 자원)·雷 버튼·타이틀(INSERT COIN)·CONTINUE ──
const hud = document.getElementById('hud');
hud.innerHTML = `
  <div id="fps"></div>
  <div id="score"><span id="scoreN">0000000</span><span class="lbl"><i id="killN">0</i> ${S.kills}</span></div>
  <div id="wave"><span id="waveN"></span><span class="lbl" id="waveL"></span></div>
  <div id="gauges"><div id="hp"><i id="hpFill"></i></div><div class="lbl"><span id="hpN">100</span> ${S.armor}</div></div>
  <div id="bomb"><b>雷</b><span id="bombDots"></span></div>
  <div id="stick"><i></i></div>
  <div id="ret"><svg viewBox="0 0 100 100" fill="none" stroke-linecap="round"><circle class="o" cx="50" cy="50" r="40"/><g class="spin"><circle cx="50" cy="50" r="29" stroke-dasharray="15 30.5"/></g><path class="t" d="M50 0v16M50 84v16M0 50h16M84 50h16"/><circle class="c" cx="50" cy="50" r="3.5"/></svg></div>
  <div id="lang"><span data-l="ko" class="${LANG === 'ko' ? 'on' : ''}">한국어</span><span data-l="en" class="${LANG === 'en' ? 'on' : ''}">EN</span><span id="calm" class="${CALM ? 'on' : ''}">${S.calm}</span></div>
  <div id="cont"><button id="contEnd">${S.contEnd}</button></div>
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
  #gauges { position:absolute; left:50%; bottom: max(env(safe-area-inset-bottom), 18px); transform:translateX(-50%); width: 38%; text-align:center; }
  #gauges .lbl { margin-top:8px; letter-spacing:.4em; } #gauges .lbl span { font: 300 13px/1 var(--mono); letter-spacing:0; opacity:1; color: var(--ink); }
  #hp { height:2px; background: rgba(233,230,223,.16); position:relative; }
  #hp i { position:absolute; left:0; top:-0.5px; height:3px; background: var(--ink); width:100%; transition: width .12s linear, background .25s; }
  #hp.low i { background: var(--red); } #hp.hit i { background: var(--red); } #hp.heal i { background:#ffb347; }
  #bomb { position:absolute; right: 22px; bottom: calc(max(env(safe-area-inset-bottom), 18px) + 150px); width: 62px; height: 62px; border: 1px solid rgba(233,230,223,.35); border-radius: 50%; display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:auto; touch-action:none; user-select:none; -webkit-user-select:none; opacity:0; transition: opacity .5s, transform .1s; }
  #bomb.on { opacity:.9; } #bomb.empty { opacity:.3; } #bomb:active { transform: scale(.92); }
  #bomb b { font: 300 24px/1 var(--serif); color: var(--ink); }
  #bomb span { display:flex; gap:4px; margin-top:5px; } #bomb span i { width:5px; height:5px; border-radius:50%; background:#ffb347; display:block; }
  #stick { position:absolute; right:22px; bottom: calc(max(env(safe-area-inset-bottom), 18px) + 18px); width:108px; height:108px; margin:-54px 0 0 -54px; border:1px solid rgba(233,230,223,.45); border-radius:50%; opacity:0; pointer-events:none; }
  #stick.hint { opacity:.22; transition: opacity .4s; } #stick.on { opacity:.8; }
  /* 오락실 라이트건 조준선: 바깥 원 + 네 눈금 + 천천히 도는 끊긴 안쪽 원 + 호박 점. 포신 방향(가슴 높이 접점)을 화면에 투영, 어디에도 붙지 않는다.
     .fire = 발사 중(커지고 호박색), .hit = 명중 순간(중심점 튐) */
  #ret { position:absolute; left:0; top:0; width:66px; height:66px; opacity:0; pointer-events:none; will-change: transform; filter: drop-shadow(0 0 2px rgba(0,0,0,.95)); transition: opacity .15s; }
  #ret svg { width:100%; height:100%; overflow:visible; transition: transform .08s; }
  #ret .o { stroke: rgba(233,230,223,.9); stroke-width:3; transition: stroke .08s; }
  #ret .t { stroke: rgba(233,230,223,.95); stroke-width:3.2; }
  #ret .spin { transform-origin: 50% 50%; animation: retspin 5s linear infinite; } #ret .spin circle { stroke: rgba(233,230,223,.55); stroke-width:2.2; }
  #ret .c { fill:#ffb347; transform-origin: 50% 50%; transition: transform .06s; }
  #ret.fire svg { transform: scale(1.12); } #ret.fire .o { stroke:#ffb347; } #ret.fire .spin { animation-duration: 1.2s; }
  #ret.hit .c { transform: scale(2.2); }
  @keyframes retspin { to { transform: rotate(360deg); } }
  #stick i { position:absolute; left:50%; top:50%; width:44px; height:44px; margin:-22px 0 0 -22px; border-radius:50%; background: rgba(233,230,223,.5); box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
  #lang { position:absolute; top: max(env(safe-area-inset-top), 14px); left: 16px; font: 300 11px/1 var(--mono); letter-spacing:.2em; pointer-events:auto; display:flex; gap:14px; opacity:.55; }
  #lang span { cursor:pointer; padding: 6px 0; } #lang span.on { color:#e6c87a; border-bottom:1px solid #e6c87a; } #lang #calm { margin-left: 10px; }
  #c { cursor: crosshair; }
  #hud { text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.5); }
  /* iOS 사파리: 더블탭 확대·핀치 차단(touch-action 은 상속되지 않아 요소마다) */
  canvas, #hud, #hud * { touch-action: none; }
  /* 폰(세로·좁은 화면): 라벨 크게, 바 두껍게, 雷 버튼 엄지 크기 */
  @media (max-width: 600px) {
    #score .lbl, #wave .lbl, #gauges .lbl { font-size: 12px; opacity: .8; }
    #score .lbl i { font-size: 14px; } #gauges .lbl span { font-size: 15px; }
    #wave #waveN { font-size: 26px; }
    #hp { height: 4px; } #hp i { height: 5px; top: -0.5px; }
    #boss { top: calc(max(env(safe-area-inset-top), 14px) + 58px) !important; width: 64% !important; }   /* 점수(우상단 34px 7자리) 아래로 — 390px 에선 보스 이름이 점수와 겹쳤다 */
    #boss div { height: 3px !important; } #boss i { height: 4px !important; } #boss span { font-size: 12px !important; opacity: .9 !important; }
    #banner { font-size: 14px !important; } #pops div { font-size: 16px !important; } #combo b { font-size: 26px !important; } #combo span { font-size: 12px !important; }
    #ret { width: 78px; height: 78px; }
    #bomb { width: 76px; height: 76px; right: 18px; bottom: calc(max(env(safe-area-inset-bottom), 18px) + 160px); } #bomb b { font-size: 30px; } #bomb span i { width: 7px; height: 7px; }
    #lang { font-size: 12px; }
  }
  /* 오프닝·컨티뉴·엔딩 글은 씬 안의 캔버스 판(cine.js). DOM 은 버튼·입력·순위표만 — 아래쪽 띠 */
  #hud.title #score, #hud.title #wave, #hud.over #score, #hud.over #wave, #hud.over #gauges, #hud.over #bomb, #hud.over #stick, #hud.over #ret, #hud.over #combo, #hud.over #boss, #hud.over #pops, #hud.over #banner { opacity:0 !important; transition: opacity .6s; }
  #cont { position:absolute; left:50%; bottom: calc(max(env(safe-area-inset-bottom), 18px) + 64px); transform:translateX(-50%); opacity:0; pointer-events:none; transition: opacity .6s; }
  #cont.on { opacity:1; pointer-events:auto; }
  #cont button { font: 300 12px/1 var(--serif); letter-spacing:.4em; padding: 10px 6px; background:transparent; color: var(--ink); border:0; border-bottom: 1px solid rgba(233,230,223,.35); opacity:.6; cursor:pointer; }
  #end { position:absolute; left:0; right:0; bottom:0; display:flex; flex-direction:column; align-items:center; opacity:0; pointer-events:none; transition: opacity .9s; }
  #end.on { opacity:1; pointer-events:auto; }
  .hidden { opacity:0 !important; pointer-events:none !important; }
`;
document.head.appendChild(style);
const $ = (id) => document.getElementById(id);
// 로케일: <html lang> 과 문서 제목·설명(영문일 때 덮어쓴다 — 정적 HTML 은 한국어)
document.documentElement.lang = LANG; document.title = S.docTitle; document.querySelector('meta[name=description]')?.setAttribute('content', S.docDesc);
$('lang').addEventListener('pointerdown', (e) => { e.stopPropagation(); const l = e.target.dataset.l; if (l && l !== LANG) setLang(l); if (e.target.id === 'calm') { CALM = !CALM; e.target.classList.toggle('on', CALM); try { localStorage.setItem('kb.calm', CALM ? '1' : '0'); } catch {} } });

// ── 부팅 ──
const t0 = performance.now();
const world = buildWorld(scene, DAY_SEED, path);
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
  mist: createMist(scene),
  gibs: createDebris(scene, { count: 400, color: 0x141210, size: 0.09, gravity: -30, bounce: 0.05, life: 1.6 }),   // 살점: 잉크색, 세계 레이어
  decals: createDecals(scene, { count: 600, color: 0x8e0c16 }),
  brass: createDebris(scene, { count: 240, layer: LAYER_SPOT, color: 0xd9a64a, size: 0.08, gravity: -22, bounce: 0.35, life: 1.4 }),   // 탄피
};

const vehicle = createVehicle(scene, physics, { path, s: 0 });
const vpos = vehicle.pos;   // 좀비 표적·스폰·카메라·조명이 모두 이걸 따라간다

const game = { started: false, over: false, paused: false, hp: 100, pendingDamage: 0, time: 0, dawnAt: Infinity, timeScale: 1, hitstop: 0, shake: 0, razed: 0, bloodNight: false, dying: 0, cont: 0, credits: 0, score: 0, lastReached: 0, nextLightning: 6, hpFx: 0, god: q.has('god'), demo: q.has('demo') };

// ── 연출자(director): 준비 → 달림 ↔ 정차 → 보스 → 새벽 ──
const director = { phase: 'title', stopIdx: 0, stopKills0: 0, stopT0: 0, district: null, lastBlast: 0, lastCull: -1, readyT: 0, stateT: 0, ramming: false, demoBombT: 0, flipFrom: 0, flipTo: 0, flipNext: 'drive', driveSpeed: 5.0 };
// ── 앞뒤 전환(facing): 게임은 두 얼굴이다 ──
//   추격(π) — 마차가 달리고 떼가 뒤에서 쫓아온다. 카메라는 마차 앞쪽에서 뒤를 본다. 조준은 한 방향으로 모여 관통이 산다.
//   대치(0) — 보스 앞에서 선다. 카메라가 마차를 축으로 180° 돌아 앞을 본다. 잡몹은 얇게 깔린다.
// 카메라·포탑·스폰·컬링·등롱이 이 각 하나를 공유한다.
const facing = { a: 0, rel: 0, chase: false };   // a = rel(추격 π · 대치 0 · 전환 중 보간) + 길 헤딩. 매 프레임 vehicle.update 뒤에 합친다
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const spawn = {
  // 추격: 뒤에서 쫓아온다(16~70m — 앞줄이 8~20m 에 붙어 있어야 쏘는 손이 쉬지 않는다).
  // 대치: 정면 + 양옆 골목(등 뒤에서는 절대 오지 않는다 — 조준 범위 밖).
  pick() {
    const r = Math.random();
    const s = sV(), o = { x: 0, z: 0 };
    if (facing.chase) {
      // 코너 뒤 옆길(stub): 방금 지난 코너의 옛 방향 길에서 떼가 쏟아진다 — 카메라가 뒤를 보니 골목 입구가 화면 안이다
      const g = path.segs.find((g) => g.s1 !== Infinity && s > g.s1 - 6 && s < g.s1 + 70);
      if (g && r < 0.35) return path.atSeg(g, g.s1 + 8 + Math.random() * (ROUTE.stub - 10), (Math.random() - 0.5) * 10, o);
      // 지붕(2026-09-03): 뒤 12~52 m 길가 집 지붕 위에 서서 처마로 기어 나와 떨어진다 — 실루엣이 하늘에 걸려 잘 읽힌다
      if (r >= 0.35 && r < 0.55) { const hs = roofHouses(s - 52, s - 12); if (hs.length) { const b = hs[Math.floor(Math.random() * hs.length)], sz = b.bounds.getSize(roofSz); return { x: b.center.x + (Math.random() - 0.5) * sz.x * 0.3, z: b.center.z + (Math.random() - 0.5) * sz.z * 0.3, roof: b }; } }
      if (r < 0.45) return path.at(s - 20 - Math.random() * 50, (Math.random() - 0.5) * 12, o);
      return path.at(s - 14 - Math.random() * 56, (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 22), o);
    }
    if (r < 0.55) return path.at(s + 45 + Math.random() * 55, (Math.random() - 0.5) * 34, o);
    return path.at(s + 30 - Math.random() * 42, (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 24), o);
  },
};
const roofSz = new THREE.Vector3();
const roofHouses = (s0, s1) => world.buildings.filter((b) => (b.kind === 'choga' || b.kind === 'giwa') && b.alive && b.s > s0 && b.s < s1 && Math.abs(b.lat) < 20);
const zombieCount = +(q.get('n') || (isMobile ? 260 : 360));
const BOSS_BUDGET = Math.round(zombieCount * 0.25);   // 대치 중엔 떼를 1/4 로 — 보스가 주인공이다
const horde = createHorde(scene, physics, { count: zombieCount, spawn, target: vpos, buildings: world.buildings, path });
horde.uniforms.uMoonDir.value.copy(moonDir);

// ── 점수: 기본점 × 연쇄 배율. 들이받기는 배율 없이 헐값(킬 수 부풀리기 방지) ──
const KILL_SCORE = [100, 1000, 250, 150];
function addScore(n, glyph, noMult = false) {
  const v = Math.round(n * (noMult ? 1 : juice.mult()));
  game.score += v;
  if (glyph) juice.pop(v, glyph);
}
horde.hooks.onKill = (type, x, z, time, cause) => {
  if (cause === 'impale') { addScore(30, null, true); fx.blood.burst(x, 1.1, z, 8, { dirX: (x - vpos.x) * 0.3, dirY: 0.5, spread: 0.9, power: 5, scale: 1, time }); return; }   // 가시에 꿰임: 헐값, 배율 없음(붙게 두는 게 이득이면 안 된다)
  if (cause === 'auto') { addScore(Math.round(KILL_SCORE[type] * 0.5), null, true); return; }   // 스킬 자동공격: 절반 점수·배율 없음 — 직접 쏘는 게 늘 유리하다
  if (director.ramming) { addScore(30, null, true); return; }
  juice.onKill(time, horde.stats.kills);
  addScore(KILL_SCORE[type]);
  if (type === 1) { game.hitstop = 0.42; look.state.invert = 1; juice.stamp('巨'); audio.collapse(0.6); }
};
// 폭탄 좀비 폭발: 반경 안 좀비 즉사(연쇄), 건물 부위 파괴, 피·파편·플래시·굉음
// 사지 상실·헤드샷(2026-09-03): 팔이 떨어지거나 머리가 날아가면 그 자리에서 살점·피·안개가 터진다
horde.hooks.onLimb = (x, y, z, dx, dz, time, big) => { fx.gibs.burst(x, y, z, big > 1 ? 14 : 7, { dirX: dx * 0.7, dirY: 0.5, dirZ: dz * 0.7, spread: 1.0, power: 5, scale: 1.1, time }); fx.blood.burst(x, y, z, big > 1 ? 12 : 6, { dirX: dx * 0.6, dirY: 0.5, dirZ: dz * 0.6, spread: 0.9, power: 6, scale: 1, time }); fx.mist.puff(x, y, z, big > 1 ? 4 : 2, dx, dz, time); if (big > 1) addScore(40, null, true); };
horde.hooks.onExplode = (x, z, time) => {
  const R = 6.5;
  fx.blood.burst(x, 1.2, z, 40, { dirY: 0.8, spread: 1.6, power: 12, scale: 1.4, time });
  fx.shards.burst(x, 0.5, z, 30, { dirY: 1.0, spread: 1.5, power: 10, scale: 0.9, time });
  fx.gibs.burst(x, 1.0, z, 30, { dirY: 0.9, spread: 1.6, power: 11, scale: 1.3, time });
  fx.decals.add(x, z, 3.2, time);
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
const cine = createCine(scene, camera, { isMobile });
hud.classList.add('title'); cine.show('title');
$('contEnd').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (game.cont > 0) endGame(false); });
const nightlife = createNightlife(scene, world.buildings, { playerZ: ROUTE.start.z, maxLights: 0 });   // 라이트 예산: 거리등 2 + 총구 + 화재 1
const audio = createAudio();
const gun = createGun(scene, physics, horde, world.buildings, fx, audio, look, { camera, parent: vehicle.mount, onCollapse: (b) => { nightlife.onBuildingCollapsed(b); if (b.kind !== 'prop') { const c = b.center, sz = b.bounds.getSize(new THREE.Vector3()); fires.ignite(c.x, c.z, Math.min(sz.x, sz.z) * 0.45); game.razed++; juice.stamp('滅'); addScore(b.kind === 'palace' ? 20000 : 800, b.kind === 'palace' ? '宮' : '家'); } else addScore(50); } });
gun.attachInput(canvas, { stickEl: $('stick'), forceStick: q.has('stick') });
gun.setReticle($('ret'));   // 터치는 조이스틱, 마우스는 드래그. ?stick=1 로 강제
const bosses = createBosses(scene, physics, {
  fx, audio, look, juice, horde, gun, vehicle, game, hud, camera,
  onScore: (n, glyph) => addScore(n, glyph),
  onDamage: (n) => damageArmor(n),
  onDeath: (b, time) => {
    addScore(b.score, b.glyph, true);
    if (director.phase !== 'boss') return;
    if (director.stopIdx === ROUTE.stops.length - 1) {
      // 恐龍이 궁궐 정문 위로 무너진다 — 궁궐이 함께 무너지고 새벽이 온다
      const palace = world.buildings.find((x) => x.kind === 'palace');
      setTimeout(() => { if (palace) gun.razeBuilding(palace, 0, -1, game.time); }, 900);
      director.phase = 'dawn'; game.dawnAt = time + 3; juice.banner(S.dawnComing, 4000);
    } else { director.phase = 'clear'; director.stateT = 0; }   // 잠깐 여운 → 자동 카드 → 다시 뒤를 보고 달린다
  },
});
const pickups = createPickups(scene, { vehicle, fx, audio, juice, onHeal: repairArmor, onScore: (n, g) => addScore(n, g, true) });
gun.targets.push(pickups);
// 스킬(뱀서류 보강): 정차 전환 3번 카드 선택. 자동공격 카드는 巨人 뒤부터 — 초반 클립은 개틀링이主体다
const skills = createSkills(scene, { path, horde, gun, vehicle, fx, audio, look, juice, game, hud, camera, pickups, bosses, onScore: (n, g) => addScore(n, g, true), isDemo: game.demo });
// 길가 수리 상자: 70m 마다 하나(정차 지점 근처 제외), 마차가 스치는 길 가장자리(|x| 3.6~5). 카메라가 뒤를 보므로 지나친 뒤 떼 속에서 호박색으로 빛나고, 2발 쏘면 열린다.
// 예전엔 차선 한복판에서 들이받아 먹었는데 그 순간이 화면 밖이라 +25 만 뜨고 아무것도 안 보였다(2026-09-03). 정차·보스전엔 앞쪽에 하나 더 떨어진다.
{ const o = new THREE.Vector3(); for (let s = 70; s < ROUTE.end; s += 62 + dayRand() * 20) if (!ROUTE.stops.some((st) => Math.abs(st.s - s) < 14)) { path.at(s, (dayRand() < 0.5 ? -1 : 1) * (3.6 + dayRand() * 1.4), o); pickups.spawn(o.x, o.z, 'lane'); } }
gun.hooks.onBodyHit = (body, x, y, z, time) => bosses.onBodyHit(body, x, y, z, time);
// 雷 다연장로켓: 발사 순간 스탬프, 착탄마다(12발) 반경 안 좀비 즉사(날아감), 시체·파편 날림, 보스 쇠판·본체 피해 × mul(로켓 0.3)
gun.hooks.onSalvo = () => { juice.stamp('雷'); game.shake = Math.max(game.shake, 0.5); };
gun.hooks.onBlast = (x, z, R, time, mul = 1) => {
  game.shake = Math.max(game.shake, 1.0);
  horde.crushNear(x, z, R, time);
  shoveBodies(x, z, R, 8, 8);
  const b = bosses.active;
  if (b && b.alive) {
    const c = new THREE.Vector3();
    for (const p of b.parts) { if (p.destroyed || p.kind === 'body' || p.kind === 'core') continue; p.box.getCenter(c); if (Math.hypot(c.x - x, c.z - z) < R + 2) b.hit(p, 40 * mul, c.x, c.y, c.z, (c.x - x) / R, (c.z - z) / R, time); }   // 한 발로 쇠판이 다 벗겨지진 않게(48·70·90)
    const bp = b.root.position; if (b.alive && Math.hypot(bp.x - x, bp.z - z) < R + 4) { b.hp -= 60 * mul; b.flash = 1; if (b.hp <= 0) b.hit(b.parts[0], 1, bp.x, 3, bp.z, 0, -1, time); }
  }
  const dv = Math.hypot(vpos.x - x, vpos.z - z); if (dv < R) damageArmor(10 * mul * (1 - dv / R));
};
const bombNow = () => { if (game.started && !game.over && game.cont <= 0 && !game.paused) gun.fireSalvo(game.time); };
$('bomb').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); bombNow(); });
gun.hooks.onBombKey = bombNow;
addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); bombNow(); } });
// iOS 사파리 확대 차단: 더블탭·핀치(gesturestart) — 게임 중 화면이 커지면 조작이 끝난다
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

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
  cine.hide(); hud.classList.remove('title'); $('lang').classList.add('hidden'); $('bomb').classList.add('on'); $('gauges').classList.remove('hidden');
  director.phase = 'ready'; director.readyT = 0; juice.banner('CREDIT 1 — READY', 1600);
  // 디버그: ?boss=giant|rex — 해당 정차 지점으로 순간이동해 곧바로 보스전
  if (q.get('boss')) { const i = q.get('boss') === 'rex' ? 2 : 1; director.stopIdx = i; vehicle.state.s = ROUTE.stops[i].s; vehicle.update(0); director.district = districtAt(sV()); facing.rel = 0; facing.a = vehicle.state.heading; facing.chase = false; horde.chase = false; cullBuildings(); director.readyT = 0; }
}
function doContinue() {
  game.cont = 0; game.dying = 0; game.credits++;
  game.hp = 100; game.pendingDamage = 0; game.hpFx = 1;
  audio.coin(); audio.setBgm('wave');
  contEl.classList.remove('on'); cine.hide();
  // 부활 충격파: 마차 주변 좀비가 날아간다
  horde.crushNear(vpos.x, vpos.z, 14, game.time); shoveBodies(vpos.x, vpos.z, 14, 8, 8);
  look.state.flash = 1; look.state.invert = 1; juice.stamp('續'); juice.banner(`CREDIT ${game.credits}`, 1600);
  gun.state.bombs = gun.state.bombsMax;
}
canvas.addEventListener('pointerdown', () => {
  if (!game.started) insertCoin();
  else if (game.over) return;   // 전적을 읽는 중에 실수로 재시작되지 않게 — '다시' 버튼으로만
  else if (game.cont > 0) doContinue();
  else audio.start();
}, { passive: true });

// ── 카메라: 마차 뒤 어깨 너머. 반동·마차 덜컹거림·보스 타격으로만 흔들린다 ──
const _al = { s: 0, lat: 0, k: 0 };
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), tmpV = new THREE.Vector3(), camBase = new THREE.Vector3(), muzzleW = new THREE.Vector3(), aimW = new THREE.Vector3();
// 세로(폰)는 화각이 좁아 마차·가시가 화면 아래로 잘렸다 — 더 뒤·위에서 내려다본다(줌아웃). window.__kb.cam 으로 라이브 튠.
// 대치(보스)는 위에서 내려다보고, 추격은 낮게 깔아 마차를 화면 아래 1/3 에 두고 그 너머로 떼가 밀려온다.
const cam = {
  land: { h: 7, d: 14.0, look: 32, drop: 2.0 }, port: { h: 10.5, d: 20, look: 28, drop: 3.4 },
  chaseLand: { h: 5.5, d: 14.0, look: 30, drop: 2.8 }, chasePort: { h: 8, d: 18, look: 27, drop: 3.2 },
};
// 건물 컬링 창(m). window.__kb.cull 로 라이브 튠. 2026-09-03 실측(1280×720, 발사 없음): 옛 추격 창(뒤 170·앞 60·그림자 전부)은 기와 골목 1623 콜·육조거리 1524.
// 뒤 120 → 1281 (화면 차이는 맨 위 지붕선 한 줄) · 앞 20(카메라 뒤 — 어차피 절두체 밖, 그림자만 냈다) · 뒤 70 m 너머 그림자 끔 → 1057. 대치 창은 그대로(70/60).
const cull = { chaseFar: 120, chaseNear: 20, bossFar: 70, shadowFar: 70 };
let cineA = 0.9, cineT = -1;
function updateCamera(dt, rawDt = dt) {
  const P = camera.aspect < 1;
  // 오프닝·엔딩: 마차를 낮게 도는 히어로 샷. 엔딩은 조금 높고 느리게, 새벽이면 천천히 떠오른다. 하늘·달 추종은 아래 공통.
  if (director.phase === 'title' || game.over) {
    const first = cineT < 0; cineT = first ? 0 : cineT + rawDt; cineA += rawDt * (game.over ? 0.06 : 0.09);
    const R = game.over ? 13 : 12, H = game.over ? (game.won ? 6 + Math.min(9, cineT * 0.55) : 5.5) : 4.4;
    // 타이틀은 마차 위 4.6 m 를 본다 — 마차가 화면 아래 1/3 에 앉고 그 위 하늘·지붕선에 글이 놓인다(마차 중심을 보면 글이 마차 실루엣과 겹쳤다)
    camPos.set(vpos.x + Math.sin(cineA) * R, vpos.y + H, vpos.z + Math.cos(cineA) * R); tmpV.set(vpos.x, vpos.y + (game.over ? 2.2 : 4.6), vpos.z);
    if (first) { camera.position.copy(camPos); camTarget.copy(tmpV); } else { camera.position.lerp(camPos, Math.min(1, rawDt * 2)); camTarget.lerp(tmpV, Math.min(1, rawDt * 2)); }
    camera.lookAt(camTarget);
    sky.update(camera.position, game.time, renderer.getPixelRatio());
    return;
  }
  const k = director.phase === 'ready' ? 2.2 : 9;   // 코인 직후 1.6초: 낮은 궤도에서 게임 구도로 크레인 업
  const C = facing.chase ? (P ? cam.chasePort : cam.chaseLand) : (P ? cam.port : cam.land);
  camBase.set(vpos.x, vpos.y + 3.2, vpos.z);
  // 카메라는 포신이 아니라 **커서**를 따른다(2026-09-03). 조준선이 화면에 고정된 구조에서 카메라가 포신을 보면 커서→포신→카메라→커서 되먹임으로 포신이 끝까지 돌아갔다(실측 NDC 0.72 커서에 yaw −1.28).
  const cur = gun.state.cur, cx = gun.state.follow ? -(cur.x / innerWidth * 2 - 1) * 0.5 : gun.state.yaw, cy = gun.state.follow ? (1 - cur.y / innerHeight * 2) * 0.15 : Math.sin(gun.state.pitch) * 0.6;
  const yaw = cx * 0.6;
  // 조준 추종은 옆으로 1.8m 만 미끄러진다(궤도가 아니다 — 조준할 때마다 카메라가 돌면 멀미난다).
  // 앞뒤 전환은 그 '완성된 오프셋'을 통째로 y축 회전시킨다. 식 안에 각을 더하면 중간(π/2)에서 반경이 무너져 마차로 줌인된다.
  // 거리(C.d)는 고정하고 옆으로만 미끄러진다. 예전 식은 cos(yaw)·d 라 옆을 겨눌수록 카메라가 마차로 줌인돼,
  // 추격 구도에선 마차가 화면 아래로 잘려 나갔다.
  camPos.set(Math.sin(yaw) * -1.0 + Math.cos(yaw) * 1.8, C.h, C.d).applyAxisAngle(AXIS_Y, facing.a).add(camBase);
  const r = gun.state.recoil + game.shake;
  camPos.x += (Math.random() - 0.5) * r * 0.06; camPos.y += (Math.random() - 0.5) * r * 0.05;   // 반동 떨림 절반 — 화면이 아니라 총이 흔들려야 한다
  camera.position.lerp(camPos, Math.min(1, dt * k));
  tmpV.set(-Math.sin(cx), cy - 0.02, -Math.cos(cx)).applyAxisAngle(AXIS_Y, facing.a).multiplyScalar(C.look).add(camBase); tmpV.y -= C.drop;
  camTarget.lerp(tmpV, Math.min(1, dt * Math.max(k, 12 * (k / 9))));
  camera.lookAt(camTarget);
  camera.rotation.z += (Math.random() - 0.5) * r * 0.01;
  game.shake *= Math.exp(-dt * 4);
  // 하늘·달·산은 카메라에 붙어 다닌다
  sky.update(camera.position, game.time, renderer.getPixelRatio());
}

// 마차 근처 건물만 그린다(랜드마크는 항상). 등롱은 nightlife 가 이 플래그를 따른다.
function cullBuildings() {
  // 보는 쪽으로 멀리, 등 뒤로 60m. 추격전은 뒤를 보므로 창이 통째로 뒤집힌다.
  // 대치는 서서 코앞의 보스를 보므로 짧게 — 200m 를 세우면 드로우콜이 예산(≈1000)을 넘는다.
  // 전환(flip) 중엔 카메라가 양쪽을 다 훑으므로 양방향으로 넓게 켠다(1.2초). 끝나면 보는 쪽 창으로 줄어든다.
  const flip = director.phase === 'flip', s = facing.chase ? -1 : 1;
  const far = flip || facing.chase ? -cull.chaseFar : -cull.bossFar, near = flip ? cull.chaseFar : facing.chase ? cull.chaseNear : 60;
  for (const b of world.buildings) {
    const d = -(b.s - sV()) * s; b.merged.visible = !!b.landmark || (d < near && d > far);
    // 먼 집은 그림자 패스에서 뺀다 — 안개 속 지붕선만 남고 그림자는 보이지 않는데 드로우콜은 두 배로 낸다
    const cast = !!b.landmark || (flip ? Math.abs(d) < cull.shadowFar : d > -cull.shadowFar);   // 궁궐(광장에서 d≈-70)·사찰 그림자는 늘 — 恐龍 결전 구도가 그림자에 얹혀 있다
    if (b.merged.userData.cast !== cast) { b.merged.userData.cast = cast; b.merged.traverse((m) => { if (m.isMesh) m.castShadow = cast; }); }
  }
}

// 앞뒤 전환: 1.2초 동안 카메라가 마차를 축으로 돌고 그동안 조준은 잠긴다(gun.state.live).
// 스폰 방향은 즉시 바뀌고, 반대편에 남은 놈들은 조용히 치운다 — 전환이 끝나면 떼는 이미 총구 쪽에 있다.
function startFlip(to, then, time) {
  director.flipFrom = facing.rel; director.flipTo = to; director.flipThen = then;
  director.phase = 'flip'; director.stateT = 0;
  facing.chase = Math.abs(to) > 1; horde.chase = facing.chase;
  if (facing.chase) applyDistrict(districtAt(sV())); else horde.speedMul = 1;   // 추격전은 마차가 달아나므로 떼가 구역 배율만큼 빨라야 붙는다
  horde.recycleSide(facing.chase ? -1 : 1, time);
  cullBuildings();   // 전환 중엔 양방향 창 — 카메라가 돌아가며 보게 될 쪽 집이 미리 켜져 있어야 한다
}
// 구역 압박 곡선: 정원·종류 비율·속도가 구역마다 오른다(world.js districts). 추격 중에만 — 대치는 toBoss 가 따로 정한다.
function applyDistrict(d) {
  horde.budget = Math.round(zombieCount * d.cap); Object.assign(horde.mix, d.mix); horde.speedMul = d.speed;
}
// 대치 진입: 마차가 서고 보스가 나온다. 잡몹은 얇게 깔린다(보스에 집중).
function toBoss(time) {
  const s = ROUTE.stops[director.stopIdx];
  director.phase = 'boss'; director.stopT0 = time;
  horde.budget = BOSS_BUDGET; horde.trimTo(BOSS_BUDGET, time); Object.assign(horde.mix, s.mix);
  const f = path.fwd(sV(), tmpV); path.at(sV() + (s.boss === 'rex' ? 40 : 48), 0, aimW);
  bosses.spawn(s.boss, aimW.x, aimW.z, time, { x: -f.x, z: -f.z });   // axis = 보스→마차
  path.at(sV() + 12 + Math.random() * 6, (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6), aimW); pickups.spawn(aimW.x, aimW.z, 'stop');
}
function updateDirector(dt, time) {
  const stop = ROUTE.stops[director.stopIdx];
  if (director.phase === 'ready') {
    vehicle.state.targetSpeed = 0; director.readyT += dt;
    // 출발과 동시에 카메라가 돌아 뒤를 본다 — 마을이 쏟아낸 떼가 쫓기 시작한다
    if (director.readyT > 1.6) {
      if (q.get('boss')) toBoss(time);   // 디버그: 곧바로 대치(앞을 본 채로)
      else { juice.banner('GO', 900); juice.stamp('進'); startFlip(Math.PI, () => { director.phase = 'drive'; }, time); }
    }
  } else if (director.phase === 'flip') {
    vehicle.state.targetSpeed = director.flipTo === 0 ? 0 : director.driveSpeed;
    director.stateT += dt;
    const k = Math.min(1, director.stateT / 1.2), e = k * k * (3 - 2 * k);
    facing.rel = director.flipFrom + (director.flipTo - director.flipFrom) * e;
    gun.state.yaw += (0 - gun.state.yaw) * Math.min(1, dt * 5);   // 포신을 정면으로 모아 놓고 넘긴다
    if (k >= 1) { facing.rel = director.flipTo; director.stateT = 0; director.flipThen(time); cullBuildings(); }   // 페이즈를 먼저 바꿔야 컬링이 양방향 창에서 보는 쪽 창으로 줄어든다
  } else if (director.phase === 'drive') {
    // 보스 지점 앞에서만 미리 감속(v²/2a) — 넘어가서 서면 恐龍이 문루 안에 선다. 카드 지점은 서지 않고 지나간다.
    const brake = stop && stop.boss && sV() >= stop.s - (vehicle.state.speed * vehicle.state.speed) / (2 * 5.5) - 0.5;
    vehicle.state.targetSpeed = brake ? 0 : director.driveSpeed;
    if (stop && stop.boss && vehicle.state.speed < 0.05 && sV() < stop.s && sV() >= stop.s - 6) vehicle.state.s = stop.s;
    const d = districtAt(sV());
    if (d !== director.district) { director.district = d; applyDistrict(d); juice.banner(S.place(d.name), 2600); }   // GO(0.9초) 뒤에 첫 구역 이름이 뜬다
    if (stop && sV() >= stop.s) {
      if (!stop.boss) {   // 시전 거리: 서지 않는다. 달리는 채로 한 장 고른다(고르는 동안 세계가 멈춘다).
        director.stopIdx++; juice.banner(S.stage(1, stop), 3000); juice.stamp('補');
        director.phase = 'pick'; skills.offer('stat', () => { director.phase = 'drive'; });
      } else if (vehicle.state.speed < 0.05) {
        juice.banner(S.stage(director.stopIdx + 1, stop), 3000); juice.stamp('止'); audio.thunder();
        gun.state.bombs = gun.state.bombsMax;
        // 恐龍 결전 직전에만 마지막 보강 한 장
        if (stop.boss === 'rex') { director.phase = 'pick'; skills.offer('any', () => startFlip(0, toBoss, game.time)); }
        else startFlip(0, toBoss, time);
      }
    }
  } else if (director.phase === 'pick' || director.phase === 'boss') { vehicle.state.targetSpeed = 0; }
  else if (director.phase === 'clear') {
    vehicle.state.targetSpeed = 0; director.stateT += dt;
    // 巨人을 넘겼다: 자동 카드 한 장 → 다시 뒤를 보고 달린다
    if (director.stateT > 2.2) {
      director.phase = 'pick';
      skills.offer('auto', () => {
        director.stopIdx++; gun.state.bombs = gun.state.bombsMax;   // 정원·비율·속도는 startFlip → applyDistrict 가 구역 값으로 되돌린다
        juice.banner(S.roadOpen, 2200); juice.stamp('進');
        startFlip(Math.PI, () => { director.phase = 'drive'; }, game.time);
      });
    }
  } else vehicle.state.targetSpeed = 0;

  vehicle.update(dt); facing.a = facing.rel + vehicle.state.heading;
  // 들이받기: 정면 쐐기 구역의 좀비는 날아가고, 차선 위 소품은 부서진다
  if (vehicle.state.speed > 2) {
    director.ramming = true;
    const n = horde.ram(vpos.x, vpos.z, vehicle.state.heading, 1.9, 3.8, -1.0, time); const f = path.fwd(sV(), tmpV);
    director.ramming = false;
    if (n) { look.state.flash = Math.max(look.state.flash, 0.08); audio.hitFlesh(); fx.blood.burst(vpos.x + f.x * 3.2, 1.2, vpos.z + f.z * 3.2, 6 * n, { dirY: 0.6, dirX: f.x * 0.6, dirZ: f.z * 0.6, spread: 1.0, power: 7, scale: 1.1, time }); fx.decals.add(vpos.x + f.x * 3, vpos.z + f.z * 3, 1.2 + n * 0.4, time); }
    if (time - director.lastBlast > 0.1) { director.lastBlast = time; gun.blastBuildings(vpos.x + f.x * 3.4, vpos.z + f.z * 3.4, 2.4, time); }
  }
  if (Math.abs(sV() - director.lastCull) > 12) { director.lastCull = sV(); cullBuildings(); }
  // 거리 등롱 개구리 뛰기 — 보는 쪽에 머물러야 한다. 추격전엔 마차 뒤(z 큰 쪽)가 화면이다.
  for (const l of lanterns) { const behind = sV() - l.s; if (facing.chase ? behind > 110 : behind > 30) { l.s += 110; path.at(l.s, l.lat, l.g.position); } }
  followLights(vpos.x, vpos.z);
  ground.update(vpos.x, vpos.z);
}

const fpsEl = $('fps'), scoreEl = $('scoreN'), killsEl = $('killN'), hpEl = $('hp'), hpFill = $('hpFill'), hpN = $('hpN'), waveEl = $('wave'), waveN = $('waveN'), waveL = $('waveL'), bombEl = $('bomb'), bombDots = $('bombDots'), contEl = $('cont');
let frames = 0, acc = 0, last = performance.now(), hpShown = 100;
window.__kb = { path, cam, cull, cullBuildings, renderer, scene, camera, world, look, horde, gun, physics, game, audio, vehicle, director, bosses, pickups, skills, juice, fps: 0 };
cullBuildings(); followLights(vpos.x, vpos.z);
$('gauges').classList.add('hidden');   // 타이틀에선 장갑 게이지 대신 크레딧이 그 자리에 있다

let captureRequest = null;   // 사망 프레임 캡처 콜백(렌더 직후 1회)
renderer.setAnimationLoop((now) => {
  const rawDt = Math.min(0.05, (now - last) / 1000); last = now;
  // 히트스톱(거대 킬·보스 킬)·사망 슬로우·컨티뉴 정지: 시간 배율
  if (game.hitstop > 0) { game.hitstop -= rawDt; game.timeScale = 0.16; } else if (game.cont > 0) { game.timeScale = 0.04; } else if (game.dying > 0) { game.timeScale = 0.2; } else game.timeScale = 1;
  const dt = rawDt * game.timeScale;
  const started = game.started && !game.over;
  const running = started && !game.paused;   // 카드 선택 중: 세계가 멈춘다
  if (running) game.time += dt;
  gun.state.facing = facing.a; gun.state.heading = vehicle.state.heading;
  horde.rail.s = vehicle.state.s; horde.rail.heading = vehicle.state.heading; horde.rail.speed = vehicle.state.speed;
  gun.state.showAim = gun.state.live = running && game.cont <= 0 && director.phase !== 'flip';   // 앞뒤 전환 중엔 조준이 잠긴다
  const time = game.time;
  look.state.invert *= Math.exp(-rawDt * 22);

  const reachedBefore = game.lastReached;
  if (running && game.demo) {
    // 자동 데모: 보스가 있으면 약점(노출 코어 > 쇠판 > QTE 덩어리), 아니면 가장 가까운 좀비를 겨눈 채 훑는다 (클립 녹화용)
    gun.state.follow = false; gun.state.firingPtr = game.cont <= 0 && !q.has('nofire');   // gun.update 가 firing 을 포인터·키 상태에서 다시 계산하므로 포인터 쪽을 흉내낸다   // ?nofire=1: 조준만 하고 쏘지 않는다(보스 스크린샷용)
    gun.muzzle.getWorldPosition(muzzleW);
    let tx = null;
    if (bosses.aimPoint(aimW)) tx = aimW;
    else {
      const phase = (time % 16);
      if (phase < 12) {
        let best = -1, bestD = 1e9;
        // 총구가 보는 쪽에 있는 놈만 후보 — 추격전(뒤를 봄)에선 마차 뒤가 사냥터다
        for (let i = 0; i < horde.N; i++) { if (!horde.alive[i]) continue; const al = path.along(horde.px[i], horde.pz[i], _al), dz = -(al.s - sV()) * (facing.chase ? -1 : 1); if (dz > 2) continue; const d = Math.hypot(al.lat, dz); if (d > 5 && d < bestD) { bestD = d; best = i; } }
        if (best >= 0) tx = aimW.set(horde.px[best], 1.1, horde.pz[best]);
      } else {
        const ty = phase < 14 ? 0.62 : -0.6;
        gun.state.yaw += (ty - gun.state.yaw) * Math.min(1, dt * 4); gun.state.pitch += (0.02 - gun.state.pitch) * Math.min(1, dt * 4);
      }
    }
    if (tx) {
      const dx = tx.x - muzzleW.x, dz = tx.z - muzzleW.z, dist = Math.hypot(dx, dz);
      let ty = Math.atan2(-dx, -dz) - facing.a + (bosses.active ? 0 : Math.sin(time * 2.1) * 0.06);   // 조준각은 보는 쪽 기준의 상대각
      ty = Math.atan2(Math.sin(ty), Math.cos(ty));
      const tp = Math.atan2(tx.y - muzzleW.y, dist);
      gun.state.yaw += (THREE.MathUtils.clamp(ty, -1.5, 1.5) - gun.state.yaw) * Math.min(1, dt * 6);
      gun.state.pitch += (THREE.MathUtils.clamp(tp, -0.62, gun.state.pitchMax) - gun.state.pitch) * Math.min(1, dt * 6);
    }
    if (director.phase === 'boss' && time - director.demoBombT > 13 && gun.state.bombs > 0) { director.demoBombT = time; gun.fireSalvo(time); }
  }
  if (running) {
    updateDirector(dt, time);
    horde.update(dt, time);
    bosses.update(dt, time);
    pickups.update(dt, time);
    skills.update(dt, time);
    // 장갑 피해는 풀에 쌓아 초당 9 까지만 빠진다 — 떼가 한꺼번에 붙어도 최소 11초는 버티며 쏴 낼 수 있다
    if (horde.stats.reached > reachedBefore) { game.pendingDamage += horde.stats.reachDamage; horde.stats.reachDamage = 0; look.state.flash = Math.max(look.state.flash, 0.1); game.lastReached = horde.stats.reached; }
    if (game.pendingDamage > 0) { const d = Math.min(game.pendingDamage, 9 * dt); game.pendingDamage -= d; if (!game.god) game.hp -= d; }
    gun.update(dt, time, rawDt);
    physics.step(dt, time);
    fx.shards.update(dt, time); fx.blood.update(dt, time); fx.mist.update(dt, time); fx.gibs.update(dt, time); fx.brass.update(dt, time); fx.decals.update(time);
    audio.setGroan(Math.min(1, horde.stats.alive / 200) * 0.3);
  } else {
    horde.update(0, time);           // 정지 포즈 유지(타이틀 뒤 배경·카드 선택 중)
    gun.state.firingPtr = false;
    if (director.phase === 'title') { gun.state.yaw = Math.sin(now * 0.0004) * 0.7; gun.state.pitch = -0.05 + Math.sin(now * 0.0007) * 0.04; }   // 오프닝: 포신이 천천히 훑는다
    gun.update(dt, time);
    skills.update(0, time);
    vehicle.update(0);   // dt 0 — 카드 선택 중 drive 의 목표 속도(5 m/s)가 남아 있어 마차가 1.2초에 6 m 굴러갔다(실측 -150.1→-157.6)
  }
  updateCamera(dt, rawDt);
  cine.update(rawDt);

  // 천둥·번개: 한 번씩 세계를 하얗게 찢는다
  if (running && time > game.nextLightning) {
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
  const wantBlood = running && game.hp < 28;
  if (wantBlood && !game.bloodNight) { game.bloodNight = true; juice.banner(S.bloodNight); juice.stamp('危'); audio.thunder(); audio.setBgm('bloodnight'); }
  if (!wantBlood && game.bloodNight) { game.bloodNight = false; if (!game.over && game.cont <= 0) audio.setBgm('wave'); }
  look.state.blood += ((game.bloodNight ? 1 : 0) - look.state.blood) * Math.min(1, rawDt * 2.5);
  fires.update(dt, vpos.x, vpos.z); juice.update(time);

  // 새벽: 恐龍을 쓰러뜨리면 밝아진다
  if ((running && time > game.dawnAt) || (game.over && game.won)) { look.state.darkness = Math.max(-0.6, look.state.darkness - rawDt * 0.05); if (!game.dawnBgm) { game.dawnBgm = true; audio.setBgm('lull'); } }   // 새벽은 엔딩 판 뒤에서도 계속 밝아진다
  if (running && time > game.dawnAt + 12) endGame(true);
  // 사망 → 슬로우 → CONTINUE?(카운트다운 없음, 2026-09-03 — 무료 웹에서 9초 재촉은 의미가 없었다. 누르면 계속, '그만' 버튼이면 종료)
  if (running && game.hp <= 0 && !game.dying && game.cont <= 0) { game.dying = 0.9; juice.stamp('終'); look.state.invert = 1; audio.setBgm('death'); }
  if (game.dying > 0) { game.dying -= rawDt; if (game.dying <= 0) { game.dying = 0; if (game.demo) endGame(false); else { game.cont = 1; cine.show('cont'); contEl.classList.add('on'); } } }

  // 피격 붉은 테두리: 피해 풀이 빠지는 동안 켜져 있다(한 순간이 아니라 '지금 맞고 있다')
  look.state.hurt += (((started && game.pendingDamage > 0.2) ? Math.min(0.8, 0.3 + game.pendingDamage / 30) : 0) - look.state.hurt) * Math.min(1, rawDt * 8);
  if (CALM) { look.state.invert = 0; look.state.flash = Math.min(look.state.flash, 0.25); game.shake *= 0.3; game.hitstop = Math.min(game.hitstop, 0.2); }
  renderer.info.reset();
  look.render(now / 1000);
  if (captureRequest) { const cb = captureRequest; captureRequest = null; canvas.toBlob((b) => cb(b), 'image/png'); }

  frames++; acc += dt;
  if (acc >= 0.5) {
    window.__kb.fps = frames / acc;
    if (q.has('stats')) fpsEl.textContent = `${(frames / acc).toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tri · z${horde.stats.alive} · s${sV().toFixed(0)} · ${director.phase}`;
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
    if (director.phase === 'boss') { waveEl.classList.add('stop'); waveN.textContent = 'BOSS'; waveL.textContent = S.place(stop?.name ?? ''); }
    else { waveEl.classList.remove('stop'); waveN.textContent = `${Math.max(0, Math.round(ROUTE.end - sV()))} m`; waveL.textContent = director.phase === 'dawn' ? S.dawn : S.toPalace; }
  }
});

function endGame(win) {
  if (game.over) return;
  game.over = true; game.won = win; game.cont = 0; contEl.classList.remove('on'); cine.hide(); hud.classList.add('over'); cineT = -1;
  const st = { win, score: game.score, credits: game.credits, kills: horde.stats.kills, time: game.time, accuracy: gun.state.shots ? gun.state.hits / gun.state.shots : 0, razed: game.razed, reachedM: Math.max(0, Math.round(ROUTE.end - sV())), day: DAY };
  st.rank = rankOf(st.score); st.maxCombo = juice.maxCombo;
  captureRequest = (blob) => { juice.endCard($('end'), st, blob, () => location.reload(), { url: BOARD_URL, day: DAY, demo: game.demo }); cine.show('end', st); setTimeout(() => $('end').classList.add('on'), 1600); };
}
