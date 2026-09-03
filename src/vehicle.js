// 철갑 마차: 쇠판을 두른 수레 위에 개틀링을 얹었다. 정면 쐐기 철판으로 앞을 막은 좀비를 들이받는다.
// 운동학 몸체(Rapier kinematic)라 시체·파편을 밀어낸다. 이동은 레일(-z 직선) 위 속도만.
import * as THREE from 'three';
import { LAYER_SPOT } from './look.js';

const IRON = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.7, roughness: 0.5 });
const IRON2 = new THREE.MeshStandardMaterial({ color: 0x23252b, metalness: 0.65, roughness: 0.45 });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x1d150d, roughness: 0.9 });
const box = (w, h, d, m) => { const x = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); x.castShadow = true; x.receiveShadow = true; return x; };
const cyl = (r, h, m, seg = 14) => { const x = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); x.castShadow = true; return x; };

export function createVehicle(scene, physics, { x = 0, z = 0 } = {}) {
  const root = new THREE.Group(); root.position.set(x, 0, z); scene.add(root);
  const body = new THREE.Group(); root.add(body);
  // 차체: 낮은 철갑 상자 + 위쪽 테두리 판 + 뒤쪽 포좌
  const hull = box(2.9, 1.1, 5.0, IRON); hull.position.y = 1.15; body.add(hull);
  const deck = box(3.1, 0.12, 5.2, IRON2); deck.position.y = 1.76; body.add(deck);
  for (const sx of [-1, 1]) { const rail = box(0.08, 0.5, 5.0, IRON2); rail.position.set(sx * 1.5, 2.0, 0); body.add(rail); }
  const backPlate = box(3.0, 0.5, 0.08, IRON2); backPlate.position.set(0, 2.0, 2.55); body.add(backPlate);
  // 측면 철판 4장: 번갈아 튀어나와 깊이 윤곽선이 가로줄로 그려진다(잉크 룩에선 선이 곧 디테일)
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const plate = box(0.09, 0.26, 4.6 - k * 0.15, k % 2 ? IRON2 : IRON); plate.position.set(sx * (1.47 + (k % 2) * 0.05), 0.72 + k * 0.28, 0.1); body.add(plate); }
  // 리벳: 판 경계마다 작은 구슬
  const rivetGeo = new THREE.SphereGeometry(0.035, 5, 4);
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) for (let j = 0; j < 9; j++) { const r = new THREE.Mesh(rivetGeo, IRON2); r.position.set(sx * 1.56, 0.86 + k * 0.28, -2.1 + j * 0.52); body.add(r); }
  // 바퀴 덮개(반원 철판)
  for (const sx of [-1, 1]) for (const sz of [-1.6, 1.7]) { const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.22, 12, 1, false, 0, Math.PI), IRON2); guard.rotation.z = Math.PI / 2; guard.rotation.y = Math.PI / 2; guard.position.set(sx * 1.62, 0.8, sz); guard.castShadow = true; body.add(guard); }
  // 정면 쐐기 램: 옆에서 보면 삼각 프리즘. Box 를 45° 돌려 얹는다.
  const ramL = box(0.12, 1.5, 2.4, IRON2); ramL.position.set(-0.75, 1.05, -3.2); ramL.rotation.y = 0.62; body.add(ramL);
  const ramR = box(0.12, 1.5, 2.4, IRON2); ramR.position.set(0.75, 1.05, -3.2); ramR.rotation.y = -0.62; body.add(ramR);
  const ramTop = box(2.0, 0.1, 1.9, IRON2); ramTop.position.set(0, 1.78, -3.0); ramTop.rotation.x = 0.28; body.add(ramTop);
  // 가시(2026-09-03): 측면 판·정면 쐐기에 쇠못 — 붙은 좀비가 여기 꿰여 죽는다(horde IMPALE). 인스턴스 하나 = 드로우 1.
  const spikeAt = [];
  for (const sx of [-1, 1]) for (let j = 0; j < 8; j++) spikeAt.push({ p: [sx * 1.7, 1.05 + (j % 2) * 0.3, -2.25 + j * 0.62], r: [0, 0, -sx * 1.05] });   // 바깥·위로 60° — 높은 카메라에서도 읽힌다
  for (const [x, y] of [[-1.15, 1.0], [-0.6, 1.25], [0, 1.45], [0.6, 1.25], [1.15, 1.0], [-0.85, 0.75], [0.85, 0.75], [0, 0.85]]) spikeAt.push({ p: [x, y, -3.55 - (1 - Math.abs(x) / 1.3) * 0.55], r: [-Math.PI / 2 + 0.15, 0, 0] });
  const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.08, 0.62, 6), IRON2, spikeAt.length); spikes.castShadow = true;
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    spikeAt.forEach((s, i) => { e.set(s.r[0], s.r[1], s.r[2]); q.setFromEuler(e); v.set(...s.p); m.compose(v, q, one); spikes.setMatrixAt(i, m); }); }
  body.add(spikes);
  // 정면 등롱(스팟 호박) — 길을 비추는 실광원은 예산 밖. 색만.
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb347 })); lamp.position.set(0, 2.45, -2.9); lamp.layers.set(LAYER_SPOT); body.add(lamp);
  const lampBody = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a22, emissive: 0xffb35c, emissiveIntensity: 1.4 })); lampBody.position.copy(lamp.position); body.add(lampBody);
  const lampArm = box(0.05, 0.6, 0.05, IRON2); lampArm.position.set(0, 2.15, -2.9); body.add(lampArm);
  // 바퀴 4개(나무 살 + 철테)
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1.6, 1.7]) {
    const w = new THREE.Group(); w.position.set(sx * 1.6, 0.78, sz); root.add(w);
    const rim = cyl(0.78, 0.16, IRON, 18); rim.rotation.z = Math.PI / 2; w.add(rim);
    const hub = cyl(0.14, 0.3, IRON2); hub.rotation.z = Math.PI / 2; w.add(hub);
    for (let k = 0; k < 8; k++) { const sp = box(0.06, 1.4, 0.06, WOOD); sp.rotation.x = k * Math.PI / 8; w.add(sp); }
    wheels.push(w);
  }
  for (const sz of [-1.6, 1.7]) { const axle = cyl(0.06, 3.3, IRON); axle.rotation.z = Math.PI / 2; axle.position.set(0, 0.78, sz); root.add(axle); }
  // 포좌: 개틀링 root 가 여기 붙는다
  const mount = new THREE.Object3D(); mount.position.set(0, 1.82, 0.5); body.add(mount);

  // 운동학 몸체 — 그룹 2(총알 레이 무시), 시체·파편은 밀어낸다
  const { RAPIER, world } = physics;
  const kin = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 1.1, z));
  world.createCollider(RAPIER.ColliderDesc.cuboid(1.55, 1.0, 3.3).setCollisionGroups(0x0002FFFF).setFriction(0.6), kin);

  const state = { speed: 0, targetSpeed: 0, accel: 0 };
  let t = 0;
  function update(dt) {
    t += dt;
    const want = state.targetSpeed, dv = want - state.speed;
    const a = THREE.MathUtils.clamp(dv / Math.max(dt, 1e-3), -5.5, 3.2);
    state.accel = a; state.speed += a * dt;
    if (Math.abs(state.speed) < 0.01 && want === 0) state.speed = 0;
    root.position.z -= state.speed * dt;
    for (const w of wheels) w.rotation.x -= state.speed / 0.78 * dt;
    // 덜컹거림: 속도에 비례한 상하 진동 + 가감속 피치
    const k = state.speed / 7.5;
    body.position.y = Math.sin(t * 13.0) * 0.022 * k + Math.sin(t * 7.3) * 0.012 * k;
    body.rotation.x += ((-a * 0.012) + Math.sin(t * 9.1) * 0.004 * k - body.rotation.x) * Math.min(1, dt * 6);
    body.rotation.z = Math.sin(t * 5.7) * 0.006 * k;
    kin.setNextKinematicTranslation({ x: root.position.x, y: 1.1, z: root.position.z });
  }
  return { root, body, mount, pos: root.position, state, update };
}
