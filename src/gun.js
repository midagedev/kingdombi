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

export function createGun(scene, physics, horde, buildings, fx, audio, look, { position, onCollapse }) {
  // ── 모델 ──
  const root = new THREE.Group(); root.position.copy(position); scene.add(root);
  // 돌 단 + 화차 수레
  const platform = box(6, 0.5, 5, new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 1 })); platform.position.y = -0.25; root.add(platform);
  const bed = box(1.6, 0.14, 2.2, WOOD); bed.position.y = 0.62; root.add(bed);
  for (const sx of [-1, 1]) {
    const wheel = cyl(0.62, 0.12, WOOD, 16); wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * 0.95, 0.62, 0.2); root.add(wheel);
    for (let k = 0; k < 6; k++) { const sp = box(0.05, 1.1, 0.05, WOOD); sp.rotation.x = k * Math.PI / 6; wheel.add(sp); }
    const hub = cyl(0.12, 0.2, IRON); hub.rotation.z = Math.PI / 2; hub.position.set(sx * 0.95, 0.62, 0.2); root.add(hub);
    const handle = box(0.08, 0.08, 1.6, WOOD); handle.position.set(sx * 0.6, 0.72, 1.6); handle.rotation.x = -0.25; root.add(handle);
  }
  const axle = cyl(0.05, 2.0, IRON); axle.rotation.z = Math.PI / 2; axle.position.set(0, 0.62, 0.2); root.add(axle);
  const post = cyl(0.1, 0.7, IRON); post.position.set(0, 1.05, -0.1); root.add(post);

  const yawPivot = new THREE.Group(); yawPivot.position.set(0, 1.42, -0.1); root.add(yawPivot);
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
  const tracer = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 1), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), TRACERS);
  tracer.layers.set(LAYER_SPOT); tracer.frustumCulled = false; tracer.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(tracer);
  const tracerBorn = new Float32Array(TRACERS).fill(-1e9); let tracerCursor = 0;

  // ── 상태 ──
  const state = { yaw: 0, pitch: -0.06, firing: false, spin: 0, heat: 0, jammed: 0, shots: 0, recoil: 0 };
  const RATE = 42;     // 발/초
  let fireAcc = 0;

  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _mid = new THREE.Vector3(), _hit = new THREE.Vector3();
  const _ray = new THREE.Ray(), _box = new THREE.Box3();
  const rapierRay = new physics.RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });

  function spawnTracer(ox, oy, oz, hx, hy, hz, time) {
    const i = tracerCursor; tracerCursor = (tracerCursor + 1) % TRACERS;
    _mid.set((ox + hx) / 2, (oy + hy) / 2, (oz + hz) / 2);
    _d.set(hx - ox, hy - oy, hz - oz); const len = _d.length(); _d.normalize();
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _d);
    _s.set(1, 1, len);
    _m.compose(_mid, _q, _s); tracer.setMatrixAt(i, _m); tracerBorn[i] = time;
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
      const mass = Math.max(0.5, p.volume * 0.8);
      physics.spawnChunk(p.mesh, { x: dirX * power * mass, y: power * 0.35 * mass, z: dirZ * power * mass }, time);
    } else {
      // 기와 인스턴스 묶음·작은 부재 → 파편 소나기
      const n = p.mesh.isInstancedMesh ? Math.min(160, 20 + p.mesh.count * 0.5) : 8;
      fx.shards.burst(c.x, c.y, c.z, n, { dirX: dirX * 0.4, dirY: 0.7, dirZ: dirZ * 0.4, spread: 1.6, power: 6 + power * 0.6, scale: 1.2, time });
    }
  }
  function collapse(b, dirX, dirZ, time) {
    b.alive = false;
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

  function fireOne(time) {
    state.shots++;
    muzzle.getWorldPosition(_o);
    pitchPivot.getWorldDirection(_d); _d.negate(); // Group 의 forward 는 +z, 총구는 -z
    const spread = 0.010 + state.heat * 0.022;
    _d.x += (Math.random() - 0.5) * spread; _d.y += (Math.random() - 0.5) * spread; _d.z += (Math.random() - 0.5) * spread; _d.normalize();
    _ray.set(_o, _d);
    const MAX = 260;

    // 1) 좀비
    const z = horde.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, MAX);
    let t = z ? z.t : MAX;
    // 2) 건물 부위
    const bh = raycastBuildings(_ray, t);
    if (bh) t = bh.t;
    // 3) 물리(지면·파편·시체)
    rapierRay.origin.x = _o.x; rapierRay.origin.y = _o.y; rapierRay.origin.z = _o.z;
    rapierRay.dir.x = _d.x; rapierRay.dir.y = _d.y; rapierRay.dir.z = _d.z;
    const ph = physics.world.castRay(rapierRay, t, true, undefined, 0xFFFFFFFD);
    if (ph && ph.timeOfImpact < t) {
      t = ph.timeOfImpact;
      const body = ph.collider.parent();
      const hx = _o.x + _d.x * t, hy = _o.y + _d.y * t, hz = _o.z + _d.z * t;
      if (body && body.isDynamic()) {
        body.applyImpulseAtPoint({ x: _d.x * 6, y: 2.5, z: _d.z * 6 }, { x: hx, y: hy, z: hz }, true);
        fx.blood.burst(hx, hy, hz, 3, { dirX: _d.x * 0.5, dirY: 0.5, dirZ: _d.z * 0.5, spread: 0.8, power: 5, scale: 0.8, time });
      } else {
        fx.shards.burst(hx, hy, hz, 2, { dirX: -_d.x * 0.3, dirY: 0.9, dirZ: -_d.z * 0.3, spread: 0.7, power: 4, scale: 0.6, time });
        if (state.shots % 3 === 0) audio.hitStone();
      }
    } else if (bh) {
      const p = bh.part; const hx = _o.x + _d.x * t, hy = _o.y + _d.y * t, hz = _o.z + _d.z * t;
      const dmg = 5.5;
      p.hp -= dmg; bh.b.hp -= dmg;
      fx.shards.burst(hx, hy, hz, 4, { dirX: -_d.x * 0.6, dirY: 0.7, dirZ: -_d.z * 0.6, spread: 1.1, power: 6, scale: 0.9, time });
      if (state.shots % 2 === 0) audio.hitStone();
      if (p.hp <= 0) destroyPart(bh.b, p, _d.x, _d.z, 7, time);
      if (bh.b.hp <= 0 && bh.b.alive) collapse(bh.b, _d.x, _d.z, time);
    } else if (z) {
      const killed = horde.damage(z.index, 2.3, _d.x, _d.z, time, 10);
      fx.blood.burst(z.x, z.y, z.z, killed ? 14 : 6, { dirX: _d.x * 0.8, dirY: 0.45, dirZ: _d.z * 0.8, spread: 0.9, power: 7, scale: 1, time });
      fx.decals.add(z.x, z.z, killed ? 1.6 + Math.random() : 0.5 + Math.random() * 0.5, time);
      audio.hitFlesh();
    }
    if (state.shots % 2 === 0) spawnTracer(_o.x, _o.y, _o.z, _o.x + _d.x * t, _o.y + _d.y * t, _o.z + _d.z * t, time);

    state.heat = Math.min(1, state.heat + 0.0045);
    state.recoil = Math.min(1, state.recoil + 0.35);
    look.state.flash = Math.min(0.22, look.state.flash + 0.05);
    audio.shot();
    if (state.heat >= 1) { state.jammed = 2.6; audio.overheat(); }
  }

  function update(dt, time) {
    // 스핀업/다운
    const want = state.firing && state.jammed <= 0 ? 1 : 0;
    state.spin += (want - state.spin) * Math.min(1, dt * (want ? 2.6 : 1.4));
    barrels.rotation.z += state.spin * 22 * dt;
    crank.rotation.x += state.spin * 14 * dt;
    audio.setSpin(state.spin);
    // 발사
    if (state.jammed > 0) state.jammed -= dt;
    if (state.firing && state.spin > 0.55 && state.jammed <= 0) {
      fireAcc += dt * RATE * state.spin;
      let n = 0;
      while (fireAcc >= 1 && n < 4) { fireAcc -= 1; fireOne(time); n++; }
    } else fireAcc = 0;
    state.heat = Math.max(0, state.heat - dt * (state.jammed > 0 ? 0.42 : 0.09));
    // 총열 과열색: 검정→진홍→주황빛
    const h = state.heat;
    barrelHot.color.setRGB(Math.pow(h, 1.6) * 1.2, Math.pow(h, 3.5) * 0.45, Math.pow(h, 6) * 0.15);
    // 화염
    const firingNow = state.firing && state.spin > 0.55 && state.jammed <= 0;
    const fl = firingNow ? (0.6 + Math.random() * 0.8) : 0;
    flash.scale.setScalar(fl * 1.8); flash.material.rotation = Math.random() * 6.3;
    flashWorld.scale.setScalar(fl * 1.1); flashWorld.material.rotation = flash.material.rotation;
    flashLight.intensity = fl * 170;
    // 반동 감쇠
    state.recoil *= Math.exp(-dt * 12);
    // 조준 반영
    yawPivot.rotation.y = state.yaw;
    pitchPivot.rotation.x = state.pitch + state.recoil * 0.015 * (Math.random() - 0.5);
    // 트레이서 수명
    for (let i = 0; i < TRACERS; i++) if (time - tracerBorn[i] > 0.055 && time - tracerBorn[i] < 1) { _m.makeScale(0, 0, 0); tracer.setMatrixAt(i, _m); tracerBorn[i] = -1e9; }
    tracer.instanceMatrix.needsUpdate = true;
    pumpCollapse(time);
    // 파편 낙하로 좀비 압사: 빠르게 움직이는 큰 파편 주변
    for (const c of physics.chunks) {
      if (!c.alive) continue;
      const v = c.body.linvel(); const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 4 && c.half.x * c.half.z > 0.6) { const tr = c.body.translation(); if (tr.y < 3.5) horde.crushNear(tr.x, tr.z, Math.max(c.half.x, c.half.z) * 0.9, time); }
    }
  }

  // ── 입력 ──
  function attachInput(el) {
    let lastX = 0, lastY = 0, active = false;
    const k = () => 2.6 / Math.max(320, innerWidth);
    el.addEventListener('pointerdown', (e) => { active = true; lastX = e.clientX; lastY = e.clientY; state.firing = true; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!active) return;
      state.yaw = THREE.MathUtils.clamp(state.yaw - (e.clientX - lastX) * k(), -1.05, 1.05);
      state.pitch = THREE.MathUtils.clamp(state.pitch - (e.clientY - lastY) * k() * 0.8, -0.32, 0.18);
      lastX = e.clientX; lastY = e.clientY;
    });
    const stop = () => { active = false; state.firing = false; };
    el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop); el.addEventListener('lostpointercapture', stop);
  }

  // 폭발 반경 안의 건물 부위를 바깥으로 날린다. 건물 체력도 깎여 붕괴로 이어질 수 있다.
  function blastBuildings(x, z, R, time) {
    for (const b of buildings) {
      if (!b.alive) continue;
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
  return { root, yawPivot, pitchPivot, muzzle, state, update, attachInput, blastBuildings };
}
