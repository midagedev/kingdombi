// 폭발(2026-09-03 AAA 룩 5차): 신기전 착탄·폭탄 좀비가 같은 폭발을 쓴다. 옛 것은 스프라이트 원 하나 + 링 하나 + 회색 스프라이트 연기였다.
//   화구: 빌보드 인스턴스 셰이더 — fbm 로 찢어진 불덩이가 0.5초에 부풀며 백황→주황→검붉음으로 식고 연기로 바뀐다(스팟 레이어, 가산)
//   불티: Points — 방사형으로 튀어 중력에 떨어지며 꼬리 없이 작아진다(스팟)
//   충격파: 바닥 링 — 부드러운 가장자리 텍스처, 0.35초에 반경 ×12(스팟)
//   연기: 빌보드 인스턴스 — 검은 덩어리 6개가 천천히 오르며 커진다(세계 레이어 → 잉크 먹 기둥)
//   그을음: 바닥 검은 원(세계 레이어), 새벽까지 남는다
//   실광원: 가장 최근 폭발 하나(0.4초)
import * as THREE from 'three';
import { LAYER_SPOT } from './look.js';

const MAX = 12, SPARKS = 48, PUFFS = 6, SCORCH = 40;

const NOISE = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += vnoise(p) * a; p = p * 2.07 + 5.1; a *= 0.5; } return v; }
`;
const BILL_VERT = /* glsl */`
  attribute vec4 aInfo;   // born, radius, seed, kind(0 화구 1 연기)
  uniform float uTime; varying vec2 vUv; varying float vAge; varying float vSeed; varying float vKind;
  void main() {
    vUv = uv; vSeed = aInfo.z; vKind = aInfo.w;
    float life = vKind > 0.5 ? 2.6 : 0.75;
    float age = (uTime - aInfo.x) / life; vAge = age;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float s = vKind > 0.5 ? aInfo.y * (0.8 + age * 2.4) : aInfo.y * (0.35 + 1.65 * pow(min(age, 1.0), 0.45));
    if (age < 0.0 || age > 1.0) s = 0.0;
    mv.xy += position.xy * s; if (vKind > 0.5) mv.y += age * aInfo.y * 1.6;
    gl_Position = projectionMatrix * mv;
  }
`;
const FIRE_FRAG = /* glsl */`
  precision highp float; uniform float uTime; varying vec2 vUv; varying float vAge; varying float vSeed; varying float vKind;
  ${NOISE}
  void main() {
    vec2 q = vUv - 0.5; float r = length(q) * 2.0;
    float n = fbm(vUv * 3.5 + vSeed * 23.0 + vec2(0.0, -vAge * 1.5));
    float n2 = fbm(vUv * 7.0 - vSeed * 11.0 + vAge * 2.0);
    // 가장자리가 노이즈로 찢어지고, 나이 들수록 속이 비어 껍질만 남는다
    float edge = 1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.9);
    float hollow = smoothstep(0.0, 0.6, vAge) * (1.0 - smoothstep(0.0, 0.5 + vAge * 0.4, r));
    float a = clamp(edge - hollow * 0.8, 0.0, 1.0) * (1.0 - smoothstep(0.55, 1.0, vAge));
    if (a < 0.02) discard;
    float heat = (1.0 - vAge * 1.3) * (1.0 - r * 0.6) + (n2 - 0.5) * 0.5;
    vec3 col = mix(vec3(0.35, 0.03, 0.01), vec3(1.0, 0.42, 0.06), smoothstep(0.0, 0.5, heat));
    col = mix(col, vec3(1.0, 0.95, 0.8), smoothstep(0.7, 1.1, heat));
    gl_FragColor = vec4(col * a * 1.3, 1.0);
  }
`;
const SMOKE_FRAG = /* glsl */`
  precision highp float; uniform float uTime; varying vec2 vUv; varying float vAge; varying float vSeed; varying float vKind;
  ${NOISE}
  void main() {
    vec2 q = vUv - 0.5; float r = length(q) * 2.0;
    float n = fbm(vUv * 3.0 + vSeed * 17.0 + vec2(0.0, -vAge * 0.6));
    float a = (1.0 - smoothstep(0.3, 1.0, r + (n - 0.5) * 0.8)) * smoothstep(0.0, 0.08, vAge) * (1.0 - smoothstep(0.4, 1.0, vAge)) * 0.85;
    if (a < 0.01) discard;
    // 처음엔 불빛을 받아 잿빛 주황, 곧 검어진다
    vec3 col = mix(vec3(0.45, 0.28, 0.16), vec3(0.03), smoothstep(0.0, 0.35, vAge)) * (0.5 + n * 0.8);
    gl_FragColor = vec4(col, a);
  }
`;
const SPARK_VERT = /* glsl */`
  attribute vec3 aVel; attribute vec2 aInfo;   // born, size
  uniform float uTime, uPx; varying float vA;
  void main() {
    float age = uTime - aInfo.x; float life = 0.9;
    float t = clamp(age / life, 0.0, 1.0);
    vec3 p = position + aVel * age * (1.0 - 0.45 * t); p.y -= 9.0 * age * age;
    vA = (age < 0.0 || age > life) ? 0.0 : (1.0 - t) * (1.0 - t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aInfo.y * uPx * (1.0 - t * 0.5) * clamp(40.0 / -mv.z, 0.25, 3.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const SPARK_FRAG = /* glsl */`
  precision highp float; varying float vA;
  void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0 || vA < 0.01) discard; gl_FragColor = vec4(vec3(1.0, 0.72, 0.3) * vA * (1.2 - d * 0.7) * 1.6, 1.0); }
`;

function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 40, 64, 64, 64); gr.addColorStop(0, 'rgba(255,200,120,0)'); gr.addColorStop(0.55, 'rgba(255,190,110,0.9)'); gr.addColorStop(0.8, 'rgba(255,140,60,0.5)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function scorchTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), img = g.createImageData(128, 128), d = img.data;
  const h = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const u = x / 64 - 1, v = y / 64 - 1, r = Math.hypot(u, v); const n = h(Math.floor(x / 6), Math.floor(y / 6)) * 0.5; const a = Math.max(0, Math.min(1, (1 - r) * 2.2 - n)); const o = (y * 128 + x) * 4; d[o] = d[o + 1] = d[o + 2] = 8; d[o + 3] = 255 * a * 0.85; }
  g.putImageData(img, 0, 0); return new THREE.CanvasTexture(c);
}

export function createExplosions(scene) {
  let t = 0;
  const quad = new THREE.PlaneGeometry(1, 1);
  const mk = (n, frag, layer, extra = {}) => {
    const g = quad.clone(); const info = new THREE.InstancedBufferAttribute(new Float32Array(n * 4).fill(-1e9), 4); info.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aInfo', info);
    const mat = new THREE.ShaderMaterial({ vertexShader: BILL_VERT, fragmentShader: frag, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, ...extra });
    const m = new THREE.InstancedMesh(g, mat, n); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); if (layer) m.layers.set(layer);
    { const z = new THREE.Matrix4(); for (let i = 0; i < n; i++) m.setMatrixAt(i, z); }
    scene.add(m); return { m, info, mat, cur: 0, n };
  };
  const fire = mk(MAX * 2, FIRE_FRAG, LAYER_SPOT, { blending: THREE.AdditiveBlending });
  const smoke = mk(MAX * PUFFS, SMOKE_FRAG, 0); smoke.m.renderOrder = 6;

  // 불티
  const NS = MAX * SPARKS, sg = new THREE.BufferGeometry();
  const sPos = new THREE.BufferAttribute(new Float32Array(NS * 3), 3), sVel = new THREE.BufferAttribute(new Float32Array(NS * 3), 3), sInfo = new THREE.BufferAttribute(new Float32Array(NS * 2).fill(-1e9), 2);
  sg.setAttribute('position', sPos); sg.setAttribute('aVel', sVel); sg.setAttribute('aInfo', sInfo);
  const sparkMat = new THREE.ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, uniforms: { uTime: { value: 0 }, uPx: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks = new THREE.Points(sg, sparkMat); sparks.frustumCulled = false; sparks.layers.set(LAYER_SPOT); scene.add(sparks); let sparkCur = 0;

  // 충격파 링 + 그을음
  const ringTex = ringTexture(), rings = [], ringBorn = new Float32Array(MAX).fill(-1e9); let ringCur = 0;
  for (let i = 0; i < MAX; i++) { const m = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.visible = false; m.layers.set(LAYER_SPOT); scene.add(m); rings.push(m); }
  const scorchTex = scorchTexture();
  const scorch = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), SCORCH); scorch.frustumCulled = false; let scorchCur = 0;
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < SCORCH; i++) scorch.setMatrixAt(i, z); } scene.add(scorch);
  const light = new THREE.PointLight(0xffa050, 0, 40, 1.6); scene.add(light); let lightBorn = -1e9;

  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(-Math.PI / 2, 0, 0);
  function put(slot, x, y, z, r, seed, kind) {
    const i = slot.cur; slot.cur = (slot.cur + 1) % slot.n;
    _p.set(x, y, z); _q.identity(); _m.compose(_p, _q, _s); slot.m.setMatrixAt(i, _m); slot.info.setXYZW(i, t, r, seed, kind);
    slot.m.instanceMatrix.needsUpdate = true; slot.info.needsUpdate = true;
  }
  /** 폭발. r = 화구 반경(m). big 이면 연기·불티가 더 많다 */
  function boom(x, y, z, r = 4, big = false) {
    put(fire, x, y + r * 0.35, z, r, Math.random(), 0);
    put(fire, x + (Math.random() - 0.5) * r * 0.6, y + r * 0.7, z + (Math.random() - 0.5) * r * 0.6, r * 0.7, Math.random(), 0);
    for (let k = 0; k < PUFFS; k++) { const a = Math.random() * 6.283, rr = Math.random() * r * 0.5; put(smoke, x + Math.cos(a) * rr, y + r * 0.4 + Math.random() * r * 0.4, z + Math.sin(a) * rr, r * (0.55 + Math.random() * 0.4), Math.random(), 1); }
    const n = big ? SPARKS : SPARKS >> 1;
    for (let k = 0; k < n; k++) {
      const i = sparkCur; sparkCur = (sparkCur + 1) % NS;
      const a = Math.random() * 6.283, el = Math.random() * 1.2 + 0.2, sp = r * (2.0 + Math.random() * 4.0);
      sPos.setXYZ(i, x, y + 0.5, z); sVel.setXYZ(i, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp); sInfo.setXY(i, t, 2.0 + Math.random() * 3.0);
    }
    sPos.needsUpdate = true; sVel.needsUpdate = true; sInfo.needsUpdate = true;
    const ri = ringCur; ringCur = (ringCur + 1) % MAX; rings[ri].position.set(x, 0.1, z); rings[ri].visible = true; ringBorn[ri] = t; rings[ri].userData.r = r;
    const si = scorchCur; scorchCur = (scorchCur + 1) % SCORCH; _p.set(x, 0.012 + (si % 5) * 0.002, z); _q.setFromEuler(_e); _s.setScalar(r * 1.8); _m.compose(_p, _q, _s); scorch.setMatrixAt(si, _m); scorch.instanceMatrix.needsUpdate = true; _s.set(1, 1, 1);
    light.position.set(x, y + 2, z); lightBorn = t; light.userData.r = r;
  }
  function update(dt) {
    t += dt; fire.mat.uniforms.uTime.value = t; smoke.mat.uniforms.uTime.value = t; sparkMat.uniforms.uTime.value = t;
    for (let i = 0; i < MAX; i++) { if (!rings[i].visible) continue; const a = (t - ringBorn[i]) / 0.38; if (a > 1) { rings[i].visible = false; continue; } const sc = rings[i].userData.r * (0.4 + 3.2 * Math.sqrt(a)); rings[i].scale.set(sc, sc, 1); rings[i].material.opacity = 1 - a; }
    const la = (t - lightBorn) / 0.45; light.intensity = la < 1 ? (light.userData.r || 4) * 60 * (1 - la) * (1 - la) : 0;
  }
  function setPixelRatio(p) { sparkMat.uniforms.uPx.value = p; }
  return { boom, update, setPixelRatio };
}
