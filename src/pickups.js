// 수리 도구 상자: 호박색으로 빛나는 나무 상자. 달릴 땐 차선 위에 있어 들이받으면 먹고, 정차 땐 앞쪽에 떨어져 있어 쏘면 열린다(도구가 마차로 날아온다).
// 장갑이 유일한 자원이다 — 열 관리는 없다(2026-09-03). gun.targets 에 등록되어 총알이 맞는다.
import * as THREE from 'three';
import { S } from './i18n.js';
import { LAYER_SPOT } from './look.js';

const WOOD = new THREE.MeshStandardMaterial({ color: 0x2a1c0e, roughness: 0.9 });
const IRON = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.7, roughness: 0.5 });
const _hit = new THREE.Vector3();

export function createPickups(scene, { vehicle, fx, audio, juice, onHeal, onScore, heal = 25 }) {
  const crates = [];   // { group, box, glow, hp, kind:'lane'|'stop', alive, phase }
  function spawn(x, z, kind) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.random() * 6.28; scene.add(g);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.95), WOOD); body.position.y = 0.3; body.castShadow = true; g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 1.0), IRON); lid.position.y = 0.65; g.add(lid);
    for (const sx of [-1, 1]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 1.0), IRON); band.position.set(sx * 0.3, 0.31, 0); g.add(band); }
    // 호박 발광: 틈새 빛 + 위쪽 점(멀리서 보인다)
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.9), glowMat); glow.position.y = 0.61; glow.layers.set(LAYER_SPOT); g.add(glow);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glowMat); beacon.position.y = 1.5; beacon.layers.set(LAYER_SPOT); g.add(beacon);
    const c = { group: g, box: new THREE.Box3().setFromObject(g), glowMat, beacon, hp: 2, kind, alive: true, phase: Math.random() * 6 };
    crates.push(c); return c;
  }
  function open(c, time, how) {
    if (!c.alive) return; c.alive = false;
    const p = c.group.position;
    fx.shards.burst(p.x, 0.7, p.z, 18, { dirY: 0.9, spread: 1.2, power: 6, scale: 0.9, time });
    fx.blood.burst(p.x, 0.8, p.z, 0, { time });
    c.group.removeFromParent();
    onHeal(heal); onScore(300, '修');
    juice.stamp('修'); juice.banner(S.repair(heal), 1400); audio.coin();
  }
  // gun.targets 계약
  function raycast(ray, maxT) {
    let best = null, bt = maxT;
    for (const c of crates) { if (!c.alive) continue; const r = ray.intersectBox(c.box, _hit); if (!r) continue; const t = r.distanceTo(ray.origin); if (t < bt) { bt = t; best = c; } }
    return best ? { t: bt, part: best } : null;
  }
  function hit(c, dmg, x, y, z, dirX, dirZ, time) {
    c.hp -= 1; fx.shards.burst(x, y, z, 3, { dirX: -dirX * 0.4, dirY: 0.5, dirZ: -dirZ * 0.4, spread: 0.6, power: 3, scale: 0.7, time }); audio.hitStone();
    if (c.hp <= 0) open(c, time, 'shot');
  }
  let t = 0;
  function update(dt, time) {
    t += dt;
    const vp = vehicle.pos;
    for (const c of crates) {
      if (!c.alive) continue;
      const p = c.group.position;
      c.group.visible = Math.abs(p.z - vp.z) < 160;
      if (!c.group.visible) continue;
      const f = 0.7 + 0.3 * Math.sin(t * 4 + c.phase);
      c.glowMat.color.setHex(0xffb347).multiplyScalar(f);
      c.beacon.position.y = 1.5 + Math.sin(t * 2 + c.phase) * 0.12;
      // 들이받아 먹기: 마차 정면 쐐기 구역
      if (Math.abs(p.x - vp.x) < 2.0 && p.z < vp.z + 1 && p.z > vp.z - 4.2) open(c, time, 'ram');
    }
  }
  return { spawn, update, raycast, hit, crates };
}
