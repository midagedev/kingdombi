// 무너진 집은 새벽까지 탄다(2026-09-03 AAA 룩 2차 재작성).
//   불꽃: 교차 쿼드 5장/화재 — fbm 노이즈가 위로 흐르며 찢어지는 셰이더 불꽃(스팟 레이어, 가산). 스프라이트 덩어리는 종이에 붙인 주황 얼룩이었다.
//   불티: Points 1드로우 — 화재마다 60개가 난류 타고 오르며 작아진다(스팟 레이어).
//   연기: 빌보드 인스턴스 1드로우 — 검은 연기 기둥(세계 레이어 → 잉크가 지평선빛 위에 먹 기둥으로 남긴다).
//   바닥: 호박 발광 원반(스팟). 흰 원반은 뺐다(잉크 합성에서 집터마다 흰 타원이 떴다).
//   실광원: 마차에 가까운 화재 3곳만 깜빡이는 PointLight.
import * as THREE from 'three';
import { LAYER_SPOT } from './look.js';

const MAX_FIRES = 8, QUADS = 5, EMBERS = 60, SMOKE = 14;

const NOISE = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += vnoise(p) * a; p = p * 2.03 + 7.3; a *= 0.5; } return v; }
`;

const FLAME_VERT = /* glsl */`
  attribute float aSeed; attribute float aBorn;
  uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vLife;
  void main() { vUv = uv; vSeed = aSeed; vLife = clamp((uTime - aBorn) / 2.5, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }
`;
const FLAME_FRAG = /* glsl */`
  precision highp float; uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vLife;
  ${NOISE}
  void main() {
    vec2 uv = vUv; float y = uv.y;
    // 위로 흐르는 노이즈 두 겹(속도 다름) — 불꽃이 찢어지며 오른다
    float n = fbm(vec2(uv.x * 3.0 + vSeed * 9.0, y * 2.2 - uTime * 1.9 + vSeed * 5.0));
    float n2 = fbm(vec2(uv.x * 6.0 - vSeed * 3.0, y * 4.0 - uTime * 3.1));
    // 형태: 아래 넓고 위 좁은 혀. 위로 갈수록 노이즈가 형태를 깎는다
    float cx = (uv.x - 0.5) * (1.0 + y * 1.6);
    float body = 1.0 - smoothstep(0.0, 0.5 - y * 0.15, abs(cx) + (n - 0.5) * (0.35 + y * 0.6));
    float tip = 1.0 - smoothstep(0.45, 1.0, y + (n2 - 0.5) * 0.5);
    float base = smoothstep(0.0, 0.08, y);
    float a = body * tip * base * vLife;
    if (a < 0.02) discard;
    // 색: 중심 백황 → 주황 → 붉음 → 검붉음(위)
    float heat = a * (1.4 - y * 0.9) + (n2 - 0.5) * 0.3;
    vec3 col = mix(vec3(0.75, 0.06, 0.02), vec3(1.0, 0.45, 0.08), smoothstep(0.15, 0.6, heat));
    col = mix(col, vec3(1.0, 0.92, 0.7), smoothstep(0.75, 1.15, heat));
    gl_FragColor = vec4(col * a * 1.15, 1.0);
  }
`;

const EMBER_VERT = /* glsl */`
  attribute vec3 aBase; attribute vec4 aRand; attribute float aBorn;   // aRand: phase, speed, sway, size
  uniform float uTime, uPx; varying float vA;
  void main() {
    float on = step(0.0, aBorn) * clamp((uTime - aBorn) / 2.0, 0.0, 1.0);
    float life = 2.2 + aRand.y * 2.0;
    float t = fract(uTime / life + aRand.x);
    float h = t * (5.0 + aRand.y * 5.0);
    vec3 p = aBase; p.y += h + 0.4;
    p.x += sin(uTime * (1.3 + aRand.z) + aRand.x * 40.0) * (0.3 + t * 1.2) + (aRand.z - 0.5) * 1.4 * t;
    p.z += cos(uTime * (1.1 + aRand.w) + aRand.x * 30.0) * (0.3 + t * 1.2) + (aRand.w - 0.5) * 1.4 * t;
    vA = on * (1.0 - t) * smoothstep(0.0, 0.08, t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (2.0 + aRand.w * 3.0) * uPx * (1.0 - t * 0.6) * clamp(40.0 / -mv.z, 0.2, 3.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const EMBER_FRAG = /* glsl */`
  precision highp float; varying float vA;
  void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0 || vA < 0.01) discard;
    gl_FragColor = vec4(vec3(1.0, 0.62, 0.22) * vA * (1.0 - d * 0.6) * 1.8, 1.0); }
`;

const SMOKE_VERT = /* glsl */`
  attribute vec3 aBase; attribute vec4 aRand; attribute float aBorn;   // aRand: phase, drift x, drift z, size
  uniform float uTime; varying vec2 vUv; varying float vA; varying float vSeed;
  void main() {
    vUv = uv; vSeed = aRand.x;
    float on = step(0.0, aBorn) * clamp((uTime - aBorn - 1.0) / 3.0, 0.0, 1.0);
    float life = 7.0; float t = fract(uTime / life + aRand.x);
    vec3 c = aBase; c.y += 2.5 + t * 16.0; c.x += (aRand.y - 0.5) * 2.0 + t * t * 6.0 * (aRand.y - 0.5); c.z += (aRand.z - 0.5) * 2.0 + t * t * 6.0 * (aRand.z - 0.5);
    float s = (2.2 + aRand.w * 1.5) * (0.6 + t * 2.2);
    vec4 mv = modelViewMatrix * vec4(c, 1.0); mv.xy += position.xy * s;
    vA = on * smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.45, 1.0, t)) * 0.75;
    gl_Position = projectionMatrix * mv;
  }
`;
const SMOKE_FRAG = /* glsl */`
  precision highp float; uniform float uTime; varying vec2 vUv; varying float vA; varying float vSeed;
  ${NOISE}
  void main() {
    vec2 q = vUv - 0.5; float r = length(q) * 2.0;
    float n = fbm(vUv * 3.0 + vSeed * 17.0 + vec2(0.0, -uTime * 0.15));
    float a = (1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.7)) * vA;
    if (a < 0.01) discard;
    // 먹빛 연기: 아래는 불빛을 받아 잿빛 주황, 위는 검다(세계 레이어라 tint 만큼만 색이 배어 나온다)
    float lit = (1.0 - vUv.y) * 0.5 + 0.5;
    gl_FragColor = vec4(mix(vec3(0.03), vec3(0.34, 0.22, 0.14), lit * (1.0 - vA / 0.75 * 0.6)) * (0.6 + n * 0.8), a);
  }
`;

function discTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,140,50,1)'); gr.addColorStop(0.45, 'rgba(200,70,20,0.55)'); gr.addColorStop(1, 'rgba(120,30,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

export function createFires(scene) {
  const fires = [];
  let t = 0, slot = 0;

  // 불꽃 인스턴스
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
  const NQ = MAX_FIRES * QUADS;
  const fSeed = new THREE.InstancedBufferAttribute(new Float32Array(NQ), 1), fBorn = new THREE.InstancedBufferAttribute(new Float32Array(NQ).fill(-1e9), 1);
  quad.setAttribute('aSeed', fSeed); quad.setAttribute('aBorn', fBorn);
  const flameMat = new THREE.ShaderMaterial({ vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flames = new THREE.InstancedMesh(quad, flameMat, NQ); flames.frustumCulled = false; flames.layers.set(LAYER_SPOT); flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < NQ; i++) flames.setMatrixAt(i, z); }
  scene.add(flames);

  // 불티
  const NE = MAX_FIRES * EMBERS;
  const eg = new THREE.BufferGeometry();
  const eBase = new THREE.BufferAttribute(new Float32Array(NE * 3), 3), eRand = new THREE.BufferAttribute(new Float32Array(NE * 4), 4), eBorn = new THREE.BufferAttribute(new Float32Array(NE).fill(-1), 1);
  for (let i = 0; i < NE * 4; i++) eRand.array[i] = Math.random();
  eg.setAttribute('position', eBase); eg.setAttribute('aBase', eBase); eg.setAttribute('aRand', eRand); eg.setAttribute('aBorn', eBorn);
  const emberMat = new THREE.ShaderMaterial({ vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, uniforms: { uTime: { value: 0 }, uPx: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const embers = new THREE.Points(eg, emberMat); embers.frustumCulled = false; embers.layers.set(LAYER_SPOT); scene.add(embers);

  // 연기(세계 레이어, 빌보드 인스턴스)
  const NS = MAX_FIRES * SMOKE;
  const sq = new THREE.PlaneGeometry(1, 1);
  const sBase = new THREE.InstancedBufferAttribute(new Float32Array(NS * 3), 3), sRand = new THREE.InstancedBufferAttribute(new Float32Array(NS * 4), 4), sBorn = new THREE.InstancedBufferAttribute(new Float32Array(NS).fill(-1), 1);
  for (let i = 0; i < NS * 4; i++) sRand.array[i] = Math.random();
  sq.setAttribute('aBase', sBase); sq.setAttribute('aRand', sRand); sq.setAttribute('aBorn', sBorn);
  const smokeMat = new THREE.ShaderMaterial({ vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false });
  const smoke = new THREE.InstancedMesh(sq, smokeMat, NS); smoke.frustumCulled = false; smoke.renderOrder = 5; scene.add(smoke);

  // 바닥 발광 + 실광원 3
  const disc = discTexture();
  const lights = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xff8a3c, 0, 30, 1.7); l.position.y = 3.5; scene.add(l); return l; });

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function ignite(x, z, radius) {
    const k = slot; slot = (slot + 1) % MAX_FIRES;
    const old = fires.find((f) => f.k === k); if (old) { old.disc.removeFromParent(); fires.splice(fires.indexOf(old), 1); }
    const r = Math.max(2.2, radius);
    for (let j = 0; j < QUADS; j++) {
      const i = k * QUADS + j, big = j < 3;
      const a = big ? j * (Math.PI / 3) : Math.random() * Math.PI, ox = big ? (Math.random() - 0.5) * r * 0.3 : (Math.random() - 0.5) * r * 1.2, oz = big ? (Math.random() - 0.5) * r * 0.3 : (Math.random() - 0.5) * r * 1.2;
      const w = big ? r * 2.6 : r * 0.9, h = big ? 2.4 + r * 1.0 : 1.2 + r * 0.5;   // 집 불은 높이보다 폭 — 기둥처럼 솟으면 횃불로 읽힌다
      _q.setFromAxisAngle(UP, a); _p.set(x + ox, 0.1, z + oz); _s.set(w, h, 1); _m.compose(_p, _q, _s); flames.setMatrixAt(i, _m);
      fSeed.setX(i, Math.random()); fBorn.setX(i, t);
    }
    flames.instanceMatrix.needsUpdate = true; fSeed.needsUpdate = true; fBorn.needsUpdate = true;
    for (let j = 0; j < EMBERS; j++) { const i = k * EMBERS + j, a = Math.random() * Math.PI * 2, rr = Math.random() * r * 0.8; eBase.setXYZ(i, x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr); eBorn.setX(i, t); }
    eBase.needsUpdate = true; eBorn.needsUpdate = true;
    for (let j = 0; j < SMOKE; j++) { const i = k * SMOKE + j, a = Math.random() * Math.PI * 2, rr = Math.random() * r * 0.5; sBase.setXYZ(i, x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr); sBorn.setX(i, t); }
    sBase.needsUpdate = true; sBorn.needsUpdate = true;
    const dm = new THREE.Mesh(new THREE.PlaneGeometry(r * 3.2, r * 3.2), new THREE.MeshBasicMaterial({ map: disc, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    dm.rotation.x = -Math.PI / 2; dm.position.set(x, 0.06, z); dm.layers.set(LAYER_SPOT); scene.add(dm);
    fires.push({ k, x, z, r, disc: dm, born: t, phase: Math.random() * 7 });
  }

  function update(dt, vx = 0, vz = 0) {
    t += dt;
    flameMat.uniforms.uTime.value = t; emberMat.uniforms.uTime.value = t; smokeMat.uniforms.uTime.value = t;
    for (const f of fires) f.disc.material.opacity = 0.55 + 0.15 * Math.sin(t * 3.1 + f.phase) + 0.08 * Math.sin(t * 7.7 + f.phase * 2);
    // 가까운 화재 3곳에 실광원
    const near = fires.slice().sort((a, b) => Math.hypot(a.x - vx, a.z - vz) - Math.hypot(b.x - vx, b.z - vz));
    for (let i = 0; i < lights.length; i++) {
      const f = near[i], L = lights[i];
      if (!f) { L.intensity = 0; continue; }
      L.position.set(f.x, 2.5 + f.r * 0.4, f.z);
      const ramp = Math.min(1, (t - f.born) / 2);
      L.intensity = ramp * f.r * 22 * (0.8 + 0.14 * Math.sin(t * 5.3 + f.phase) + 0.06 * Math.sin(t * 13.1 + f.phase * 3));
    }
  }
  function setPixelRatio(p) { emberMat.uniforms.uPx.value = p; }

  return { ignite, update, fires, setPixelRatio };
}
