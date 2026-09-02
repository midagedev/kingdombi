// 보스 둘: 절 문의 巨人(7배 좀비, 쇠판 갑주) · 궁궐의 恐龍(좀비 티라노사우루스). 오락실 문법 — 약점(코어)만 스팟컬러로 빛난다.
// 몸은 잉크 실루엣(어두운 표준 재질, 깊이 윤곽선이 형태를 그린다). 쇠판은 부위 체력이 있고 떨어지면 물리 파편이 된다.
// QTE: 恐龍이 던지는 기와 덩어리에 조준선이 뜬다 — 떨어지기 전에 격추하면 점수, 놓치면 장갑 피해.
import * as THREE from 'three';
import { LAYER_SPOT } from './look.js';

const INK = () => new THREE.MeshStandardMaterial({ color: 0x33343a, roughness: 0.8 });   // 순흑이면 궁궐 배경과 한 덩어리 — 회색 잉크로 실루엣이 선다
const PLATE = () => { const m = new THREE.MeshStandardMaterial({ color: 0x8a8c94, metalness: 0.6, roughness: 0.4, emissive: 0x404448 }); m.userData.lift = 0.26; return m; };   // 잉크 커브에 눌리지 않게 기저 발광 — 쇠판은 '쏠 곳'으로 읽혀야 한다
const VIOLET = 0xb04cff;
const _ray = new THREE.Ray(), _hit = new THREE.Vector3(), _w = new THREE.Vector3();

function boxMesh(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m; }
function glowMesh(geo) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: VIOLET })); m.layers.set(LAYER_SPOT); return m; }

export function createBosses(scene, physics, { fx, audio, look, juice, horde, gun, vehicle, game, hud, camera, onScore, onDamage, onDeath }) {
  let boss = null;                 // 현재 보스
  const qtes = [];                 // 날아오는 기와 덩어리
  const reticle = document.createElement('div'); reticle.id = 'qte'; reticle.hidden = true; hud.appendChild(reticle);
  const bar = document.createElement('div'); bar.id = 'boss'; bar.innerHTML = '<span id="bossName"></span><div><i id="bossChip"></i><i id="bossFill"></i></div>'; bar.hidden = true; hud.appendChild(bar);
  const style = document.createElement('style'); style.textContent = `
    #boss { position:absolute; left:50%; top: calc(max(env(safe-area-inset-top), 14px) + 4px); transform:translateX(-50%); width: 46%; text-align:center; }
    #boss span { display:block; font: 300 10px/1 var(--serif); letter-spacing:.5em; opacity:.75; margin-bottom:7px; }
    #boss div { height:1px; background: rgba(233,230,223,.18); position:relative; }
    #boss i { position:absolute; left:0; top:-0.5px; height:2px; background: var(--red); width:100%; }
    #boss i#bossChip { background: rgba(233,230,223,.85); height:2px; }
    #qte { position:absolute; width:54px; height:54px; margin:-27px 0 0 -27px; border:1px solid var(--red); border-radius:50%; pointer-events:none; animation: qte .5s ease-in-out infinite alternate; }
    #qte::after { content:''; position:absolute; inset:12px; border:1px solid rgba(193,18,31,.5); border-radius:50%; }
    @keyframes qte { from { transform: scale(1); opacity:.9; } to { transform: scale(1.18); opacity:.55; } }
  `; document.head.appendChild(style);
  const bossName = bar.querySelector('#bossName'), bossFill = bar.querySelector('#bossFill'), bossChip = bar.querySelector('#bossChip');
  let chip = 1;

  // ── 공통 뼈대: 부위 목록·피격·약점 ──
  function makeBase(name, hpMax, root) {
    const b = { name, hp: hpMax, hpMax, root, parts: [], alive: true, dying: 0, mats: new Set(), flash: 0, flinch: 0, stagger: 0, t: 0, state: 'enter', stateT: 0 };
    b.addPart = (mesh, kind, hp = 0) => { const p = { mesh, kind, hp, box: new THREE.Box3(), destroyed: false }; b.parts.push(p); if (mesh.material?.emissive) b.mats.add(mesh.material); return p; };
    b.platesLeft = (kind = 'plate') => b.parts.filter((p) => p.kind === kind && !p.destroyed).length;
    b.updateBoxes = () => { for (const p of b.parts) if (!p.destroyed) p.box.setFromObject(p.mesh); };
    // 부위 판정은 AABB 라 회전한 몸통 상자가 쇠판 상자를 감싸 먼저 맞는다 → 약점(쇠판·코어) 상자에 닿았으면 그쪽을 우선한다(플레이어에게 유리한 관대함 = 오락실 감각)
    b.raycast = (ray, maxT) => {
      let best = null, bt = maxT, weak = null, wt = maxT;
      for (const p of b.parts) {
        if (p.destroyed) continue; const r = ray.intersectBox(p.box, _hit); if (!r) continue; const t = r.distanceTo(ray.origin); if (t >= maxT) continue;
        if (p.kind !== 'body') { if (t < wt) { wt = t; weak = p; } } else if (t < bt) { bt = t; best = p; }
      }
      if (weak) return { t: wt, part: weak };
      return best ? { t: bt, part: best } : null;
    };
    b.hit = (p, dmg, x, y, z, dirX, dirZ, time) => {
      if (!b.alive) return;
      b.flash = 1; b.flinch = Math.min(1, b.flinch + 0.35);
      fx.blood.burst(x, y, z, 3, { dirX: dirX * 0.5, dirY: 0.4, dirZ: dirZ * 0.5, spread: 0.8, power: 5, scale: 1, time });
      if (p.kind === 'plate' || p.kind === 'skull') {   // 머리 투구도 쇠판이다
        p.hp -= dmg; fx.shards.burst(x, y, z, 2, { dirX: -dirX * 0.4, dirY: 0.5, dirZ: -dirZ * 0.4, spread: 0.6, power: 3, scale: 0.7, time }); audio.hitStone();
        if (p.hp <= 0) { p.destroyed = true; physics.spawnChunk(p.mesh, { x: dirX * 900, y: 500, z: dirZ * 900 }, time); onScore(500, '鐵'); audio.collapse(0.5); look.state.flash = Math.max(look.state.flash, 0.25); game.hitstop = Math.max(game.hitstop, 0.14); game.shake = Math.max(game.shake, 0.7); b.stagger = 0.8; juice.stamp('鐵'); b.onPlateLost?.(); }
        b.hp -= dmg * 0.15;
      } else if (p.kind === 'core') {
        const exposed = b.coreExposed();
        b.hp -= dmg * (exposed ? 1.25 : 0.3);
        if (exposed) { fx.blood.burst(x, y, z, 6, { dirX: dirX * 0.3, dirY: 0.6, dirZ: dirZ * 0.3, spread: 1.2, power: 8, scale: 1.3, time }); audio.hitFlesh(); b.flinch = 1; }
      } else b.hp -= dmg * 0.12;   // 몸통은 거의 안 먹는다 — 쇠판을 벗기고 코어를 쏘라는 문법
      if (b.hp <= 0) die(b, time);
    };
    return b;
  }
  function die(b, time) {
    b.alive = false; b.dying = 1.6; bar.hidden = true;
    game.hitstop = 1.1; look.state.invert = 1; juice.stamp('滅'); audio.collapse(1.6); audio.roar?.(0.5);
    const p = b.root.position;
    fx.blood.burst(p.x, 5, p.z, 80, { dirY: 0.9, spread: 1.8, power: 14, scale: 1.6, time }); fx.gibs.burst(p.x, 4, p.z, 60, { dirY: 0.8, spread: 1.8, power: 12, scale: 1.5, time }); fx.decals.add(p.x, p.z, 9, time);
    for (const q of b.parts) if (q.kind === 'plate' && !q.destroyed) { q.destroyed = true; physics.spawnChunk(q.mesh, { x: (Math.random() - 0.5) * 800, y: 700, z: (Math.random() - 0.5) * 800 }, time); }
    onDeath(b, time);
  }

  // ── 巨人: 7배 좀비. 쇠판 6장(가슴 2·어깨 2·허벅지 2). 코어는 가슴 — 쇠판이 2장 이하로 남으면 노출 ──
  function spawnGiant(x, z, time) {
    const S = 7;
    const root = new THREE.Group(); root.position.set(x, 0, z); scene.add(root);
    const ink = INK(), plate = PLATE();
    const P = (w, h, d, px, py, pz, parent, m = ink) => { const b = boxMesh(w * S, h * S, d * S, m); b.position.set(px * S, py * S, pz * S); parent.add(b); return b; };
    const pelvis = new THREE.Group(); pelvis.position.y = 0.98 * S; root.add(pelvis);
    P(0.34, 0.22, 0.22, 0, 0, 0, pelvis);
    const torso = new THREE.Group(); torso.position.y = 0.07 * S; pelvis.add(torso);
    P(0.40, 0.50, 0.24, 0, 0.27, 0, torso);
    const head = new THREE.Group(); head.position.y = 0.55 * S; torso.add(head);
    P(0.22, 0.26, 0.24, 0, 0.14, 0.02, head);
    for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04 * S, 0.3 * S, 5), ink); horn.position.set(sx * 0.09 * S, 0.32 * S, 0); horn.rotation.z = -sx * 0.5; horn.castShadow = true; head.add(horn); }
    const eyes = glowMesh(new THREE.SphereGeometry(0.035 * S, 8, 6)); eyes.position.set(-0.055 * S, 0.17 * S, 0.13 * S); head.add(eyes);
    const eye2 = eyes.clone(); eye2.position.x = 0.055 * S; head.add(eye2);
    const shoulders = [], hips = [], knees = [], elbows = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 0.29 * S, 0.5 * S, 0); torso.add(sh); shoulders.push(sh);
      P(0.11, 0.32, 0.11, 0, -0.16, 0, sh);
      const el = new THREE.Group(); el.position.y = -0.32 * S; sh.add(el); elbows.push(el);
      P(0.10, 0.34, 0.10, 0, -0.17, 0, el);
      for (let k = -1; k <= 1; k++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03 * S, 0.16 * S, 4), ink); claw.rotation.x = Math.PI; claw.position.set(k * 0.03 * S, -0.4 * S, 0.02 * S); el.add(claw); }
      const hip = new THREE.Group(); hip.position.set(sx * 0.12 * S, -0.08 * S, 0); pelvis.add(hip); hips.push(hip);
      P(0.15, 0.46, 0.15, 0, -0.23, 0, hip);
      const kn = new THREE.Group(); kn.position.y = -0.46 * S; hip.add(kn); knees.push(kn);
      P(0.13, 0.46, 0.13, 0, -0.23, 0, kn);
    }
    const b = makeBase('절 문의 巨人', 1300, root);
    // 몸 부위(약한 피해)
    torso.traverse((m) => { if (m.isMesh && m.material === ink) b.addPart(m, 'body'); });
    // 쇠판
    const plates = [
      P(0.2, 0.24, 0.05, -0.1, 0.32, 0.15, torso, plate), P(0.2, 0.24, 0.05, 0.1, 0.32, 0.15, torso, plate),
      P(0.16, 0.08, 0.16, 0, 0.02, 0, shoulders[0], plate), P(0.16, 0.08, 0.16, 0, 0.02, 0, shoulders[1], plate),
      P(0.18, 0.28, 0.06, 0, -0.22, 0.1, hips[0], plate), P(0.18, 0.28, 0.06, 0, -0.22, 0.1, hips[1], plate),
    ];
    for (const p of plates) b.addPart(p, 'plate', 60);
    // 코어(가슴)
    const coreDark = new THREE.Mesh(new THREE.OctahedronGeometry(0.11 * S, 0), ink); coreDark.position.set(0, 0.28 * S, 0.13 * S); torso.add(coreDark);
    const core = glowMesh(new THREE.OctahedronGeometry(0.1 * S, 0)); core.position.copy(coreDark.position); torso.add(core);
    b.addPart(coreDark, 'core');
    b.coreExposed = () => b.platesLeft() <= 2;
    b.coreGlow = core.material; b.aimCore = coreDark;
    b.onPlateLost = () => { if (b.coreExposed()) juice.banner('가슴이 열렸다', 1800); };
    b.stopDist = 17; b.speed = 2.4; b.score = 15000;
    b.tick = (dt, time) => {
      const vp = vehicle.pos; const dz = vp.z - root.position.z;
      const dist = Math.abs(dz);
      root.rotation.y = Math.atan2(vp.x - root.position.x, dz);
      b.stateT += dt;
      const walking = b.state === 'walk';
      if (b.state === 'enter') { b.state = 'walk'; audio.stomp?.(); game.shake = 1.4; horde.crushNear(root.position.x, root.position.z, 14, time); }   // 등장: 발을 내리찍어 주변 떼가 날아간다
      if (b.state === 'walk') {
        if (dist > b.stopDist) { root.position.z += Math.sign(dz) * b.speed * dt; root.position.x += (vp.x - root.position.x) * dt * 0.3; }
        else { b.state = 'wind'; b.stateT = 0; }
        // 걸음: 발이 땅에 닿는 순간 발밑 좀비가 튄다
        const stepPhase = Math.sin(b.t * 1.7); if (b.lastStep === undefined) b.lastStep = stepPhase;
        if ((b.lastStep < 0) !== (stepPhase < 0)) { const side = stepPhase < 0 ? -1 : 1; const fx0 = root.position.x + Math.cos(root.rotation.y) * side * 0.12 * S, fz0 = root.position.z - Math.sin(root.rotation.y) * side * 0.12 * S; if (horde.crushNear(fx0, fz0, 3.2, time)) { audio.stomp?.(); game.shake = Math.max(game.shake, 0.35); } }
        b.lastStep = stepPhase;
      } else if (b.state === 'wind') {
        if (b.stateT > 0.9) { b.state = 'slam'; b.stateT = 0; audio.stomp?.(); look.state.flash = Math.max(look.state.flash, 0.35); game.shake = 1.2; onDamage(14); horde.crushNear(root.position.x, root.position.z - 6, 7, time); }
      } else if (b.state === 'slam') { if (b.stateT > 0.5) { b.state = 'rest'; b.stateT = 0; } }
      else if (b.state === 'rest') { if (b.stateT > 1.6) { b.state = dist > b.stopDist + 3 ? 'walk' : 'wind'; b.stateT = 0; } }
      // 걷기 애니메이션
      const w = b.t * 1.7;
      const amp = walking ? 1 : 0.15;
      pelvis.position.y = 0.98 * S + Math.abs(Math.sin(w)) * 0.05 * S * amp;
      torso.rotation.x = 0.45 + Math.sin(w * 2) * 0.05 * amp;
      head.rotation.z = Math.sin(b.t * 1.1) * 0.35; head.rotation.x = 0.3;
      hips[0].rotation.x = Math.sin(w) * 0.8 * amp + 0.2; hips[1].rotation.x = Math.sin(w + Math.PI) * 0.8 * amp + 0.2;
      knees[0].rotation.x = Math.max(0, -Math.sin(w)) * 1.2 * amp; knees[1].rotation.x = Math.max(0, -Math.sin(w + Math.PI)) * 1.2 * amp;
      shoulders[0].rotation.x = -1.2 + Math.sin(w + Math.PI) * 0.5 * amp; shoulders[0].rotation.z = -0.4;
      elbows[0].rotation.x = -0.9;
      // 오른팔: 내려치기
      if (b.state === 'wind') { const k = Math.min(1, b.stateT / 0.9); shoulders[1].rotation.x = -1.2 - k * 1.6; elbows[1].rotation.x = -0.3; }
      else if (b.state === 'slam') { const k = Math.min(1, b.stateT / 0.18); shoulders[1].rotation.x = -2.8 + k * 3.4; elbows[1].rotation.x = -0.2; }
      else { shoulders[1].rotation.x += (-1.2 + Math.sin(w) * 0.5 * amp - shoulders[1].rotation.x) * Math.min(1, dt * 4); elbows[1].rotation.x = -0.9; }
      shoulders[1].rotation.z = 0.4;
    };
    b.staggerPose = (k) => { torso.rotation.x = 0.45 - k * 0.55; head.rotation.x = 0.3 - k * 0.5; };
    b.death = (dt) => { root.rotation.x = Math.min(Math.PI / 2, root.rotation.x + dt * 1.6); pelvis.position.y = Math.max(0.6 * S, pelvis.position.y - dt * 2); };
    return b;
  }

  // ── 恐龍: 좀비 티라노사우루스. 옆구리 쇠판 4·머리 쇠판 2. 코어는 목 아래 심장 — 머리 쇠판이 다 떨어지면 노출 ──
  function spawnRex(x, z, time) {
    const root = new THREE.Group(); root.position.set(x, 0, z); scene.add(root);
    const ink = INK(), plate = PLATE();
    const P = (w, h, d, px, py, pz, parent, m = ink) => { const b = boxMesh(w, h, d, m); b.position.set(px, py, pz); parent.add(b); return b; };
    const hips = new THREE.Group(); hips.position.y = 4.6; root.add(hips);
    const body = P(3.0, 3.2, 6.4, 0, 0.2, 0.4, hips); body.rotation.x = -0.12;
    const neck = new THREE.Group(); neck.position.set(0, 1.2, -3.0); hips.add(neck); neck.rotation.x = 0.55;
    P(1.7, 1.7, 2.6, 0, 0.5, -1.1, neck);
    const headG = new THREE.Group(); headG.position.set(0, 1.0, -2.3); neck.add(headG); headG.rotation.x = -0.75;
    const skull = P(2.0, 1.5, 3.2, 0, 0.35, -1.4, headG);
    const jaw = new THREE.Group(); jaw.position.set(0, -0.3, -0.3); headG.add(jaw);
    P(1.7, 0.55, 2.7, 0, -0.25, -1.3, jaw);
    for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 4), ink); tooth.rotation.x = Math.PI; tooth.position.set(sx * 0.78, -0.4, -0.3 - i * 0.38); headG.add(tooth);
      const tooth2 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 4), ink); tooth2.position.set(sx * 0.7, 0.05, -0.4 - i * 0.36); jaw.add(tooth2);
    }
    for (const sx of [-1, 1]) { const eye = glowMesh(new THREE.SphereGeometry(0.2, 8, 6)); eye.position.set(sx * 0.85, 0.7, -1.2); headG.add(eye); }
    // 꼬리 6마디
    const tail = []; let par = hips; let tp = new THREE.Vector3(0, 0.3, 3.4);
    for (let i = 0; i < 6; i++) { const g = new THREE.Group(); g.position.copy(tp); par.add(g); const s = 1 - i * 0.13; P(1.3 * s, 1.2 * s, 1.9, 0, 0, 0.95, g); tail.push(g); par = g; tp = new THREE.Vector3(0, 0, 1.9); }
    // 다리
    const legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 1.45, -0.7, 0.9); hips.add(hip);
      P(1.1, 2.6, 1.6, 0, -1.2, 0.1, hip);
      const knee = new THREE.Group(); knee.position.set(0, -2.4, 0.2); hip.add(knee); knee.rotation.x = 0.5;
      P(0.75, 2.2, 0.9, 0, -1.0, -0.2, knee);
      const foot = new THREE.Group(); foot.position.set(0, -2.1, -0.3); knee.add(foot); foot.rotation.x = -0.5;
      P(1.1, 0.5, 2.2, 0, -0.25, -0.6, foot);
      for (let k = -1; k <= 1; k++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 4), ink); claw.rotation.x = -Math.PI / 2; claw.position.set(k * 0.38, -0.3, -1.9); foot.add(claw); }
      legs.push({ hip, knee, foot });
      const arm = P(0.3, 1.1, 0.3, sx * 1.3, -0.6, -2.6, hips); arm.rotation.x = -0.6;
    }
    const b = makeBase('궁궐의 恐龍', 2400, root);
    for (const m of [body, skull]) b.addPart(m, 'body');
    // 쇠판은 마차에서 보이는 면에: 가슴 정면 2 + 허벅지 정면 2(옆구리는 정면에서 몸통이 가려 못 맞힌다)
    const plates = [
      P(1.2, 1.4, 0.3, -0.75, 0.0, -3.05, hips, plate), P(1.2, 1.4, 0.3, 0.75, 0.0, -3.05, hips, plate),
      P(1.0, 1.6, 0.3, 0, -1.2, -0.85, legs[0].hip, plate), P(1.0, 1.6, 0.3, 0, -1.2, -0.85, legs[1].hip, plate),
    ];
    for (const p of plates) b.addPart(p, 'plate', 70);
    // 머리 쇠판: 투구처럼 두껍게(얇으면 30m 에서 총알 산포에 다 빗나간다)
    const skullPlates = [P(0.9, 0.9, 2.6, -0.6, 1.5, -1.4, headG, plate), P(0.9, 0.9, 2.6, 0.6, 1.5, -1.4, headG, plate)];   // 투구 볏: 두개골 위로 솟아 아래서도 맞는다
    for (const p of skullPlates) b.addPart(p, 'skull', 90);
    const coreDark = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), ink); coreDark.position.set(0, -0.3, -3.35); hips.add(coreDark);
    const core = glowMesh(new THREE.OctahedronGeometry(0.68, 0)); core.position.copy(coreDark.position); hips.add(core);
    b.addPart(coreDark, 'core');
    b.coreExposed = () => b.platesLeft('skull') === 0;
    b.coreGlow = core.material; b.aimCore = coreDark;
    b.onPlateLost = () => { if (b.coreExposed()) juice.banner('심장이 드러났다', 2000); };
    b.score = 50000; b.holdDist = 20; b.minZ = z + 22;   // 궁궐 정문(-475) 앞에 서야 총알이 문루에 먹히지 않는다 — 스폰점보다 22m 앞(≈-468)까지만 물러난다
    b.tick = (dt, time) => {
      const vp = vehicle.pos; const dz = vp.z - root.position.z; const dist = Math.abs(dz);
      const face = Math.atan2(vp.x - root.position.x, dz) + Math.PI;   // 모델은 -z 를 본다
      const wantYaw = face + (b.state === 'charge' || b.state === 'bite' ? 0 : 0.7);   // 대기·후퇴엔 3/4 측면 — 긴 몸·꼬리가 읽힌다
      let dy = wantYaw - root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); root.rotation.y += dy * Math.min(1, dt * 3);
      b.stateT += dt;
      const phase = b.hp < b.hpMax * 0.35 ? 3 : b.hp < b.hpMax * 0.7 ? 2 : 1;
      let moving = 0;
      if (b.state === 'enter') { if (b.stateT < 1.4) { if (b.stateT < dt) { audio.roar?.(1); look.state.flash = Math.max(look.state.flash, 0.5); game.shake = 1.5; horde.crushNear(root.position.x, root.position.z, 16, time); } } else { b.state = 'hold'; b.stateT = 0; } }   // 등장 포효: 반경 16m 떼가 날아간다
      else if (b.state === 'hold') {
        if (dist > b.holdDist + 2 || root.position.z < b.minZ) { root.position.z += Math.sign(dz) * 4 * dt; moving = 1; }
        // 먹기: 대기 1초 뒤 머리 근처 좀비 하나를 물어 올린다(시체가 턱에서 떨어진다)
        if (b.stateT > 1.0 && !b.ate) { b.ate = true; headG.getWorldPosition(_w); let best = -1, bd = 81; for (let i = 0; i < horde.N; i++) { if (!horde.alive[i]) continue; const dx = horde.px[i] - _w.x, dz2 = horde.pz[i] - _w.z, d2 = dx * dx + dz2 * dz2; if (d2 < bd) { bd = d2; best = i; } } if (best >= 0) { horde.kill(best, 0, 0, time, 2); fx.blood.burst(_w.x, _w.y - 0.8, _w.z, 26, { dirY: 0.2, spread: 1.0, power: 6, scale: 1.3, time }); fx.gibs.burst(_w.x, _w.y - 0.8, _w.z, 14, { dirY: 0.1, spread: 0.9, power: 5, scale: 1.2, time }); audio.hitFlesh(); b.eatT = b.t; } }
        if (b.stateT > (phase === 1 ? 3.2 : 2.2)) { b.state = phase >= 2 && Math.random() < 0.55 ? 'stomp' : 'charge'; b.stateT = 0; b.ate = false; if (b.state === 'stomp') audio.roar?.(0.7); }
      } else if (b.state === 'charge') {
        if (dist > 11) { root.position.z += Math.sign(dz) * 10 * dt; root.position.x += (vp.x - root.position.x) * dt * 0.6; moving = 2; headG.getWorldPosition(_w); if (horde.crushNear(_w.x, _w.z, 4.5, time)) fx.blood.burst(_w.x, _w.y - 1, _w.z, 8, { dirY: 0.6, spread: 1.2, power: 7, scale: 1.1, time }); }   // 돌진: 앞을 막은 떼를 머리로 쓸어 날린다
        else { b.state = 'bite'; b.stateT = 0; }
      } else if (b.state === 'bite') {
        if (b.stateT > 0.42 && !b.bit) { b.bit = true; onDamage(22); look.state.flash = Math.max(look.state.flash, 0.45); game.shake = 1.6; audio.collapse(0.7); fx.blood.burst(vp.x, 3, vp.z - 2, 20, { dirY: 0.7, spread: 1.4, power: 8, scale: 1.2, time }); }
        if (b.stateT > 1.0) { b.state = 'retreat'; b.stateT = 0; b.bit = false; }
      } else if (b.state === 'retreat') {
        if (dist < b.holdDist && root.position.z - Math.sign(dz) * 6 * dt >= b.minZ) { root.position.z -= Math.sign(dz) * 6 * dt; moving = 1; } else { b.state = 'hold'; b.stateT = 0; }
      } else if (b.state === 'stomp') {
        if (b.stateT > 0.7 && !b.threw) { b.threw = true; game.shake = 1.0; audio.stomp?.(); const n = phase === 3 ? 2 : 1; for (let k = 0; k < n; k++) throwChunk(root, k, time); }
        if (b.stateT > 1.6) { b.state = 'hold'; b.stateT = 0; b.threw = false; }
      }
      // 애니메이션: 걷기(다리 교차·꼬리 흔들림·몸 상하), 물기(턱)
      const w = b.t * (moving === 2 ? 4.2 : 2.4), amp = moving ? 1 : 0.12;
      hips.position.y = 4.6 + Math.abs(Math.sin(w)) * 0.18 * amp;
      legs[0].hip.rotation.x = Math.sin(w) * 0.6 * amp; legs[1].hip.rotation.x = Math.sin(w + Math.PI) * 0.6 * amp;
      legs[0].knee.rotation.x = 0.5 + Math.max(0, -Math.sin(w)) * 0.8 * amp; legs[1].knee.rotation.x = 0.5 + Math.max(0, -Math.sin(w + Math.PI)) * 0.8 * amp;
      for (let i = 0; i < tail.length; i++) tail[i].rotation.y = Math.sin(b.t * 2.1 - i * 0.6) * 0.16 + Math.sin(b.t * 0.7) * 0.05;
      const eat = b.eatT !== undefined ? Math.max(0, 1 - (b.t - b.eatT) / 0.7) : 0;
      const jawOpen = b.state === 'bite' ? (b.stateT < 0.42 ? b.stateT / 0.42 : Math.max(0, 1 - (b.stateT - 0.42) / 0.4)) : (b.state === 'enter' || b.state === 'stomp' ? 0.6 : Math.max(eat * Math.sin(eat * 3.14), 0.1 + 0.05 * Math.sin(b.t * 3)));
      jaw.rotation.x = jawOpen * 0.75;
      neck.rotation.x = 0.55 + (b.state === 'bite' ? -0.45 * jawOpen : 0) + Math.sin(b.t * 1.3) * 0.04;
      headG.rotation.z = Math.sin(b.t * 0.9) * 0.08;
    };
    b.staggerPose = (k) => { neck.rotation.x = 0.55 + k * 0.5; hips.position.y = 4.6 - k * 0.35; jaw.rotation.x = 0.6 * k; };
    b.death = (dt) => { root.rotation.x = Math.min(1.2, root.rotation.x + dt * 1.1); hips.position.y = Math.max(2.2, hips.position.y - dt * 2.4); jaw.rotation.x = 0.9; };
    return b;
  }

  // ── QTE: 기와 덩어리 투척 ──
  const chunkMat = new THREE.MeshStandardMaterial({ color: 0x3b3a38, roughness: 0.95 });
  function throwChunk(from, k, time) {
    const { RAPIER, world } = physics; const vp = vehicle.pos;
    const sx = from.position.x + (k ? 2.5 : -2.5), sy = 6.5, sz = from.position.z;
    const tx = vp.x + (Math.random() - 0.5) * 2.5, ty = 2.2, tz = vp.z + (Math.random() - 0.5) * 2;
    const T = 1.9 + k * 0.35, g = 16;
    const vel = { x: (tx - sx) / T, y: (ty - sy + 0.5 * g * T * T) / T, z: (tz - sz) / T };
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(sx, sy, sz).setLinvel(vel.x, vel.y, vel.z).setAngvel({ x: 2, y: 1.5, z: 3 }).setCcdEnabled(true));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.8, 0.55, 0.8).setDensity(300), body);
    const mesh = boxMesh(1.6, 1.1, 1.6, chunkMat); scene.add(mesh);
    qtes.push({ body, mesh, hp: 4, born: time, landed: false });
    juice.banner('격추하라', 1200);
  }
  function onBodyHit(body, x, y, z, time) {
    const q = qtes.find((q) => q.body.handle === body.handle); if (!q) return false;
    q.hp -= 1; fx.shards.burst(x, y, z, 6, { dirY: 0.5, spread: 1.2, power: 5, scale: 1, time }); audio.hitStone();
    if (q.hp <= 0) { fx.shards.burst(x, y, z, 40, { dirY: 0.8, spread: 1.6, power: 9, scale: 1.3, time }); look.state.flash = Math.max(look.state.flash, 0.3); onScore(2500, '破'); audio.collapse(0.6); removeQte(q); }
    return true;
  }
  function removeQte(q) { physics.world.removeRigidBody(q.body); q.mesh.removeFromParent(); qtes.splice(qtes.indexOf(q), 1); }
  const _proj = new THREE.Vector3();
  function updateQtes(dt, time) {
    let shown = false;
    for (const q of [...qtes]) {
      const t = q.body.translation(), r = q.body.rotation();
      q.mesh.position.set(t.x, t.y, t.z); q.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      const vp = vehicle.pos; const d = Math.hypot(t.x - vp.x, t.z - vp.z);
      if (!q.landed && t.y < 0.9 && d >= 4.5) q.landed = true;   // 빗나가 땅에 떨어진 덩어리 — 더는 표적이 아니다
      if (!q.landed && (t.y < 2.6 && d < 4.5)) { q.landed = true; onDamage(18); look.state.flash = Math.max(look.state.flash, 0.5); game.shake = 1.8; audio.collapse(0.9); fx.shards.burst(t.x, t.y, t.z, 30, { dirY: 0.7, spread: 1.5, power: 7, scale: 1.2, time }); removeQte(q); continue; }
      if (time - q.born > 6 || t.y < -2) { removeQte(q); continue; }
      if (!shown && !q.landed && time - q.born < 3.2) {
        _proj.set(t.x, t.y, t.z).project(camera);
        if (_proj.z < 1) { reticle.hidden = false; reticle.style.left = `${(_proj.x * 0.5 + 0.5) * innerWidth}px`; reticle.style.top = `${(-_proj.y * 0.5 + 0.5) * innerHeight}px`; shown = true; }
      }
    }
    if (!shown) reticle.hidden = true;
  }

  function spawn(kind, x, z, time) {
    boss = kind === 'giant' ? spawnGiant(x, z, time) : spawnRex(x, z, time);
    bar.hidden = false; bossName.textContent = boss.name; bossFill.style.width = '100%'; bossChip.style.width = '100%'; chip = 1;
    gun.targets.push(boss); gun.state.pitchMax = 0.62;
    juice.banner(boss.name, 3000); audio.roar?.(1);
    return boss;
  }
  function update(dt, time) {
    updateQtes(dt, time);
    if (!boss) return;
    boss.t += dt;
    if (boss.alive) {
      if (boss.stagger > 0) { boss.stagger -= dt; boss.staggerPose?.(Math.max(0, boss.stagger) / 0.8); if (boss.state === 'wind' || boss.state === 'charge') { boss.state = boss.name.includes('巨') ? 'rest' : 'hold'; boss.stateT = 0; } }
      boss.tick(dt, time); if (boss.stagger > 0) boss.staggerPose?.(Math.max(0, boss.stagger) / 0.8); boss.updateBoxes();
      // 움찔: 뿌리 회전을 잠깐 흔든다(총알이 박히는 게 몸으로 보인다)
      boss.root.rotation.z = (Math.random() - 0.5) * 0.05 * boss.flinch; boss.root.rotation.x = (Math.random() - 0.5) * 0.03 * boss.flinch;
      boss.flinch *= Math.exp(-dt * 9);
      const frac = Math.max(0, boss.hp / boss.hpMax); bossFill.style.width = `${(frac * 100).toFixed(1)}%`;
      chip += (frac - chip) * Math.min(1, dt * 1.6); if (chip < frac) chip = frac; bossChip.style.width = `${(chip * 100).toFixed(1)}%`;
      const exposed = boss.coreExposed();
      const pulse = exposed ? 1.6 + Math.sin(time * 9) * 0.9 : 0.35 + Math.sin(time * 3) * 0.1;
      boss.coreGlow.color.setHex(exposed ? 0xff3060 : VIOLET).multiplyScalar(pulse);
    } else {
      boss.death(dt); boss.dying -= dt;
      if (boss.dying <= 0) { const i = gun.targets.indexOf(boss); if (i >= 0) gun.targets.splice(i, 1); gun.state.pitchMax = 0.2; boss = null; return; }
    }
    boss.flash *= Math.exp(-dt * 18);
    for (const m of boss.mats) m.emissive.setScalar((m.userData.lift || 0) + boss.flash * 0.28);   // 온몸이 하얘지면 흰 덩어리로 읽힌다 — 은은하게
  }
  // 데모 자동조준용: 노출 코어 > 남은 쇠판 > 몸
  function aimPoint(out) {
    const q = qtes.find((q) => !q.landed && q.body.translation().y > 1.5); if (q) { const t = q.body.translation(); return out.set(t.x, t.y, t.z); }   // 공중에 있는 것만
    if (!boss || !boss.alive) return null;
    if (boss.coreExposed()) return boss.aimCore.getWorldPosition(out);
    const p = boss.parts.find((p) => (p.kind === 'skull' || p.kind === 'plate') && !p.destroyed) || boss.parts[0];
    return p.mesh.getWorldPosition(out);
  }
  return { spawn, update, onBodyHit, aimPoint, get active() { return boss; }, qtes };
}
