// Rapier 물리: 시체 래그돌(단일 몸체) 풀, 건물 파편 몸체 풀, 정적 지형. 살아있는 좀비는 물리 몸체가 없다(horde 가 직접 이동).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// ponytail: 시체는 관절 없는 단일 캡슐 몸체다. 근접 킬만 관절 래그돌로 올리는 건 폰 성능 측정 후.
export const CORPSE_POOL = 110;
export const CHUNK_POOL = 90;

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export async function createPhysics(scene) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -16, z: 0 });
  world.timestep = 1 / 60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 1, 500).setTranslation(0, -1, 0).setFriction(1.1));

  // ── 시체 풀 ──
  const corpses = [];
  for (let i = 0; i < CORPSE_POOL; i++) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -50 - i * 3, 0).setLinearDamping(0.35).setAngularDamping(0.9).setCanSleep(true));
    // 누운 사람 크기: 길이 1.7(z 축), 폭 0.5, 두께 0.35
    const col = world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 0.18, 0.85).setDensity(0.6).setFriction(1.2).setRestitution(0.05), body);
    body.setEnabled(false);
    corpses.push({ body, col, alive: false, born: 0, slot: i });
  }
  let corpseCursor = 0;
  const yawQ = new THREE.Quaternion(), tiltQ = new THREE.Quaternion();
  function spawnCorpse(pos, vel, yaw, time, scale = 1) {
    const c = corpses[corpseCursor]; corpseCursor = (corpseCursor + 1) % CORPSE_POOL;
    c.alive = true; c.born = time;
    c.body.setEnabled(true);
    // 서 있는 자세에서 시작(몸 중심 0.9m), 총격 방향으로 날아가며 넘어진다
    yawQ.setFromAxisAngle(_s.set(0, 1, 0), yaw);
    tiltQ.setFromAxisAngle(_s.set(1, 0, 0), -Math.PI / 2 + (Math.random() - 0.5) * 0.4); // 세워서 시작
    yawQ.multiply(tiltQ);
    c.body.setTranslation({ x: pos.x, y: pos.y + 0.9 * scale, z: pos.z }, true);
    c.body.setRotation({ x: yawQ.x, y: yawQ.y, z: yawQ.z, w: yawQ.w }, true);
    c.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
    c.body.setAngvel({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 12 }, true);
    c.body.wakeUp();
    return c;
  }

  // ── 건물 파편 풀: 원본 부위 mesh 를 그대로 몸체에 얹는다 ──
  const chunks = [];
  let chunkCursor = 0;
  function spawnChunk(mesh, impulse, time) {
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(_p, _q, _s);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    const half = bb.getSize(new THREE.Vector3()).multiply(_s).multiplyScalar(0.5);
    const center = bb.getCenter(new THREE.Vector3()).multiply(_s);
    half.x = Math.max(0.06, half.x); half.y = Math.max(0.06, half.y); half.z = Math.max(0.06, half.z);

    let slot = chunks[chunkCursor];
    if (slot) releaseChunk(slot);
    else { slot = { body: null, mesh: null, alive: false, born: 0 }; chunks[chunkCursor] = slot; }
    chunkCursor = (chunkCursor + 1) % CHUNK_POOL;

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(_p.x, _p.y, _p.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .setLinearDamping(0.15).setAngularDamping(0.4).setCanSleep(true));
    world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(center.x, center.y, center.z)
      .setDensity(0.8).setFriction(0.9).setRestitution(0.15), body);
    const worldCenter = center.clone().applyQuaternion(_q).add(_p);
    // 큰 판(지붕면)은 속도 상한 — 종이처럼 날지 않고 무겁게 주저앉는다
    const mass = body.mass() || 1; const maxDv = Math.max(1.2, 9 - Math.max(half.x, half.y, half.z) * 1.6);
    const imp = Math.hypot(impulse.x, impulse.y, impulse.z) / mass; const k = imp > maxDv ? maxDv / imp : 1;
    impulse = { x: impulse.x * k, y: impulse.y * k, z: impulse.z * k };
    body.applyImpulseAtPoint({ x: impulse.x, y: impulse.y, z: impulse.z }, { x: worldCenter.x + (Math.random() - 0.5) * half.x, y: worldCenter.y + half.y * 0.5, z: worldCenter.z }, true);
    body.setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 3 }, true);

    // mesh 를 씬에 독립 오브젝트로 올린다(원본 트리에서 분리, 월드 스케일 유지)
    mesh.removeFromParent();
    mesh.position.copy(_p); mesh.quaternion.copy(_q); mesh.scale.copy(_s);
    mesh.castShadow = true; mesh.receiveShadow = false;
    scene.add(mesh);
    Object.assign(slot, { body, mesh, alive: true, born: time, half });
    return slot;
  }
  function releaseChunk(slot) {
    if (!slot.alive) return;
    slot.alive = false;
    world.removeRigidBody(slot.body);
    slot.mesh.removeFromParent();
    slot.body = null; slot.mesh = null;
  }

  function step(dt, time) {
    world.step();
    // 파편 시각 동기화 + 수명
    for (const c of chunks) {
      if (!c.alive) continue;
      const t = c.body.translation(), r = c.body.rotation();
      c.mesh.position.set(t.x, t.y, t.z);
      c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (time - c.born > 40 || t.y < -5) releaseChunk(c);
    }
    for (const c of corpses) {
      if (!c.alive) continue;
      if (time - c.born > 90) { c.alive = false; c.body.setEnabled(false); }
    }
  }

  return { RAPIER, world, corpses, chunks, spawnCorpse, spawnChunk, step };
}
