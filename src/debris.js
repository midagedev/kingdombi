// CPU 탄도 파티클(InstancedMesh 박스): 기와 파편·나무 조각(세계 레이어), 피(스팟 레이어). 바닥 튐 한 번, 수명 후 소멸.
// 바닥에 남는 데칼(피 웅덩이)은 별도 풀.
import * as THREE from 'three';
import { LAYER_SPOT } from './look.js';

export function createDebris(scene, { count = 700, layer = 0, color = 0x9a9a9a, size = 0.18, gravity = -22, bounce = 0.35, life = 3.5 } = {}) {
  const geo = new THREE.BoxGeometry(size, size * 0.45, size * 1.3);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
  if (layer === LAYER_SPOT) { mat.emissive = new THREE.Color(color); mat.emissiveIntensity = 0.7; }
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.layers.set(layer); mesh.castShadow = layer === 0;
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < count; i++) mesh.setMatrixAt(i, z); }   // three r185 인스턴스 기본값은 항등행렬 — 쓰기 전에 0으로
  scene.add(mesh);

  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), rot = new Float32Array(count * 3), rv = new Float32Array(count * 3);
  const born = new Float32Array(count).fill(-1e9), sc = new Float32Array(count);
  let cursor = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();

  function burst(x, y, z, n, { dirX = 0, dirY = 0.6, dirZ = 0, spread = 1, power = 9, scale = 1, time }) {
    for (let k = 0; k < n; k++) {
      const i = cursor; cursor = (cursor + 1) % count;
      const i3 = i * 3;
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
      const sp = power * (0.4 + Math.random() * 0.9);
      vel[i3] = (dirX + (Math.random() - 0.5) * 2 * spread) * sp;
      vel[i3 + 1] = (dirY + Math.random() * spread) * sp;
      vel[i3 + 2] = (dirZ + (Math.random() - 0.5) * 2 * spread) * sp;
      rot[i3] = Math.random() * 6.3; rot[i3 + 1] = Math.random() * 6.3; rot[i3 + 2] = Math.random() * 6.3;
      rv[i3] = (Math.random() - 0.5) * 20; rv[i3 + 1] = (Math.random() - 0.5) * 20; rv[i3 + 2] = (Math.random() - 0.5) * 20;
      born[i] = time; sc[i] = scale * (0.6 + Math.random() * 0.8);
    }
  }

  function update(dt, time) {
    for (let i = 0; i < count; i++) {
      const age = time - born[i];
      if (age > life) { if (age < life + 1) { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); } continue; }
      const i3 = i * 3;
      vel[i3 + 1] += gravity * dt;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.04) { pos[i3 + 1] = 0.04; vel[i3 + 1] *= -bounce; vel[i3] *= 0.5; vel[i3 + 2] *= 0.5; rv[i3] *= 0.3; rv[i3 + 2] *= 0.3; }
      rot[i3] += rv[i3] * dt; rot[i3 + 1] += rv[i3 + 1] * dt; rot[i3 + 2] += rv[i3 + 2] * dt;
      e.set(rot[i3], rot[i3 + 1], rot[i3 + 2]); q.setFromEuler(e);
      p.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
      const fade = age > life - 0.5 ? (life - age) * 2 : 1;
      s.setScalar(sc[i] * fade);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { burst, update, mesh };
}

// 바닥 데칼(피 웅덩이). 얇은 원판, 스팟 레이어. 생기고 0.4초 동안 퍼진다.
export function createDecals(scene, { count = 500, color = 0xc1121f } = {}) {
  const geo = new THREE.CircleGeometry(0.5, 10);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.layers.set(LAYER_SPOT);
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < count; i++) mesh.setMatrixAt(i, z); }   // 인스턴스 기본 항등행렬 → 미사용 슬롯 0-스케일
  scene.add(mesh);
  const born = new Float32Array(count).fill(-1e9), target = new Float32Array(count), cx = new Float32Array(count), cz = new Float32Array(count), sx = new Float32Array(count);
  let cursor = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  function add(x, z, size, time) {
    const i = cursor; cursor = (cursor + 1) % count;
    born[i] = time; target[i] = size; cx[i] = x + (Math.random() - 0.5) * 0.4; cz[i] = z + (Math.random() - 0.5) * 0.4; sx[i] = 0.6 + Math.random() * 0.8;
    q.setFromAxisAngle(p.set(0, 1, 0), Math.random() * 6.3);
  }
  function update(time) {
    let dirty = false;
    for (let i = 0; i < count; i++) {
      const age = time - born[i];
      if (age > 0.6 || age < 0) continue;
      dirty = true;
      const k = Math.min(1, age / 0.45); const r = target[i] * (1 - (1 - k) * (1 - k));
      p.set(cx[i], 0.015 + (i % 7) * 0.002, cz[i]); s.set(r * sx[i], 1, r);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
  }
  return { add, update, mesh };
}

// 피 안개(2026-09-03): 총알이 박히는 순간 살점 파편 뒤로 붉은 안개가 훅 퍼진다. 카메라를 보는 인스턴스 빌보드, 스팟 레이어.
// 상자 파편(blood)만으로는 '맞았다'가 점 몇 개였다 — 안개 한 장이 피격을 덩어리로 읽히게 한다.
const MIST_VERT = /* glsl */`
  attribute float iA; varying vec2 vUv; varying float vA;
  void main() { vUv = uv; vA = iA; vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * length(instanceMatrix[0].xyz); gl_Position = projectionMatrix * mv; }
`;
const MIST_FRAG = /* glsl */`
  precision highp float; uniform vec3 uColor; varying vec2 vUv; varying float vA;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() { vec2 q = vUv - 0.5; float r = length(q) * 2.0; float n = hash(floor(vUv * 9.0)) * 0.35;
    float a = (1.0 - smoothstep(0.25, 1.0, r + n)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uColor * a, 1.0); }
`;
export function createMist(scene, { count = 240, color = 0xc1121f } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(count), 1); iA.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iA', iA);
  const mat = new THREE.ShaderMaterial({ vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, uniforms: { uColor: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.layers.set(LAYER_SPOT);
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < count; i++) mesh.setMatrixAt(i, z); }
  scene.add(mesh);
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), born = new Float32Array(count).fill(-1e9), sz = new Float32Array(count);
  let cursor = 0; const m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion();
  const LIFE = 0.55;
  function puff(x, y, z, n, dirX, dirZ, time) {
    for (let k = 0; k < n; k++) {
      const i = cursor; cursor = (cursor + 1) % count; const i3 = i * 3;
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
      vel[i3] = dirX * 2.5 + (Math.random() - 0.5) * 2; vel[i3 + 1] = 0.8 + Math.random(); vel[i3 + 2] = dirZ * 2.5 + (Math.random() - 0.5) * 2;
      born[i] = time; sz[i] = 0.5 + Math.random() * 0.5;
    }
  }
  function update(dt, time) {
    let dirty = false;
    for (let i = 0; i < count; i++) {
      const age = time - born[i]; if (age > LIFE) { if (age < LIFE + 0.5) { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); dirty = true; } continue; }
      const i3 = i * 3; pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      const k = age / LIFE; p.set(pos[i3], pos[i3 + 1], pos[i3 + 2]); s.setScalar(sz[i] * (0.4 + k * 1.6)); m.compose(p, q, s); mesh.setMatrixAt(i, m);
      iA.setX(i, (1 - k) * (1 - k) * 0.9); dirty = true;
    }
    if (dirty) { mesh.instanceMatrix.needsUpdate = true; iA.needsUpdate = true; }
  }
  return { puff, update, mesh };
}
