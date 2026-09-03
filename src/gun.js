// 개틀링 포대: 조선 화차(火車) 수레에 얹은 6열 개틀링. 조준(드래그)·발사(터치 유지)·과열·히트스캔·트레이서·총구 화염.
import * as THREE from 'three';
import { LAYER_SPOT } from './look.js';
import { MIN_PART_VOLUME } from './world.js';

const IRON = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.75, roughness: 0.42 });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x1d150d, roughness: 0.9 });
const BRASS = new THREE.MeshStandardMaterial({ color: 0x8a7a48, metalness: 0.8, roughness: 0.3 });

function cyl(r, h, mat, seg = 12) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.castShadow = true; return m; }
function box(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m; }

function makeFlashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,240,1)'); grad.addColorStop(0.25, 'rgba(255,220,150,0.9)'); grad.addColorStop(0.6, 'rgba(255,120,40,0.25)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  // 별 모양 스파이크
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) { g.save(); g.translate(64, 64); g.rotate(i * Math.PI / 3); g.fillStyle = 'rgba(255,240,200,0.5)'; g.fillRect(-2, -64, 4, 128); g.restore(); }
  const t = new THREE.CanvasTexture(c); return t;
}

export function createGun(scene, physics, horde, buildings, fx, audio, look, { parent = scene, onCollapse, camera = null }) {
  // ── 모델: 포좌(parent = 마차 mount) 위 받침 기둥 + 6열 개틀링 ──
  const root = new THREE.Group(); parent.add(root);
  const base = cyl(0.34, 0.12, IRON, 16); base.position.y = 0.06; root.add(base);
  const post = cyl(0.1, 0.9, IRON); post.position.set(0, 0.55, 0); root.add(post);

  const yawPivot = new THREE.Group(); yawPivot.position.set(0, 1.0, 0); root.add(yawPivot);
  const pitchPivot = new THREE.Group(); yawPivot.add(pitchPivot);
  // 요크
  const yoke = box(0.46, 0.08, 0.5, IRON); yoke.position.set(0, -0.02, 0); pitchPivot.add(yoke);
  // 약실 + 호퍼 + 크랭크
  const breech = cyl(0.19, 0.5, IRON, 16); breech.rotation.x = Math.PI / 2; breech.position.set(0, 0.16, 0.25); pitchPivot.add(breech);
  const hopper = box(0.26, 0.34, 0.2, BRASS); hopper.position.set(0, 0.5, 0.2); pitchPivot.add(hopper);
  const crank = new THREE.Group(); crank.position.set(0.24, 0.16, 0.45); pitchPivot.add(crank);
  const crankArm = box(0.04, 0.22, 0.04, IRON); crankArm.position.y = 0.11; crank.add(crankArm);
  const crankKnob = cyl(0.03, 0.14, WOOD); crankKnob.rotation.z = Math.PI / 2; crankKnob.position.set(0.08, 0.22, 0); crank.add(crankKnob);
  // 총열 묶음 (회전)
  const barrels = new THREE.Group(); barrels.position.set(0, 0.16, -0.1); pitchPivot.add(barrels);
  const barrelGeo = new THREE.CylinderGeometry(0.034, 0.034, 1.25, 10);
  const barrelHot = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const barrelHotMeshes = [];
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3;
    const b = new THREE.Mesh(barrelGeo, IRON); b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * 0.095, Math.sin(a) * 0.095, -0.65); b.castShadow = true; barrels.add(b);
    const h = new THREE.Mesh(barrelGeo, barrelHot); h.rotation.x = Math.PI / 2; h.position.copy(b.position); h.layers.set(LAYER_SPOT); barrels.add(h); barrelHotMeshes.push(h);
  }
  for (const z of [-0.2, -0.75, -1.2]) { const plate = cyl(0.15, 0.05, IRON, 16); plate.rotation.x = Math.PI / 2; plate.position.set(0, 0, z); barrels.add(plate); }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.16, -1.4); pitchPivot.add(muzzle);

  // 총구 화염: 스팟 레이어 스프라이트 + 세계를 비추는 포인트 라이트
  const flashTex = makeFlashTexture();
  const flashMat = new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff });
  const flash = new THREE.Sprite(flashMat); flash.scale.setScalar(0); flash.layers.set(LAYER_SPOT); muzzle.add(flash);
  const flashWorld = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); flashWorld.scale.setScalar(0); muzzle.add(flashWorld);
  const flashLight = new THREE.PointLight(0xfff0d0, 0, 42, 1.8); flashLight.position.set(0, 0.8, -6.5); pitchPivot.add(flashLight);

  // 트레이서
  const TRACERS = 40;
  // 머리(+z)는 백황색, 꼬리는 어두운 호박 — 상자 정점색으로 굽는다. 가산 합성이라 겹치면 더 밝다(레이저가 아니라 불꽃 줄기).
  const tracerGeo = new THREE.BoxGeometry(0.09, 0.09, 1);
  { const pa = tracerGeo.attributes.position, col = new Float32Array(pa.count * 3); for (let i = 0; i < pa.count; i++) { const t = pa.getZ(i) + 0.5; col[i * 3] = 0.35 + 0.65 * t; col[i * 3 + 1] = 0.12 + 0.8 * t * t; col[i * 3 + 2] = 0.02 + 0.7 * t * t * t; } tracerGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const tracer = new THREE.InstancedMesh(tracerGeo, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), TRACERS);
  tracer.layers.set(LAYER_SPOT); tracer.frustumCulled = false; tracer.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(tracer);
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < TRACERS; i++) tracer.setMatrixAt(i, z); }   // three r185 인스턴스 기본값은 항등행렬 — 미사용 슬롯이 원점에 그려진다
  const tracerBorn = new Float32Array(TRACERS).fill(-1e9); let tracerCursor = 0;
  // 예광탄은 탄띠에서 다섯 발에 하나. 레이저가 아니라 4.5m 짧은 불꽃 줄기가 320 m/s 로 날아가 목표에서 꺼진다.
  const TRACER_EVERY = 3, TRACER_SPEED = 320, TRACER_LEN = 3.6;
  const tOrg = new Float32Array(TRACERS * 3), tDir = new Float32Array(TRACERS * 3), tLen = new Float32Array(TRACERS);

  // ── 착탄 불꽃: 맞은 자리에 0.09초 번쩍(스팟 레이어, 가산). 총알이 '어디에 박혔다'가 보여야 쏘는 맛이 난다 ──
  const IMP = 32;
  const impact = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe2a8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), IMP);
  impact.layers.set(LAYER_SPOT); impact.frustumCulled = false; impact.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(impact);
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < IMP; i++) impact.setMatrixAt(i, z); }
  const impBorn = new Float32Array(IMP).fill(-1e9), impPos = new Float32Array(IMP * 3); let impCur = 0;
  function spark(x, y, z, time) { const i = impCur; impCur = (impCur + 1) % IMP; impBorn[i] = time; impPos[i * 3] = x; impPos[i * 3 + 1] = y; impPos[i * 3 + 2] = z; }
  function updateImpacts(time) {
    for (let i = 0; i < IMP; i++) {
      const age = time - impBorn[i];
      if (age > 0.09) { if (age < 0.5) { _m.makeScale(0, 0, 0); impact.setMatrixAt(i, _m); } continue; }
      const s = 0.4 + 1.8 * (1 - age / 0.09); _m.makeScale(s, s, s); _m.setPosition(impPos[i * 3], impPos[i * 3 + 1], impPos[i * 3 + 2]); impact.setMatrixAt(i, _m);
    }
    impact.instanceMatrix.needsUpdate = true;
  }

  // ── 조준점: 바닥 링(조준 광선이 닿는 자리) + 잠금 링(좀비·보스 접점). 스팟 레이어, 깊이 무시 — 떼 뒤에서도 보인다 ──
  // 조준 링·잠금 링은 뺐다(2026-09-03 3차): 광선이 좀비 몸통 1 m 안을 지나면 링이 바닥에서 몸으로 뛰며 붉어져 자동조준으로 읽혔다. 대신 2D 조준점(DOM, setReticle) — 포신 방향을 1:1 로 따르고 어디에도 붙지 않는다.
  let reticle = null; const setReticle = (el) => { reticle = el; };

  // ── 상태 ──
  const state = { yaw: 0, pitch: -0.06, facing: 0, firing: false, firingPtr: false, live: false, spin: 0, heat: 0, jammed: 0, shots: 0, hits: 0, recoil: 0, lastHit: -1e9, pitchMax: 0.2, bombs: 3, bombsMax: 3, showAim: false, pierce: 0, rateMul: 1, cur: { x: -1, y: 0 }, follow: true, heading: 0,
    aim: { x: 0, y: 0, z: 0, t: 0, block: 0, g: 40, kind: 'none' },   // 조준 광선의 첫 접점. block = 좀비 아닌 첫 차단물(건물·보스·지면)까지 거리 — 그 앞의 좀비만 '맞는다'
    stick: { active: false, x: 0, y: 0 } };                    // 가상 조이스틱 기울기(-1..1). 기울인 만큼 포신이 '돈다'(속도 제어)
  const targets = [];            // 보스 등 부위 히트 대상: { raycast(ray,maxT)→{t,part}|null, hit(part,dmg,x,y,z,dirX,dirZ,time) }
  const hooks = { onBodyHit: null, onBlast: null, onBombKey: null, onSalvo: null };
  const RATE = 42;     // 발/초
  let fireAcc = 0;

  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _mid = new THREE.Vector3(), _hit = new THREE.Vector3();
  const _ray = new THREE.Ray(), _box = new THREE.Box3();
  const rapierRay = new physics.RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });

  function spawnTracer(ox, oy, oz, hx, hy, hz, time) {
    const i = tracerCursor; tracerCursor = (tracerCursor + 1) % TRACERS;
    _d.set(hx - ox, hy - oy, hz - oz); tLen[i] = _d.length(); _d.normalize();
    tOrg[i * 3] = ox; tOrg[i * 3 + 1] = oy; tOrg[i * 3 + 2] = oz;
    tDir[i * 3] = _d.x; tDir[i * 3 + 1] = _d.y; tDir[i * 3 + 2] = _d.z;
    tracerBorn[i] = time;
  }
  const _fwd = new THREE.Vector3(0, 0, 1);
  function updateTracers(time) {
    for (let i = 0; i < TRACERS; i++) {
      if (tracerBorn[i] < -1e8) continue;
      const head = (time - tracerBorn[i]) * TRACER_SPEED, tail = Math.max(0, head - TRACER_LEN);
      if (tail >= tLen[i]) { _m.makeScale(0, 0, 0); tracer.setMatrixAt(i, _m); tracerBorn[i] = -1e9; continue; }
      const h = Math.min(head, tLen[i]), midT = (h + tail) / 2;
      _d.set(tDir[i * 3], tDir[i * 3 + 1], tDir[i * 3 + 2]);
      _mid.set(tOrg[i * 3] + _d.x * midT, tOrg[i * 3 + 1] + _d.y * midT, tOrg[i * 3 + 2] + _d.z * midT);
      _q.setFromUnitVectors(_fwd, _d); _s.set(1, 1, Math.max(0.2, h - tail));
      _m.compose(_mid, _q, _s); tracer.setMatrixAt(i, _m);
    }
    tracer.instanceMatrix.needsUpdate = true;
  }

  // 건물 히트스캔: 경계 AABB → 부위 AABB. 가장 가까운 부위 반환.
  const partHit = { b: null, part: null, t: Infinity };
  function raycastBuildings(ray, maxT) {
    partHit.b = null; partHit.part = null; partHit.t = maxT;
    for (const b of buildings) {
      if (!b.alive) continue;
      if (!ray.intersectsBox(b.bounds)) continue;
      for (const p of b.parts) {
        if (p.destroyed) continue;
        const r = ray.intersectBox(p.box, _hit);
        if (!r) continue;
        const t = r.distanceTo(ray.origin);
        if (t < partHit.t) { partHit.t = t; partHit.b = b; partHit.part = p; }
      }
    }
    return partHit.b ? partHit : null;
  }

  const collapseQueue = []; // { b, parts:[...], next }
  function destroyPart(b, p, dirX, dirZ, power, time) {
    p.destroyed = true; b.hide(p.id);
    const c = p.center;
    if (p.volume > MIN_PART_VOLUME && !p.mesh.isInstancedMesh) {
      const mass = Math.max(1, p.volume * 600);
      physics.spawnChunk(p.mesh, { x: dirX * power * mass, y: power * 0.35 * mass, z: dirZ * power * mass }, time);
    } else {
      // 기와 인스턴스 묶음·작은 부재 → 파편 소나기
      const n = p.mesh.isInstancedMesh ? Math.min(90, 12 + p.mesh.count * 0.3) : 6;
      fx.shards.burst(c.x, c.y, c.z, n, { dirX: dirX * 0.4, dirY: 0.45, dirZ: dirZ * 0.4, spread: 1.2, power: 3 + power * 0.3, scale: 1.2, time });
    }
  }
  function collapse(b, dirX, dirZ, time) {
    b.alive = false;
    if (b.staticCollider) { physics.world.removeCollider(b.staticCollider, false); b.staticCollider = null; }   // 파편·시체가 집터에 쌓일 수 있게
    const remaining = b.parts.filter((p) => !p.destroyed).sort((a, c) => c.center.y - a.center.y); // 위에서부터 무너진다
    collapseQueue.push({ b, parts: remaining, next: time, dirX, dirZ });
    audio.collapse(b.kind === 'palace' ? 1.6 : 1);
    onCollapse?.(b);
    look.state.flash = Math.max(look.state.flash, 0.12);
  }
  function pumpCollapse(time) {
    for (let k = collapseQueue.length - 1; k >= 0; k--) {
      const cq = collapseQueue[k];
      if (time < cq.next) continue;
      let n = 0;
      while (cq.parts.length && n < 5) { const p = cq.parts.shift(); destroyPart(cq.b, p, cq.dirX + (Math.random() - 0.5) * 0.8, cq.dirZ + (Math.random() - 0.5) * 0.8, 6, time); n++; }
      cq.next = time + 0.07;
      if (!cq.parts.length) collapseQueue.splice(k, 1);
    }
  }

  // 매 프레임 조준 광선(퍼짐 없음)의 첫 접점. 링·잠금 링·좀비 하이라이트(horde 유니폼)가 여기서 나온다.
  function aim(time) {
    muzzle.getWorldPosition(_o); pitchPivot.getWorldDirection(_d); _d.negate(); _ray.set(_o, _d);
    const MAX = 140; const a = state.aim;
    const zh = horde.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, MAX, 1);
    const zt = zh ? zh[0].t : Infinity;
    let block = MAX, kind = 'none';
    const bh = raycastBuildings(_ray, block); if (bh) { block = bh.t; kind = 'wall'; }
    let th = null; for (const tg of targets) { const r = tg.raycast(_ray, block); if (r && r.t < (th ? th.t : Infinity)) th = r; }
    if (th) { block = th.t; kind = 'boss'; }
    rapierRay.origin.x = _o.x; rapierRay.origin.y = _o.y; rapierRay.origin.z = _o.z; rapierRay.dir.x = _d.x; rapierRay.dir.y = _d.y; rapierRay.dir.z = _d.z;
    const ph = physics.world.castRay(rapierRay, block, true, undefined, 0xFFFFFFFD);
    if (ph && ph.timeOfImpact < block) { block = ph.timeOfImpact; kind = 'ground'; }
    let t = block;
    if (zt < block) { t = zt; kind = 'zombie'; }
    a.t = t; a.block = block; a.kind = kind;
    a.x = _o.x + _d.x * t; a.y = _o.y + _d.y * t; a.z = _o.z + _d.z * t;
    const u = horde.uniforms; if (u.uAimO) { u.uAimO.value.copy(_o); u.uAimD.value.copy(_d); u.uAimT.value = -1; }   // 광선 위 좀비 하이라이트도 끈다 — 잠금으로 읽힌다
    // 2D 조준점 = 화면 커서(state.cur) 그 자리. 포신에서 투영하지 않는다 — 투영하면 반동 떨림·카메라 흔들림·카메라 추종이 전부 조준선에 실려 "제멋대로 움직이는" 것으로 읽혔다(2026-09-03).
    if (reticle) {
      reticle.style.opacity = state.showAim ? '1' : '0';
      reticle.classList.toggle('fire', state.firing && state.spin > 0.55); reticle.classList.toggle('hit', time - state.lastHit < 0.07);
      reticle.style.transform = `translate(${state.cur.x.toFixed(1)}px, ${state.cur.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  function fireOne(time) {
    state.shots++;
    muzzle.getWorldPosition(_o);
    pitchPivot.getWorldDirection(_d); _d.negate(); // Group 의 forward 는 +z, 총구는 -z
    const spread = 0.010 + state.heat * 0.022;
    _d.x += (Math.random() - 0.5) * spread; _d.y += (Math.random() - 0.5) * spread; _d.z += (Math.random() - 0.5) * spread; _d.normalize();
    _ray.set(_o, _d);
    const MAX = 260;

    // 1) 좀비 — 관통: 가까운 순 최대 3명, 대미지 감쇠. 건물·물리에 먼저 막히면 그 앞까지만.
    const zh = horde.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, MAX, 4 + state.pierce);
    const z = zh ? zh[0] : null;
    let t = zh ? zh[zh.length - 1].t : MAX;
    // 2) 건물 부위
    const bh = raycastBuildings(_ray, t);
    if (bh) t = bh.t;
    // 2.5) 보스 부위 — 첫 좀비·건물보다 앞이면 보스가 먹는다(관통 없음)
    let th = null;
    for (const tg of targets) { const r = tg.raycast(_ray, Math.min(t, z ? z.t : Infinity)); if (r && r.t < (th ? th.t : Infinity)) { th = r; th.target = tg; } }
    if (th) t = th.t;
    // 3) 물리(지면·파편·시체)
    rapierRay.origin.x = _o.x; rapierRay.origin.y = _o.y; rapierRay.origin.z = _o.z;
    rapierRay.dir.x = _d.x; rapierRay.dir.y = _d.y; rapierRay.dir.z = _d.z;
    const ph = physics.world.castRay(rapierRay, t, true, undefined, 0xFFFFFFFD);
    if (ph && ph.timeOfImpact < t) {
      t = ph.timeOfImpact;
      const body = ph.collider.parent();
      const hx = _o.x + _d.x * t, hy = _o.y + _d.y * t, hz = _o.z + _d.z * t;
      if (body && body.isDynamic()) {
        const m = body.mass() || 1, dv = Math.min(2.2, 60 / m);   // 시체·파편: 총알 한 발 = 속도 변화 ≤2.2 m/s
        body.applyImpulseAtPoint({ x: _d.x * dv * m, y: 0.5 * dv * m, z: _d.z * dv * m }, { x: hx, y: hy, z: hz }, true);
        spark(hx, hy, hz, time);
        if (!hooks.onBodyHit?.(body, hx, hy, hz, time)) fx.blood.burst(hx, hy, hz, 3, { dirX: _d.x * 0.5, dirY: 0.5, dirZ: _d.z * 0.5, spread: 0.8, power: 5, scale: 0.8, time });
      } else {
        spark(hx, hy, hz, time);
        fx.shards.burst(hx, hy, hz, 2, { dirX: -_d.x * 0.3, dirY: 0.6, dirZ: -_d.z * 0.3, spread: 0.5, power: 2.5, scale: 0.6, time });
        if (state.shots % 3 === 0) audio.hitStone();
      }
    } else if (th) {
      state.hits++; state.lastHit = time; spark(_o.x + _d.x * t, _o.y + _d.y * t, _o.z + _d.z * t, time);
      th.target.hit(th.part, 2.6, _o.x + _d.x * t, _o.y + _d.y * t, _o.z + _d.z * t, _d.x, _d.z, time);
    } else if (bh) {
      const p = bh.part; const hx = _o.x + _d.x * t, hy = _o.y + _d.y * t, hz = _o.z + _d.z * t;
      const dmg = 5.5; spark(hx, hy, hz, time);
      p.hp -= dmg; if (bh.b.kind !== 'palace') bh.b.hp -= dmg;   // 궁궐은 빗나간 총알로 통째로 무너지지 않는다(부위만 떨어진다) — 恐龍 결말용
      fx.shards.burst(hx, hy, hz, 3, { dirX: -_d.x * 0.6, dirY: 0.5, dirZ: -_d.z * 0.6, spread: 0.8, power: 3.5, scale: 0.9, time });
      if (state.shots % 2 === 0) audio.hitStone();
      if (p.hp <= 0) destroyPart(bh.b, p, _d.x, _d.z, 7, time);
      if (bh.b.hp <= 0 && bh.b.alive) collapse(bh.b, _d.x, _d.z, time);
    } else if (z) {
      state.hits++; state.lastHit = time; spark(z.x, z.y, z.z, time);
      let dmg = 2.6;
      for (const h of zh) {
        if (h.t > t) break;
        const killed = horde.damage(h.index, dmg, _d.x, _d.z, time, 2);
        // 산만함 정리(2026-09-03): 죽지 않은 타격은 피 두 점만. 살점·바닥 얼룩은 처치 때만 — 초당 40발이 매번 뿌리면 화면이 소음이 된다
        fx.blood.burst(h.x, h.y, h.z, killed ? 10 : 2, { dirX: _d.x * 0.8, dirY: 0.25, dirZ: _d.z * 0.8, spread: 0.7, power: 5, scale: 1, time });
        if (killed) { fx.gibs.burst(h.x, h.y, h.z, 8, { dirX: _d.x * 0.6, dirY: 0.35, dirZ: _d.z * 0.6, spread: 0.9, power: 4, scale: 1, time }); fx.decals.add(h.x, h.z, 1.6 + Math.random(), time); }
        dmg *= 0.7;
      }
      audio.hitFlesh();
    }
    if (state.shots % TRACER_EVERY === 0) spawnTracer(_o.x, _o.y, _o.z, _o.x + _d.x * t, _o.y + _d.y * t, _o.z + _d.z * t, time);

    // 탄피: 약실 오른쪽으로 한 발에 하나(스팟 레이어 놋쇠 — 총이 돌아간다는 리듬이 눈에 보인다)
    if (fx.brass) { pitchPivot.getWorldQuaternion(_q); _s.set(1, 0, 0).applyQuaternion(_q); _mid.set(0.26, 0.3, 0.22); pitchPivot.localToWorld(_mid); fx.brass.burst(_mid.x, _mid.y, _mid.z, 1, { dirX: _s.x * 0.7, dirY: 0.7, dirZ: _s.z * 0.7, spread: 0.25, power: 3.2, scale: 1, time }); }
    state.heat = Math.min(1, state.heat + 0.0045);
    state.recoil = Math.min(1, state.recoil + 0.35);
    look.state.flash = Math.min(0.08, look.state.flash + 0.02);   // 화면 전체 번쩍임은 낮게 — 총구 불빛은 총구에 있어야 한다
    audio.shot();
    // 열 관리 없음(2026-09-03): 총열이 달아오르는 건 보기 좋으라고 남긴 시각 효과일 뿐, 막히지 않는다
  }

  function update(dt, time, rawDt = dt) {
    // 스핀업/다운
    const want = state.firing && state.jammed <= 0 ? 1 : 0;
    state.spin += (want - state.spin) * Math.min(1, dt * (want ? 2.6 : 1.4));
    barrels.rotation.z += state.spin * 22 * dt;
    crank.rotation.x += state.spin * 14 * dt;
    audio.setSpin(state.spin);
    // 발사
    if (state.jammed > 0) state.jammed -= dt;
    if (state.firing && state.spin > 0.55 && state.jammed <= 0) {
      fireAcc += dt * RATE * state.rateMul * state.spin;
      let n = 0;
      while (fireAcc >= 1 && n < 4) { fireAcc -= 1; fireOne(time); n++; }
    } else fireAcc = 0;
    state.heat = Math.max(0, state.heat - dt * (state.jammed > 0 ? 0.42 : 0.09));
    // 총열 과열색: 검정→진홍→주황빛
    const h = state.heat;
    barrelHot.color.setRGB(Math.pow(h, 1.6) * 1.2, Math.pow(h, 3.5) * 0.45, Math.pow(h, 6) * 0.15);
    // 화염
    const firingNow = state.firing && state.spin > 0.55 && state.jammed <= 0;
    audio.setFiring(firingNow);
    const fl = firingNow ? (0.85 + Math.random() * 0.3) : 0;   // 거리 전체가 깜빡이지 않게 진폭을 줄였다
    flash.scale.setScalar(fl * 1.8); flash.material.rotation = Math.random() * 6.3;
    flashWorld.scale.setScalar(fl * 1.1); flashWorld.material.rotation = flash.material.rotation;
    flashLight.intensity = fl * 110;
    // 반동 감쇠
    state.recoil *= Math.exp(-dt * 12);
    // 조준 = 화면 커서(state.cur, px). 입력은 커서만 움직이고, 포신은 매 프레임 커서가 가리키는 세계 점을 향해 살짝 늦게(≈0.07 s) 따라간다.
    // 이전(포신 각도가 곧 조준, 조준선은 포신 투영)엔 반동·카메라 흔들림·거리별 감도가 전부 조준선에 실려 상하가 제멋대로 뛰었다(2026-09-03).
    // 조이스틱·키보드: 기울기 → 커서 속도(데드존 0.12, 지수 곡선), 끝까지 밀면 ≈1.2초에 화면을 가로지른다. 실시간(rawDt) — 히트스톱 중에도 조준은 느려지지 않는다.
    const kx = !state.live ? 0 : (keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : 0) + (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0);
    const ky = !state.live ? 0 : (keys.has('ArrowUp') || keys.has('KeyW') ? -1 : 0) + (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
    // state.live 가 스틱까지 막는다 — 타이틀·앞뒤 전환(flip) 중엔 포신이 돌지 않는다
    const sx = !state.live ? 0 : (state.stick.active ? state.stick.x : kx), sy = !state.live ? 0 : (state.stick.active ? state.stick.y : ky);
    const c = state.cur;
    if (c.x < 0 || !state.live) { c.x = innerWidth / 2; c.y = innerHeight / 2; }   // 시작·앞뒤 전환·CONTINUE 뒤엔 가운데서 다시
    if (sx || sy) {
      const curve = (v) => { const a = Math.min(1, Math.abs(v)); const d = Math.max(0, a - 0.12) / 0.88; return Math.sign(v) * (d * d * 0.7 + d * 0.3); };
      const v = Math.max(innerWidth, innerHeight) * 0.85 * rawDt;
      c.x = THREE.MathUtils.clamp(c.x + curve(sx) * v, 0, innerWidth); c.y = THREE.MathUtils.clamp(c.y + curve(sy) * v, 0, innerHeight);
    }
    if (state.live && state.follow) aimAtScreen(c.x, c.y, 1 - Math.exp(-rawDt * 14));   // follow=false: 데모 자동조준이 yaw/pitch 를 직접 쓴다
    const kb = state.live && !state.stick.active;   // 키보드는 게임 중에만(타이틀·전적 카드에서 Shift/Enter 로 총이 돌면 안 된다)
    state.firing = state.live && (state.firingPtr || (kb && (keys.has('Enter') || keys.has('ShiftLeft') || keys.has('ShiftRight'))));
    root.rotation.y = state.facing - state.heading;   // 포탑 전체가 보는 쪽(월드 각 facing). 부모(마차 mount)가 길 헤딩만큼 이미 돌아 있으니 그만큼 뺀다
    yawPivot.rotation.y = state.yaw;
    pitchPivot.rotation.x = state.pitch + state.recoil * 0.015 * (Math.random() - 0.5);
    yawPivot.updateWorldMatrix(true, true);
    aim(time);
    // 트레이서 수명
    updateTracers(time); updateImpacts(time);
    updateRockets(dt, time);
    pumpCollapse(time);
    // 파편 낙하로 좀비 압사: 빠르게 움직이는 큰 파편 주변
    for (const c of physics.chunks) {
      if (!c.alive) continue;
      const v = c.body.linvel(); const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 4 && c.half.x * c.half.z > 0.6) { const tr = c.body.translation(); if (tr.y < 3.5) horde.crushNear(tr.x, tr.z, Math.max(c.half.x, c.half.z) * 0.9, time); }
    }
  }

  // ── 입력 ──
  // 터치(또는 ?stick=1): 떠다니는 조이스틱 — 아무 데나 누르면 그 자리에 스틱이 생기고, 기울인 만큼 포신이 돈다. 누르고 있는 동안 발사.
  //   엄지가 반지름을 넘으면 밑판이 따라온다(끝까지 밀어도 손을 떼지 않는다). 두 번째 손가락(雷 버튼)은 스틱을 건드리지 않는다.
  // 마우스: 드래그 상대 조준(예전 그대로), 우클릭 = 雷. Space 는 main 이 묶는다.
  const keys = new Set();
  // 마우스 클릭 한 번 = 그 자리로 조준(화면점 → 가슴 높이 평면). 이후 드래그가 다듬는다. 카메라가 조준각을 따라 돌기 때문에 '커서를 계속 따라가기'는 하지 않는다(폭주).
  const _ndc = new THREE.Vector2(), _rc = new THREE.Raycaster(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1), _pt = new THREE.Vector3();
  function aimAtScreen(cx, cy, k = 1) {
    if (!camera) return;
    _ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); _rc.setFromCamera(_ndc, camera);
    // 보스·수리 상자처럼 키 큰 표적은 화면 광선이 그 부위 상자에 닿은 점을 쓴다 — 가슴 높이 평면만 쓰면 巨人 가슴을 클릭해도 보스 뒤 88 m 지면을 겨눈다(실측)
    let th = null; for (const tg of targets) { const r = tg.raycast(_rc.ray, 400); if (r && r.t < (th ? th.t : Infinity)) th = r; }
    if (th) _pt.copy(_rc.ray.origin).addScaledVector(_rc.ray.direction, th.t);
    else if (!_rc.ray.intersectPlane(_plane, _pt)) return;
    muzzle.getWorldPosition(_o);
    const f = state.facing || 0;
    let dx = _pt.x - _o.x, dz = _pt.z - _o.z, dy = _pt.y - _o.y;
    // 화면 아래쪽(마차 자리)은 가슴 평면 접점이 총구 옆·뒤로 떨어져 각이 뒤집힌다 — 그땐 화면 광선 방향 자체를 겨눈다(커서가 아래에 있어도 포신이 굳지 않게)
    if (-(dx * Math.sin(f) + dz * Math.cos(f)) < 4) { const d = _rc.ray.direction; dx = d.x; dz = d.z; dy = d.y; }
    // 조준각은 포탑이 보는 쪽(state.facing) 기준의 상대각이다 — 추격전(뒤를 봄)에도 같은 식이 쓰인다
    let ty = Math.atan2(-dx, -dz) - f;
    ty = Math.atan2(Math.sin(ty), Math.cos(ty));
    if (Math.abs(ty) > 1.5) return;   // 조준 범위 밖(등 뒤)은 무시
    state.yaw += (ty - state.yaw) * k;
    state.pitch += (THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.62, state.pitchMax) - state.pitch) * k;
  }
  function attachInput(el, { stickEl = null, forceStick = false } = {}) {
    let mouseActive = false, stickId = -1, sx0 = 0, sy0 = 0;
    addEventListener('keydown', (e) => { if (e.target?.tagName === 'INPUT') return; if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Enter', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); } });
    addEventListener('keyup', (e) => keys.delete(e.code)); addEventListener('blur', () => keys.clear());
    const R = 54;
    const knob = stickEl?.firstElementChild;
    const cap = (e) => { try { el.setPointerCapture(e.pointerId); } catch {} };   // 합성 이벤트(테스트)엔 활성 포인터가 없다
    const showStick = (x, y) => { if (!stickEl) return; stickEl.classList.add('on'); stickEl.classList.remove('hint'); stickEl.style.left = `${x}px`; stickEl.style.top = `${y}px`; stickEl.style.bottom = 'auto'; stickEl.style.right = 'auto'; };
    const moveKnob = (dx, dy) => { if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    const hideStick = () => { if (!stickEl) return; stickEl.classList.remove('on'); stickEl.classList.add('hint'); stickEl.style.cssText = ''; moveKnob(0, 0); };
    // showStick 은 left/top 인라인 — 힌트의 right/bottom 을 이기려면 right/bottom 도 auto
    if (stickEl && (forceStick || navigator.maxTouchPoints > 0)) stickEl.classList.add('hint');
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (forceStick || e.pointerType === 'touch') {
        if (stickId !== -1) return;
        stickId = e.pointerId; sx0 = e.clientX; sy0 = e.clientY; state.stick.active = true; state.stick.x = 0; state.stick.y = 0; state.firingPtr = true;
        showStick(sx0, sy0); cap(e); return;
      }
      if (e.button === 2) { hooks.onBombKey?.(); return; }
      mouseActive = true; state.firingPtr = true; cap(e); state.cur.x = e.clientX; state.cur.y = e.clientY;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickId) {
        let dx = e.clientX - sx0, dy = e.clientY - sy0; const len = Math.hypot(dx, dy);
        if (len > R) { const over = len - R; sx0 += dx / len * over; sy0 += dy / len * over; dx *= R / len; dy *= R / len; showStick(sx0, sy0); }
        state.stick.x = dx / R; state.stick.y = dy / R; moveKnob(dx, dy);
        return;
      }
      if (forceStick || e.pointerType === 'touch' || !state.live) return;
      state.cur.x = e.clientX; state.cur.y = e.clientY;   // 마우스는 누르지 않아도 조준선이 따라온다(라이트건)
    });
    const stop = (e) => {
      if (e.pointerId === stickId) { stickId = -1; state.stick.active = false; state.stick.x = state.stick.y = 0; hideStick(); }
      else if (e.pointerType !== 'touch') mouseActive = false;
      state.firingPtr = stickId !== -1 || mouseActive;
    };
    el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop); el.addEventListener('lostpointercapture', stop);
  }

  // ── 雷 = 다연장로켓 일제사격(2026-09-03, 비격진천뢰 대체) ──
  // 조선 위에 현대 무기라는 갭이 이 게임의 특징이다 — 시한 폭탄 한 알(구식)보다 로켓 비가 맞다.
  // 문법(2026-09-03 2차): 포탑 위 20연장 포드에서 **수직으로** 쏘아 올린다 → 0.35초 뒤 바닥에 **록온 링 20개**가 줄줄이 찍힌다 → 로켓이 정점에서 그 링으로 **내리꽂힌다**.
  // 궤적은 3차 베지어(P0 → 바로 위 H → 표적 바로 위 0.8H → 표적): 수직 이륙·수직 낙하. 조준과 무관하게 보는 쪽 앞마당 9~40 m 를 5줄 × 4열로 덮는다(첫 줄이 마차에 붙어 긁는 7~14 m 대).
  // 유도 없음 — 신기전(箭)과 문법이 다르다. 포드·격자가 gun.root 에 달려 있어 추격(π)·대치(0) 양쪽을 한 코드로 덮는다.
  const NT = 20, COLS = 4, ROWS = 5;
  // 포드는 포탑 뒤·위(y 1.55) — 추격 카메라가 마차를 화면 밑단에 걸치므로 낮게 달면 안 보인다(y 0.62 는 NDC −1.14, 화면 밖 실측). 거의 수직(77°)으로 세운다. 기둥 둘은 크랭크 회전 반경(0.51) 밖.
  const pod = new THREE.Group(); pod.position.set(0, 1.55, 0.8); pod.rotation.x = 1.35; root.add(pod);
  for (const sx of [-0.32, 0.32]) { const leg = box(0.09, 1.55, 0.09, IRON); leg.position.set(sx, 0.775, 0.82); root.add(leg); }
  pod.add(box(1.24, 0.66, 0.72, IRON));
  const tubeGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.8, 8); tubeGeo.rotateX(Math.PI / 2);
  const tubes = new THREE.InstancedMesh(tubeGeo, new THREE.MeshStandardMaterial({ color: 0x0b0b0d, metalness: 0.8, roughness: 0.35 }), NT); tubes.castShadow = true; pod.add(tubes);
  const tubeLocal = [];   // 발사구(포드 로컬) — 로켓은 여기서 나온다
  const tubeX = (k) => -0.36 + (k % COLS) * 0.24, tubeY = (k) => -0.24 + Math.floor(k / COLS) * 0.12;
  for (let k = 0; k < NT; k++) { _m.makeTranslation(tubeX(k), tubeY(k), 0); tubes.setMatrixAt(k, _m); tubeLocal.push(new THREE.Vector3(tubeX(k), tubeY(k), -0.42)); }   // 4열 × 5줄
  // 윗면(카메라 쪽) 장전등: 남은 횟수 비율만큼 켜진다. 마차가 잉크 실루엣이라 포드는 이 불빛으로 읽힌다.
  const readyDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb347 }), NT); readyDots.layers.set(LAYER_SPOT); pod.add(readyDots);
  for (let k = 0; k < NT; k++) { _m.makeTranslation(tubeX(k), 0.36, -0.28 + Math.floor(k / COLS) * 0.14); readyDots.setMatrixAt(k, _m); }
  const MAXR = 40, RH = 22;   // 동시 비행 상한(연달아 두 번) · 리본 히스토리 점 수(0.025초 간격 → 0.55초 꼬리)
  const rkGeo = new THREE.CylinderGeometry(0.045, 0.085, 1.05, 8); rkGeo.rotateX(Math.PI / 2);   // +z 가 머리(가늘다)
  const rockets = new THREE.InstancedMesh(rkGeo, new THREE.MeshStandardMaterial({ color: 0x2a2b30, metalness: 0.7, roughness: 0.4 }), MAXR); rockets.frustumCulled = false; rockets.castShadow = true; rockets.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(rockets);
  const exhaust = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb347, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), MAXR); exhaust.layers.set(LAYER_SPOT); exhaust.frustumCulled = false; exhaust.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(exhaust);
  // 록온 링: 표적 지점 바닥에 붉은 링 + 점. 깊이 무시(조준 링과 같은 문법) — 떼 속에서도 보인다. 로켓이 오르는 0.35초 뒤에 큰 링이 표적으로 '착' 조여진다.
  const lockGeo = new THREE.RingGeometry(0.78, 0.98, 28); lockGeo.rotateX(-Math.PI / 2);
  const lockMat = new THREE.MeshBasicMaterial({ color: 0xff4a3c, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const locks = new THREE.InstancedMesh(lockGeo, lockMat, MAXR); locks.layers.set(LAYER_SPOT); locks.frustumCulled = false; locks.renderOrder = 20; locks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(locks);
  const dotGeo = new THREE.RingGeometry(0.0, 0.16, 12); dotGeo.rotateX(-Math.PI / 2);
  const lockDots = new THREE.InstancedMesh(dotGeo, lockMat, MAXR); lockDots.layers.set(LAYER_SPOT); lockDots.frustumCulled = false; lockDots.renderOrder = 20; lockDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(lockDots);
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MAXR; i++) { rockets.setMatrixAt(i, z); exhaust.setMatrixAt(i, z); locks.setMatrixAt(i, z); lockDots.setMatrixAt(i, z); } }   // r185: 인스턴스 기본 항등행렬 → 미사용 슬롯 0-스케일
  // 연기 리본: 로켓당 RH 점 히스토리 링버퍼 → 단일 지오메트리. 착탄 뒤 0.9초 동안 사라진다. 신기전 리본보다 밝고 넓다 — 3초짜리 볼거리라 잠깐 가려도 된다.
  const rib = { hist: new Float32Array(MAXR * RH * 3), n: new Uint8Array(MAXR), head: new Uint8Array(MAXR), last: new Float32Array(MAXR), fade: new Float32Array(MAXR) };
  const ribGeo = new THREE.BufferGeometry(), ribPos = new Float32Array(MAXR * RH * 2 * 3), ribA = new Float32Array(MAXR * RH * 2);
  ribGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3).setUsage(THREE.DynamicDrawUsage)); ribGeo.setAttribute('aAlpha', new THREE.BufferAttribute(ribA, 1).setUsage(THREE.DynamicDrawUsage));
  { const idx = []; for (let m = 0; m < MAXR; m++) for (let k = 0; k < RH - 1; k++) { const v = (m * RH + k) * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); } ribGeo.setIndex(idx); }
  const ribbon = new THREE.Mesh(ribGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(vec3(0.70, 0.68, 0.64), vA * 0.62); }' })); ribbon.frustumCulled = false; scene.add(ribbon);
  // 착탄 연출 3겹: 화구 스프라이트(호박 → 흰, 0.4초에 3 → 16 m) + 바닥 충격파 링(0.35초에 1 → 11 m) + 연기 뭉치(1.5초, 3 → 10 m 로 부풀며 오른다)
  const BURSTS = 12, bursts = [], burstBorn = new Float32Array(BURSTS).fill(-1e9); let burstCur = 0;
  for (let i = 0; i < BURSTS; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffc070 })); sp.layers.set(LAYER_SPOT); sp.visible = false; scene.add(sp); bursts.push(sp); }
  const SHOCKS = 12, shocks = [], shockBorn = new Float32Array(SHOCKS).fill(-1e9); let shockCur = 0;
  { const g = new THREE.RingGeometry(0.85, 1.0, 40); g.rotateX(-Math.PI / 2); for (let i = 0; i < SHOCKS; i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.layers.set(LAYER_SPOT); m.visible = false; scene.add(m); shocks.push(m); } }
  const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 4, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const SMOKES = 28, smokes = [], smokeBorn = new Float32Array(SMOKES).fill(-1e9); let smokeCur = 0;
  for (let i = 0; i < SMOKES; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true, color: 0x5e5b56 })); sp.visible = false; scene.add(sp); smokes.push(sp); }
  // 슬롯 상태. 베지어 제어점 4개(a=발사구, c1=그 바로 위, c2=표적 바로 위, b=표적)
  const rk = { on: new Uint8Array(MAXR), t0: new Float32Array(MAXR), T: new Float32Array(MAXR), a: new Float32Array(MAXR * 3), c1: new Float32Array(MAXR * 3), c2: new Float32Array(MAXR * 3), b: new Float32Array(MAXR * 3), k: new Uint8Array(MAXR) };
  const _rp = new THREE.Vector3(), _rd = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rs = new THREE.Vector3(), _rm = new THREE.Matrix4();
  const GRID_D = [9, 15, 22, 30, 40];   // 줄 거리. 첫 줄이 마차에 붙어 긁는 7~14 m 대를 덮어야 한다 — 멀리만 쓸면 화려하고 쓸모없다
  const LOCK_AT = 0.35;   // 발사 뒤 이 시간에 록온 링이 찍힌다
  function fireSalvo(time) {
    if (state.bombs <= 0) return false;
    let free = 0; for (let j = 0; j < MAXR; j++) if (!rk.on[j]) free++;
    if (free < NT) return false;   // 연타: 두 발째까지 공중(40슬롯)이면 세 번째는 발사하지 않는다 — 탄만 까이고 아무것도 안 나가는 일이 없게
    state.bombs--;
    pod.updateWorldMatrix(true, false);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      let i = -1; for (let j = 0; j < MAXR; j++) if (!rk.on[j] && rib.fade[j] === 0) { i = j; break; }
      if (i < 0) for (let j = 0; j < MAXR; j++) if (!rk.on[j]) { i = j; break; }   // 사라지는 중인 리본 슬롯이라도 쓴다
      const k = r * COLS + c, d = GRID_D[r] + (Math.random() - 0.5) * 2.4, x = (c - 1.5) * (2.2 + d * 0.07) + (Math.random() - 0.5) * 1.6;   // 먼 줄 ±7.5 m — 길 안(더 벌리면 길가 집이 매번 무너진다)
      const H = 16 + d * 0.22;   // 정점 높이 18~25 m — 추격 카메라(9.5 m) 위로 솟아 화면을 나갔다가 내려온다
      _rp.copy(tubeLocal[k]); pod.localToWorld(_rp); rk.a[i * 3] = _rp.x; rk.a[i * 3 + 1] = _rp.y; rk.a[i * 3 + 2] = _rp.z;
      rk.c1[i * 3] = _rp.x + (Math.random() - 0.5) * 3; rk.c1[i * 3 + 1] = _rp.y + H; rk.c1[i * 3 + 2] = _rp.z + (Math.random() - 0.5) * 3;
      _rp.set(x, 0, -d); root.localToWorld(_rp); rk.b[i * 3] = _rp.x; rk.b[i * 3 + 1] = 0.4; rk.b[i * 3 + 2] = _rp.z;
      rk.c2[i * 3] = _rp.x; rk.c2[i * 3 + 1] = 0.4 + H * 0.8; rk.c2[i * 3 + 2] = _rp.z;
      rk.on[i] = 1; rk.t0[i] = time + k * 0.045; rk.T[i] = 1.25 + d * 0.014; rk.k[i] = k;
      rib.n[i] = 0; rib.head[i] = 0; rib.last[i] = 0; rib.fade[i] = 0;
    }
    state.recoil = Math.min(1, state.recoil + 0.5);
    hooks.onSalvo?.(time);
    return true;
  }
  function writeRib(i, mul = 1) {
    const n = rib.n[i], base = i * RH;
    for (let k = 0; k < RH; k++) {
      const vi = (base + k) * 2;
      if (n < 2 || k >= n) { ribA[vi] = ribA[vi + 1] = 0; continue; }
      const idx = (rib.head[i] - n + k + RH * 2) % RH, nb = k + 1 < n ? (idx + 1) % RH : (idx - 1 + RH) % RH;
      const o = (base + idx) * 3, o2 = (base + nb) * 3;
      const x = rib.hist[o], y = rib.hist[o + 1], z = rib.hist[o + 2];
      let sx = -(rib.hist[o2 + 2] - z), sz = rib.hist[o2] - x; const L = Math.hypot(sx, sz) || 1; sx /= L; sz /= L;
      const f = k / (n - 1), w = (0.12 + 0.9 * (1 - f)) * (0.6 + 0.4 * mul);   // 꼬리(0) 넓고 옅게 → 머리(1) 좁고 진하게
      ribPos[vi * 3] = x + sx * w; ribPos[vi * 3 + 1] = y; ribPos[vi * 3 + 2] = z + sz * w; ribPos[vi * 3 + 3] = x - sx * w; ribPos[vi * 3 + 4] = y; ribPos[vi * 3 + 5] = z - sz * w;
      ribA[vi] = ribA[vi + 1] = f * f * mul;
    }
  }
  function bez(i, u, out) {   // 3차 베지어 위치
    const v = 1 - u, w0 = v * v * v, w1 = 3 * v * v * u, w2 = 3 * v * u * u, w3 = u * u * u, o = i * 3;
    out.set(w0 * rk.a[o] + w1 * rk.c1[o] + w2 * rk.c2[o] + w3 * rk.b[o], w0 * rk.a[o + 1] + w1 * rk.c1[o + 1] + w2 * rk.c2[o + 1] + w3 * rk.b[o + 1], w0 * rk.a[o + 2] + w1 * rk.c1[o + 2] + w2 * rk.c2[o + 2] + w3 * rk.b[o + 2]);
  }
  function bezD(i, u, out) {   // 접선(방향)
    const v = 1 - u, w0 = 3 * v * v, w1 = 6 * v * u, w2 = 3 * u * u, o = i * 3;
    out.set(w0 * (rk.c1[o] - rk.a[o]) + w1 * (rk.c2[o] - rk.c1[o]) + w2 * (rk.b[o] - rk.c2[o]), w0 * (rk.c1[o + 1] - rk.a[o + 1]) + w1 * (rk.c2[o + 1] - rk.c1[o + 1]) + w2 * (rk.b[o + 1] - rk.c2[o + 1]), w0 * (rk.c1[o + 2] - rk.a[o + 2]) + w1 * (rk.c2[o + 2] - rk.c1[o + 2]) + w2 * (rk.b[o + 2] - rk.c2[o + 2])).normalize();
  }
  function updateRockets(dt, time) {
    let any = false, ribDirty = false, lockDirty = false;
    for (let i = 0; i < MAXR; i++) {
      if (!rk.on[i]) {
        if (rib.fade[i] > 0) { const m = 1 - (time - rib.fade[i]) / 0.9; if (m <= 0) { rib.fade[i] = 0; rib.n[i] = 0; writeRib(i, 0); } else writeRib(i, m); ribDirty = true; }
        continue;
      }
      any = true;
      const el = time - rk.t0[i], u = el / rk.T[i];
      if (u < 0) continue;
      if (u >= 1) {
        rk.on[i] = 0; rib.fade[i] = time; writeRib(i, 1); ribDirty = true;
        _rm.makeScale(0, 0, 0); rockets.setMatrixAt(i, _rm); exhaust.setMatrixAt(i, _rm); locks.setMatrixAt(i, _rm); lockDots.setMatrixAt(i, _rm); lockDirty = true;
        rocketImpact(rk.b[i * 3], rk.b[i * 3 + 2], rk.k[i], time); continue;
      }
      if (rib.n[i] === 0) { audio.hitStone(); look.state.flash = Math.min(0.9, look.state.flash + 0.05); }   // 발사 순간(첫 프레임)
      const ue = u < 0.5 ? u : 0.5 + (u - 0.5) * (1 + (u - 0.5) * 0.6);   // 내려올 때 조금 빨라진다(내리꽂힘)
      bez(i, Math.min(1, ue), _rp); bezD(i, Math.min(1, ue), _rd);
      _rq.setFromUnitVectors(_fwd, _rd); _rs.set(1, 1, 1); _rm.compose(_rp, _rq, _rs); rockets.setMatrixAt(i, _rm);
      _rp.addScaledVector(_rd, -0.62); _rs.setScalar(u < 0.12 ? 1.7 : 1.0); _rm.compose(_rp, _rq, _rs); exhaust.setMatrixAt(i, _rm);   // 꼬리 불: 이륙 직후 크다
      if (time - rib.last[i] > 0.025) { rib.last[i] = time; const hh = rib.head[i]; rib.hist[(i * RH + hh) * 3] = _rp.x; rib.hist[(i * RH + hh) * 3 + 1] = _rp.y; rib.hist[(i * RH + hh) * 3 + 2] = _rp.z; rib.head[i] = (hh + 1) % RH; if (rib.n[i] < RH) rib.n[i]++; }
      writeRib(i); ribDirty = true;
      // 록온 링: LOCK_AT 뒤에 크게 나타나 0.22초에 표적 크기로 조여지고, 착탄까지 살짝 숨 쉰다
      const la = el - LOCK_AT;
      if (la >= 0) { const sN = 1 + 1.8 * Math.max(0, 1 - la / 0.22), sP = sN * (1 + 0.05 * Math.sin(la * 16)); _rs.set(sP, 1, sP); _rp.set(rk.b[i * 3], 0.08, rk.b[i * 3 + 2]); _rq.identity(); _rm.compose(_rp, _rq, _rs); locks.setMatrixAt(i, _rm); _rs.set(1, 1, 1); _rm.compose(_rp, _rq, _rs); lockDots.setMatrixAt(i, _rm); lockDirty = true; }
    }
    if (any) { rockets.instanceMatrix.needsUpdate = true; exhaust.instanceMatrix.needsUpdate = true; }
    if (lockDirty) { locks.instanceMatrix.needsUpdate = true; lockDots.instanceMatrix.needsUpdate = true; }
    if (ribDirty) { ribGeo.attributes.position.needsUpdate = true; ribGeo.attributes.aAlpha.needsUpdate = true; }
    readyDots.count = Math.min(NT, Math.round(Math.max(0, state.bombs) / Math.max(1, state.bombsMax) * NT));
    for (let i = 0; i < BURSTS; i++) { if (!bursts[i].visible) continue; const a = (time - burstBorn[i]) / 0.4; if (a > 1) { bursts[i].visible = false; continue; } bursts[i].scale.setScalar(3 + 13 * a); bursts[i].material.opacity = 1 - a * a; bursts[i].material.color.setRGB(1, 0.75 + 0.25 * a, 0.44 + 0.56 * a); }
    for (let i = 0; i < SHOCKS; i++) { if (!shocks[i].visible) continue; const a = (time - shockBorn[i]) / 0.35; if (a > 1) { shocks[i].visible = false; continue; } const sc = 1 + 10 * Math.sqrt(a); shocks[i].scale.set(sc, 1, sc); shocks[i].material.opacity = 1 - a; }
    for (let i = 0; i < SMOKES; i++) { if (!smokes[i].visible) continue; const a = (time - smokeBorn[i]) / 1.5; if (a > 1) { smokes[i].visible = false; continue; } smokes[i].scale.setScalar(3 + 7 * a); smokes[i].position.y = 1.6 + 2.6 * a; smokes[i].material.opacity = 0.62 * (1 - a) * (1 - a); }
  }
  // 착탄: 반경 7.5 m 좀비 즉사(main 의 onBlast), 건물은 좁게(3.5 m — 20발이 길가 집을 통째로 밀어 버리지 않게), 보스 피해는 폭탄의 0.16배(20발 합이 폭탄 3.2개 분 — 실측 巨人 한 번에 ≈120)
  function rocketImpact(x, z, k, time) {
    const R = 7.5;
    fx.shards.burst(x, 0.6, z, 20, { dirY: 1.0, spread: 1.6, power: 13, scale: 1.0, time });
    fx.blood.burst(x, 1.0, z, 14, { dirY: 0.8, spread: 1.6, power: 11, scale: 1.2, time });
    fx.gibs?.burst(x, 1.0, z, 10, { dirY: 0.9, spread: 1.5, power: 10, scale: 1.2, time });
    fx.decals.add(x, z, 3.2, time);
    const bi = burstCur; burstCur = (burstCur + 1) % BURSTS; bursts[bi].position.set(x, 1.8, z); bursts[bi].visible = true; burstBorn[bi] = time; bursts[bi].material.rotation = Math.random() * 6.3;
    const si = shockCur; shockCur = (shockCur + 1) % SHOCKS; shocks[si].position.set(x, 0.12, z); shocks[si].visible = true; shockBorn[si] = time;
    const mi = smokeCur; smokeCur = (smokeCur + 1) % SMOKES; smokes[mi].position.set(x + (Math.random() - 0.5) * 2, 1.6, z + (Math.random() - 0.5) * 2); smokes[mi].visible = true; smokeBorn[mi] = time; smokes[mi].material.rotation = Math.random() * 6.3;
    spark(x, 0.9, z, time);
    look.state.flash = Math.min(0.9, look.state.flash + 0.28);
    audio.collapse(1.0); if (k % 5 === 0) audio.thunder();   // 우레는 다섯 발에 한 번 — 20번 겹치면 소음
    blastBuildings(x, z, 3.5, time);
    hooks.onBlast?.(x, z, R, time, 0.16);
  }
  // 건물 하나를 통째로 무너뜨린다(보스가 쓰러지며 덮치는 궁궐 등)
  function razeBuilding(b, dirX, dirZ, time) { if (b.alive) { b.hp = 0; collapse(b, dirX, dirZ, time); } }

  // 폭발 반경 안의 건물 부위를 바깥으로 날린다. 건물 체력도 깎여 붕괴로 이어질 수 있다.
  function blastBuildings(x, z, R, time) {
    for (const b of buildings) {
      if (!b.alive || b.kind === 'palace') continue;   // 궁궐은 恐龍이 쓰러질 때만 무너진다(비격진천뢰로 미리 무너지면 결말이 샌다)
      if (x < b.bounds.min.x - R || x > b.bounds.max.x + R || z < b.bounds.min.z - R || z > b.bounds.max.z + R) continue;
      let n = 0;
      for (const p of b.parts) {
        if (p.destroyed) continue;
        const dx = p.center.x - x, dz = p.center.z - z, d = Math.hypot(dx, dz);
        if (d > R || p.center.y > 4.5) continue;
        b.hp -= 30;
        if (n++ < 24) destroyPart(b, p, dx / (d || 1), dz / (d || 1), 9, time);
      }
      if (b.hp <= 0 && b.alive) collapse(b, 0, -1, time);
    }
  }
  return { root, yawPivot, pitchPivot, muzzle, state, targets, hooks, update, attachInput, blastBuildings, fireSalvo, razeBuilding, spark, setReticle };
}
