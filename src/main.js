import * as THREE from 'three';
import { buildWorld, LAYOUT } from './world.js';
import { createLook, LAYER_SPOT } from './look.js';
import { createPhysics } from './physics.js';
import { createHorde } from './horde.js';
import { createDebris, createDecals } from './debris.js';
import { createGun } from './gun.js';
import { createAudio } from './audio.js';
import { createNightlife } from './nightlife.js';

const q = new URLSearchParams(location.search);
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
// 하늘: 지평선이 살짝 밝은 안개빛 → 검은 지붕선이 실루엣으로 읽힌다(느와르의 기본 문법)
const sky = new THREE.Mesh(new THREE.SphereGeometry(640, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: NIGHT }, bottom: { value: HORIZON } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top, bottom; varying vec3 vP; void main(){ float h = clamp(vP.y / 640.0, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.45)), 1.0); }',
}));
scene.add(sky);

const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 700);

// ── 조명: 달(역광, 장그림자) + 낮은 하늘빛 + 등롱 ──
const moonDir = new THREE.Vector3(-0.2, 0.36, -1).normalize();
const moon = new THREE.DirectionalLight(0xd8e0ff, 5.2);
moon.position.copy(moonDir).multiplyScalar(220).add(new THREE.Vector3(0, 0, -40));
moon.target.position.set(0, 0, -40); scene.add(moon.target);
moon.castShadow = true;
moon.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
Object.assign(moon.shadow.camera, { left: -95, right: 95, top: 120, bottom: -90, near: 20, far: 520 });
moon.shadow.camera.updateProjectionMatrix();
moon.shadow.bias = -0.00035; moon.shadow.normalBias = 0.06;
scene.add(moon);
const hemi = new THREE.HemisphereLight(0x6672a8, 0x0c0b0a, 1.1);
scene.add(hemi);
// 카메라 쪽 보조광(그림자 없음): 기와 골·공포·창살이 중간톤으로 살아난다. 달 역광의 림·장그림자는 그대로.
const fill = new THREE.DirectionalLight(0xb8c4e0, 1.9);
fill.position.set(60, 50, 140); fill.target.position.set(0, 0, -60); scene.add(fill, fill.target);

// 달 원반 + 달무리 (세계 레이어 — 흑백으로 눌려 종이처럼 하얗게 뜬다)
const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(17, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
moonDisc.position.copy(moonDir).multiplyScalar(520); moonDisc.lookAt(0, 0, 0); scene.add(moonDisc);
const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, fog: false }));
halo.position.copy(moonDisc.position).multiplyScalar(0.995); halo.scale.setScalar(150); scene.add(halo);

// ── 지면: 비에 젖은 흙길. 골목 띠는 살짝 밝게 ──
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x33312e, roughness: 0.68, metalness: 0.0 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);
const street = new THREE.Mesh(new THREE.PlaneGeometry(16, 260), new THREE.MeshStandardMaterial({ color: 0x46433f, roughness: 0.55, metalness: 0.0 }));
street.rotation.x = -Math.PI / 2; street.position.set(0, -0.02, -75); street.receiveShadow = true; scene.add(street);

// ── 등롱: 호박색 스팟컬러 + 세계를 비추는 포인트 라이트 ──
const lanterns = [];
function addLantern(x, y, z) {
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  bulb.position.set(x, y, z); bulb.layers.set(LAYER_SPOT); scene.add(bulb);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, y, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1a })); pole.position.set(x, y / 2, z); pole.castShadow = true; scene.add(pole);
  const light = new THREE.PointLight(0xffb347, 60, 26, 1.8); light.position.set(x, y - 0.3, z); scene.add(light);
  lanterns.push({ bulb, light, base: 60, phase: Math.random() * 7 });
}
addLantern(8.5, 3.4, -62); addLantern(5, 2.6, 18);

const look = createLook(renderer, scene, camera);

// ── HUD ──
const hud = document.getElementById('hud');
hud.innerHTML = `
  <div id="fps"></div>
  <div id="kills"></div>
  <div id="heat"><div id="heatFill"></div></div>
  <div id="hp"><div id="hpFill"></div></div>
  <div id="title"><div class="t1">킹덤비</div><div class="t2">KINGDOMBI</div><div class="t3">밤이 온다. 화면을 눌러 방아쇠를 당겨라.<br>드래그 = 조준 · 누르고 있기 = 발사</div></div>
  <div id="end"></div>`;
const style = document.createElement('style');
style.textContent = `
  #kills { position:absolute; top: max(env(safe-area-inset-top), 12px); right: 14px; font: 900 22px/1 ui-sans-serif, system-ui, "Apple SD Gothic Neo", sans-serif; color:#eee; letter-spacing:.06em; text-shadow: 0 0 12px #000; }
  #kills small { display:block; font-size:10px; opacity:.6; letter-spacing:.3em; }
  #heat { position:absolute; left:50%; bottom: max(env(safe-area-inset-bottom), 16px); transform:translateX(-50%); width:44%; height:6px; background:#111; border:1px solid #333; }
  #heatFill { height:100%; width:0; background:linear-gradient(90deg,#666,#c1121f 70%,#ff8a3d); }
  #hp { position:absolute; left:50%; bottom: calc(max(env(safe-area-inset-bottom), 16px) + 12px); transform:translateX(-50%); width:44%; height:3px; background:#111; }
  #hpFill { height:100%; width:100%; background:#ddd; }
  #title, #end { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; background:rgba(0,0,0,.55); transition: opacity .6s; }
  #title .t1 { font: 900 96px/1 "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif; color:#f2f2f2; letter-spacing:-.04em; text-shadow: 0 0 40px rgba(193,18,31,.8), 0 0 4px #000; }
  #title .t1::first-letter { color:#c1121f; }
  #title .t2 { font: 700 13px/1 ui-monospace, monospace; color:#b04cff; letter-spacing:.7em; margin: 14px 0 34px; }
  #title .t3 { font: 500 13px/1.8 system-ui, sans-serif; color:#bbb; }
  #end { opacity:0; pointer-events:none; }
  #end .big { font: 900 44px/1.2 "Apple SD Gothic Neo", system-ui, sans-serif; color:#f2f2f2; }
  #end .sub { font: 500 14px/1.8 system-ui, sans-serif; color:#bbb; margin-top:14px; }
  .hidden { opacity:0 !important; pointer-events:none; }
`;
document.head.appendChild(style);
const $ = (id) => document.getElementById(id);

// ── 부팅 ──
const t0 = performance.now();
const world = buildWorld(scene);
console.log('[kb] world built ms', (performance.now() - t0).toFixed(0), 'buildings', world.buildings.length);

const physics = await createPhysics(scene);
// 살아있는 건물은 파편·시체가 통과하지 못하게 정적 박스
for (const b of world.buildings) {
  if (b.kind === 'prop') continue;   // 소품은 정적 콜라이더 없음(파편·시체가 통과)
  const c = b.bounds.getCenter(new THREE.Vector3()), s = b.bounds.getSize(new THREE.Vector3());
  b.staticCollider = physics.world.createCollider(physics.RAPIER.ColliderDesc.cuboid(s.x / 2, s.y / 2, s.z / 2).setTranslation(c.x, c.y, c.z).setCollisionGroups(0x0002FFFF)); // 그룹 2: 총알 레이가 무시
}
const fx = {
  shards: createDebris(scene, { count: 900, color: 0x8d8b86, size: 0.2 }),
  blood: createDebris(scene, { count: 600, layer: LAYER_SPOT, color: 0xc1121f, size: 0.12, gravity: -24, bounce: 0.05, life: 1.6 }),
  decals: createDecals(scene, { count: 600, color: 0x8e0c16 }),
};
const zombieCount = +(q.get('n') || (isMobile ? 260 : 360));
const playerPos = new THREE.Vector3(LAYOUT.player.x, LAYOUT.player.y, LAYOUT.player.z);
const horde = createHorde(scene, physics, { count: zombieCount, spawn: LAYOUT.spawn, target: playerPos, buildings: world.buildings });
horde.uniforms.uMoonDir.value.copy(moonDir);
// 폭탄 좀비 폭발: 반경 안 좀비 즉사(연쇄), 건물 부위 파괴, 피·파편·플래시·굉음
horde.hooks.onExplode = (x, z, time) => {
  const R = 6.5;
  fx.blood.burst(x, 1.2, z, 40, { dirY: 0.8, spread: 1.6, power: 12, scale: 1.4, time });
  fx.shards.burst(x, 0.5, z, 30, { dirY: 1.0, spread: 1.5, power: 10, scale: 0.9, time });
  fx.decals.add(x, z, 4.5, time);
  look.state.flash = Math.max(look.state.flash, 0.5);
  audio.collapse(0.9);
  setTimeout(() => horde.crushNear(x, z, R, time + 0.05), 60);   // 한 프레임 뒤 — 연쇄 폭발이 눈에 보이게
  gun.blastBuildings(x, z, R, time);
  // 시체·파편 날리기
  for (const c of physics.corpses) { if (!c.alive) continue; const t = c.body.translation(); const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz); if (d < R) { const f = (1 - d / R) * 14; c.body.applyImpulse({ x: dx / (d || 1) * f, y: f * 0.8, z: dz / (d || 1) * f }, true); } }
  for (const c of physics.chunks) { if (!c.alive) continue; const t = c.body.translation(); const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz); if (d < R) { const f = (1 - d / R) * 40; c.body.applyImpulse({ x: dx / (d || 1) * f, y: f * 0.9, z: dz / (d || 1) * f }, true); } }
};
const nightlife = createNightlife(scene, world.buildings, { playerZ: LAYOUT.player.z, maxLights: 2 });
const audio = createAudio();
const gun = createGun(scene, physics, horde, world.buildings, fx, audio, look, { position: playerPos, onCollapse: (b) => nightlife.onBuildingCollapsed(b) });
gun.attachInput(canvas);

const game = { started: false, over: false, hp: 100, pendingDamage: 0, time: 0, dawnAt: 120, lastReached: 0, nextLightning: 6, god: q.has('god'), demo: q.has('demo') };

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const db = renderer.getDrawingBufferSize(new THREE.Vector2()); look.setSize(db.x, db.y);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  camera.fov = w > h ? 44 : 64; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

canvas.addEventListener('pointerdown', () => {
  if (!game.started) { game.started = true; audio.start(); $('title').classList.add('hidden'); }
  else if (game.over) location.reload();
  else audio.start();
}, { passive: true });

// ── 카메라: 포대 뒤 어깨 너머. 반동으로만 흔들린다 ──
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), tmpV = new THREE.Vector3();
function updateCamera(dt) {
  const yaw = gun.state.yaw * 0.6;
  camPos.set(Math.sin(yaw) * -1.0 + Math.cos(yaw) * 1.7, 3.4, Math.cos(yaw) * 4.9 + Math.sin(yaw) * 1.7).add(playerPos);
  // 살짝 옆에서 (오른쪽 어깨) — 총열과 골목이 동시에 보인다
  const r = gun.state.recoil;
  camPos.x += (Math.random() - 0.5) * r * 0.12; camPos.y += (Math.random() - 0.5) * r * 0.1;
  camera.position.lerp(camPos, Math.min(1, dt * 9));
  tmpV.set(-Math.sin(gun.state.yaw), Math.sin(gun.state.pitch) * 0.9 - 0.02, -Math.cos(gun.state.yaw)).multiplyScalar(44).add(playerPos).add(new THREE.Vector3(0, -1.2, 0));
  camTarget.lerp(tmpV, Math.min(1, dt * 12));
  camera.lookAt(camTarget);
  camera.rotation.z += (Math.random() - 0.5) * r * 0.01;
}

const fpsEl = $('fps'), killsEl = $('kills'), heatFill = $('heatFill'), hpFill = $('hpFill');
let frames = 0, acc = 0, last = performance.now();
window.__kb = { renderer, scene, camera, world, look, horde, gun, physics, game, fps: 0 };

renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const started = game.started && !game.over;
  if (started) game.time += dt;
  const time = game.time;

  // 좀비 도달 → 체력
  const reachedBefore = game.lastReached;
  if (started && game.demo) {
    // 자동 데모: 좀비떼를 좌우로 쓸다가 가끔 집을 향해 갈긴다 (클립 녹화용)
    gun.state.firing = true;
    const phase = (time % 16);
    if (phase < 11) {
      // 가장 가까운 좀비 무리의 몸통을 겨눈 채 좌우로 훑는다
      let best = -1, bestD = 1e9;
      for (let i = 0; i < horde.N; i++) { if (!horde.alive[i]) continue; const d = Math.hypot(horde.px[i] - playerPos.x, horde.pz[i] - playerPos.z); if (d > 4 && d < bestD) { bestD = d; best = i; } }
      if (best >= 0) {
        const dx = horde.px[best] - playerPos.x, dz = horde.pz[best] - playerPos.z;
        const ty = Math.atan2(-dx, -dz) + Math.sin(time * 2.1) * 0.06;
        const tp = Math.atan2(1.1 - (playerPos.y + 1.6), bestD);
        gun.state.yaw += (THREE.MathUtils.clamp(ty, -1, 1) - gun.state.yaw) * Math.min(1, dt * 5);
        gun.state.pitch += (tp - gun.state.pitch) * Math.min(1, dt * 5);
      }
    } else {
      const ty = phase < 13.5 ? 0.245 : -0.24;
      gun.state.yaw += (ty - gun.state.yaw) * Math.min(1, dt * 4); gun.state.pitch += (0.01 - gun.state.pitch) * Math.min(1, dt * 4);
    }
  }
  if (started) {
    horde.update(dt, time);
    // 포대 공격 피해는 풀에 쌓아 초당 9 까지만 빠진다 — 떼가 한꺼번에 붙어도 최소 11초는 버티며 쏴 낼 수 있다
    if (horde.stats.reached > reachedBefore) { game.pendingDamage += horde.stats.reachDamage; horde.stats.reachDamage = 0; look.state.flash = Math.max(look.state.flash, 0.1); game.lastReached = horde.stats.reached; }
    if (game.pendingDamage > 0) { const d = Math.min(game.pendingDamage, 9 * dt); game.pendingDamage -= d; if (!game.god) game.hp -= d; }
    gun.update(dt, time);
    physics.step(dt, time);
    fx.shards.update(dt, time); fx.blood.update(dt, time); fx.decals.update(time);
    audio.setGroan(Math.min(1, horde.stats.alive / 200) * 0.3);
  } else {
    horde.update(0, time);           // 정지 포즈 유지(타이틀 뒤 배경)
    gun.state.firing = false;
    gun.update(dt, time);
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

  // 새벽
  if (started && time > game.dawnAt) { look.state.darkness = Math.max(-0.6, look.state.darkness - dt * 0.05); }
  if (started && time > game.dawnAt + 12) endGame(true);
  if (started && game.hp <= 0) endGame(false);

  renderer.info.reset();
  look.render(now / 1000);

  frames++; acc += dt;
  if (acc >= 0.5) {
    window.__kb.fps = frames / acc;
    if (q.has('stats')) fpsEl.textContent = `${(frames / acc).toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tri · z${horde.stats.alive}`;
    frames = 0; acc = 0;
  }
  killsEl.innerHTML = `${horde.stats.kills}<small>처치</small>`;
  heatFill.style.width = `${(gun.state.heat * 100).toFixed(0)}%`;
  heatFill.style.filter = gun.state.jammed > 0 ? 'brightness(2)' : '';
  hpFill.style.width = `${Math.max(0, game.hp)}%`;
});

function endGame(win) {
  if (game.over) return;
  game.over = true;
  const end = $('end');
  end.innerHTML = win
    ? `<div class="big">새벽이 왔다</div><div class="sub">처치 ${horde.stats.kills} · 화면을 눌러 다시 밤으로</div>`
    : `<div class="big">밤을 넘기지 못했다</div><div class="sub">처치 ${horde.stats.kills} · 화면을 눌러 다시</div>`;
  end.style.opacity = 1; end.style.pointerEvents = 'auto';
  end.addEventListener('pointerdown', () => location.reload(), { once: true });
}
