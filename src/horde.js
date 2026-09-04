// 좀비떼: 절차생성 저폴리 인체 1개 geometry 를 InstancedMesh 로 수백 마리 그린다.
// 애니메이션은 뼈 id(aBone) 기준 정점 셰이더 절차 동작(킹덤식 — 몸 꺾인 전력 질주).
// 살아있는 좀비는 물리 몸체 없이 조향(seek + 분리 + 건물 회피)으로 움직인다. 죽으면 physics 시체 풀로 넘어간다.
import * as THREE from 'three';
import { LAYER_SPOT } from './look.js';
import { CORPSE_POOL } from './physics.js';

// ── 인체 geometry: 뼈별 박스 ──
// 뼈: 0 pelvis, 1 torso, 2 head, 3/4 upperArm L/R, 5/6 lowerArm L/R, 7/8 upperLeg L/R, 9/10 lowerLeg L/R
const BONES = [
  { id: 0, size: [0.34, 0.22, 0.22], at: [0, 0.98, 0] },
  { id: 1, size: [0.40, 0.50, 0.24], at: [0, 1.32, 0] },
  { id: 2, size: [0.22, 0.26, 0.24], at: [0, 1.72, 0.02] },
  { id: 3, size: [0.11, 0.32, 0.11], at: [-0.27, 1.38, 0] },
  { id: 4, size: [0.11, 0.32, 0.11], at: [0.27, 1.38, 0] },
  { id: 5, size: [0.10, 0.34, 0.10], at: [-0.27, 1.05, 0] },
  { id: 6, size: [0.10, 0.34, 0.10], at: [0.27, 1.05, 0] },
  { id: 7, size: [0.15, 0.46, 0.15], at: [-0.11, 0.66, 0] },
  { id: 8, size: [0.15, 0.46, 0.15], at: [0.11, 0.66, 0] },
  { id: 9, size: [0.13, 0.46, 0.13], at: [-0.11, 0.23, 0] },
  { id: 10, size: [0.13, 0.46, 0.13], at: [0.11, 0.23, 0] },
];

function tag(g, id, acc = 0) { if (g.index) g = g.toNonIndexed(); const n = g.attributes.position.count; g.setAttribute("aBone", new THREE.Float32BufferAttribute(new Float32Array(n).fill(id + acc * 16), 1)); return g; }   // aBone = 뼈 + 부속×16(속성 한도 16개라 묶는다). acc: 0 몸 · 1 갓(iLook 1 만) · 2 풀어진 긴 머리(iLook 2 만) · 3 뒷머리(항상, 검정)
// 좀비 본체 재조형(2026-09-03 AAA 룩): 상자 11개 → 마디 원기둥·관절 구·굽은 몸통·두개골+턱·찢어진 옷·머리카락. 뼈 중심·관절 축(animate/deadPose/bonePivot 의 0.46·0.9·1.05·1.22·1.54·1.58)은 그대로.
// 광선 판정 캡슐(r 0.58 · h 1.95)도 그대로. 한 마리 ≈ 900 tri.
const mv = (g, x, y, z) => { g.translate(x, y, z); return g; };
const sph = (r, sx = 1, sy = 1, sz = 1, w = 7, h = 5) => { const g = new THREE.SphereGeometry(r, w, h); g.scale(sx, sy, sz); return g; };
const seg = (rTop, rBot, h) => new THREE.CylinderGeometry(rTop, rBot, h, 8, 1);
function buildZombieGeometry() {
  const parts = [];
  const add = (g, id, acc = 0) => parts.push(tag(g, id, acc));
  // 골반 0: 눌린 구 + 늘어진 옷 조각 5장(양면 재질)
  add(mv(sph(0.17, 1.0, 0.62, 0.7), 0, 0.98, 0), 0);
  for (let k = 0; k < 5; k++) { const a = k * 1.257 + 0.3, l = 0.28 + (k % 2) * 0.14; const pl = new THREE.PlaneGeometry(0.11, l, 1, 2); pl.translate(0, -l / 2, 0); pl.rotateY(-a); pl.translate(Math.cos(a) * 0.17, 0.95, Math.sin(a) * 0.15); add(pl, 0); }
  // 몸통 1: 앞으로 굽은 가슴(구) + 어깨 근육 둘 + 등 굽이
  add(mv(sph(0.2, 1.0, 1.3, 0.62, 8, 6), 0, 1.31, 0), 1);
  add(mv(sph(0.075, 1, 0.8, 1), -0.2, 1.5, 0), 1); add(mv(sph(0.075, 1, 0.8, 1), 0.2, 1.5, 0), 1);
  add(mv(sph(0.12, 1.0, 1.2, 0.7, 6, 4), 0, 1.4, -0.09), 1);   // 등 굽이(곱사등)
  // 머리 2: 두개골 + 아래턱 + 뒷머리 머리카락 조각 3
  add(mv(sph(0.115, 0.92, 1.05, 1.0, 8, 6), 0, 1.75, 0.02), 2);
  add(mv(new THREE.BoxGeometry(0.13, 0.055, 0.12), 0, 1.635, 0.06), 2);
  for (let k = 0; k < 3; k++) { const a = Math.PI + (k - 1) * 0.7, l = 0.22 + k * 0.05; const pl = new THREE.PlaneGeometry(0.07, l, 1, 2); pl.translate(0, -l / 2, 0); pl.rotateY(-a); pl.translate(Math.cos(a) * 0.09, 1.8, Math.sin(a) * 0.09 + 0.02); add(pl, 2, 3); }
  // 팔: 위팔(어깨 구 1.54 관절) · 아래팔(팔꿈치 구 1.22 관절 + 손)
  for (const sx of [-1, 1]) {
    add(mv(sph(0.06, 1, 1, 1, 6, 4), sx * 0.27, 1.54, 0), sx < 0 ? 3 : 4); add(mv(seg(0.052, 0.045, 0.3), sx * 0.27, 1.38, 0), sx < 0 ? 3 : 4);
    add(mv(sph(0.05, 1, 1, 1, 6, 4), sx * 0.27, 1.22, 0), sx < 0 ? 5 : 6); add(mv(seg(0.044, 0.038, 0.32), sx * 0.27, 1.05, 0), sx < 0 ? 5 : 6);
    add(mv(new THREE.BoxGeometry(0.07, 0.08, 0.05), sx * 0.27, 0.86, 0.01), sx < 0 ? 5 : 6);
    // 다리: 허벅지(엉덩이 구 0.9) · 종아리(무릎 구 0.46 + 발)
    add(mv(sph(0.075, 1, 1, 1, 6, 4), sx * 0.11, 0.9, 0), sx < 0 ? 7 : 8); add(mv(seg(0.07, 0.058, 0.44), sx * 0.11, 0.67, 0), sx < 0 ? 7 : 8);
    add(mv(sph(0.06, 1, 1, 1, 6, 4), sx * 0.11, 0.46, 0), sx < 0 ? 9 : 10); add(mv(seg(0.055, 0.048, 0.42), sx * 0.11, 0.24, 0), sx < 0 ? 9 : 10);
    add(mv(new THREE.BoxGeometry(0.1, 0.06, 0.2), sx * 0.11, 0.03, 0.04), sx < 0 ? 9 : 10);
  }
  // 조선 좀비(2026-09-04): 뿔·발톱·가슴 코어(데몬 문법)를 걷어냈다 — 자주색 발광체는 외계인으로 읽혔다. 대신 갓(iLook 1)과 풀어진 긴 머리(iLook 2)를 인스턴스마다 켜고 끈다(BODY_VERT 가 안 쓰는 부속을 머리 관절로 접는다).
  { const brim = new THREE.CylinderGeometry(0.24, 0.24, 0.012, 14, 1); brim.translate(0, 1.845, 0.01); add(brim, 2, 1);
    const crown = new THREE.CylinderGeometry(0.085, 0.095, 0.14, 10, 1); crown.translate(0, 1.92, 0.01); add(crown, 2, 1); }
  for (let k = 0; k < 6; k++) { const a = Math.PI + (k - 2.5) * 0.5, l = 0.42 + (k % 3) * 0.08; const pl = new THREE.PlaneGeometry(0.075, l, 1, 3); pl.translate(0, -l / 2, 0); pl.rotateZ((k % 2 ? 1 : -1) * 0.12); pl.rotateY(-a); pl.translate(Math.cos(a) * 0.1, 1.82, Math.sin(a) * 0.1 + 0.02); add(pl, 2, 2); }
  { const fr = new THREE.PlaneGeometry(0.06, 0.3, 1, 2); fr.translate(0.05, 1.7, 0.12); fr.rotateY(0.3); add(fr, 2, 2); }   // 얼굴 앞으로 흘러내린 머리 한 가닥
  // 수동 병합 (BufferGeometryUtils 없이: 속성 셋이 동일)
  const total = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), bone = new Float32Array(total);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); bone.set(g.attributes.aBone.array, o);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aBone', new THREE.BufferAttribute(bone, 1));
  geo.computeBoundingSphere();
  return geo;
}

// 정점 셰이더 공통부: 뼈 계층 절차 애니메이션. uDead=1 이면 널브러진 자세(시체 인스턴스용).
const ANIM_GLSL = /* glsl */`
  attribute float aBone;    // 뼈 + 부속×16 (부속: 1 갓 · 2 긴 머리 · 3 뒷머리)
  attribute float iPhase;   // 개체 위상
  attribute float iSpeed;   // 걸음 주파수 배율
  attribute float iHit;     // 피격 시각
  attribute float iType;    // (0 보통 1 거대 2 폭탄 3 질주) + 차림×4 (차림: 0 맨머리 · 1 갓 · 2 풀어진 머리)
  attribute vec2 iHitInfo;  // 마지막 피격: x = 좌우(−1..1, 모델 기준) · y = 높이(0..2 m)
  attribute float iGone;    // 잃은 뼈 비트마스크(2 머리 · 3/5 왼팔 · 4/6 오른팔)
  attribute float iWind;    // 덤벼들기 웅크림 시작 시각(0 = 아님) — 붉게 웅크리다 튄다(2026-09-03 掃 루프)
  varying float vWind; varying float vAcc; varying float vPhase;
  uniform float uTime; uniform float uDead;
  float goneBit(float bone) { return step(1.0, mod(floor(iGone / pow(2.0, bone)), 2.0)); }   // 2의 거듭제곱 나눗셈은 float 에서 정확 — 반올림을 넣으면 아래 비트가 위로 샌다
  vec3 bonePivot(float bone) { if (bone == 2.0) return vec3(0.0, 1.58, 0.0); if (bone == 3.0 || bone == 5.0) return vec3(-0.27, 1.54, 0.0); return vec3(0.27, 1.54, 0.0); }
  uniform vec3 uAimO, uAimD; uniform float uAimT;   // 조준 광선(총구 원점·방향·첫 차단물까지 거리) — 광선 위에 선 좀비는 vMark=1 로 표시된다
  varying vec3 vModel; varying vec3 vNormalW; varying float vBone; varying float vHit; varying float vType; varying vec3 vWorld; varying float vMark;

  // 인스턴스 자리(행렬 4열)와 광선의 xz 최근접점: 옆으로 반지름 안이고, 차단물보다 앞이면 '쏘면 맞는' 좀비. 시체(uDead)는 제외.
  float aimMark() {
    vec3 ip = (modelMatrix * instanceMatrix)[3].xyz; float isc = length(instanceMatrix[0].xyz);
    vec2 d2 = uAimD.xz; float a = max(dot(d2, d2), 1e-4);
    float along = dot(ip.xz - uAimO.xz, d2) / a;
    float lat = length(uAimO.xz + d2 * along - ip.xz);
    float yAt = uAimO.y + uAimD.y * along;
    float hOk = step(-0.2, yAt) * step(yAt, 2.1 * isc);
    float near = 0.4 * clamp((14.0 - along) / 14.0, 0.0, 1.0);   // horde.raycast 와 같은 근접 보정
    return (1.0 - uDead) * step(0.0, along) * step(along, uAimT + 0.6) * (1.0 - smoothstep(0.6 * isc + near, 0.95 * isc + near, lat)) * hOk;
  }

  vec3 rotX(vec3 p, vec3 piv, float a) { p -= piv; float c = cos(a), s = sin(a); return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z) + piv; }
  vec3 rotZ(vec3 p, vec3 piv, float a) { p -= piv; float c = cos(a), s = sin(a); return vec3(c*p.x - s*p.y, s*p.x + c*p.y, p.z) + piv; }

  vec3 animate(vec3 p, float bone) {
    float t = uTime * (9.5 * iSpeed) + iPhase * 6.2831;
    float sL = sin(t), sR = sin(t + 3.1416);
    float jerk = sin(t * 2.0 + iPhase * 7.0) * 0.12;                      // 경련
    // 하지: 달리기. 무릎은 뒤로 접힌다.
    if (bone == 9.0) p = rotX(p, vec3(-0.11, 0.46, 0.0), max(0.0, -sL) * 1.6);
    if (bone == 10.0) p = rotX(p, vec3(0.11, 0.46, 0.0), max(0.0, -sR) * 1.6);
    if (bone == 7.0 || bone == 9.0) p = rotX(p, vec3(-0.11, 0.9, 0.0), sL * 1.05 + 0.25);
    if (bone == 8.0 || bone == 10.0) p = rotX(p, vec3(0.11, 0.9, 0.0), sR * 1.05 + 0.25);
    // 팔: 앞으로 뻗어 허우적. 팔꿈치 꺾임.
    float aL = sin(t + 1.2 + iPhase * 3.0), aR = sin(t + 4.4 + iPhase * 5.0);
    if (bone == 5.0) p = rotX(p, vec3(-0.27, 1.22, 0.0), -0.9 - max(0.0, aL) * 1.1);
    if (bone == 6.0) p = rotX(p, vec3(0.27, 1.22, 0.0), -0.9 - max(0.0, aR) * 1.1);
    if (bone == 3.0 || bone == 5.0) { p = rotX(p, vec3(-0.27, 1.54, 0.0), -1.4 + aL * 0.9); p = rotZ(p, vec3(-0.27, 1.54, 0.0), -0.45 + jerk); }
    if (bone == 4.0 || bone == 6.0) { p = rotX(p, vec3(0.27, 1.54, 0.0), -1.4 + aR * 0.9); p = rotZ(p, vec3(0.27, 1.54, 0.0), 0.45 - jerk); }
    // 머리: 꺾여 덜렁거림
    if (bone == 2.0) { p = rotX(p, vec3(0.0, 1.58, 0.0), 0.35 + sin(t * 2.0 + 1.0) * 0.35); p = rotZ(p, vec3(0.0, 1.58, 0.0), sin(t * 1.3 + iPhase * 9.0) * 0.55); }
    // 상체: 앞으로 굽음 + 좌우 비틀림
    if (bone >= 1.0 && bone <= 6.0) { p = rotX(p, vec3(0.0, 1.05, 0.0), 0.62 + jerk * 2.0); p = rotZ(p, vec3(0.0, 1.05, 0.0), sin(t) * 0.12); }
    // 피격 움찔(2026-09-03): 상체가 총알 반대쪽으로 꺾이고 맞은 쪽으로 비틀린다. 머리를 맞으면 고개가 뒤로 젖혀진다
    float fl = exp(-(uTime - iHit) * 9.0);
    if (bone >= 1.0 && bone <= 6.0) { p = rotX(p, vec3(0.0, 1.05, 0.0), -0.5 * fl); p = rotZ(p, vec3(0.0, 1.05, 0.0), iHitInfo.x * 0.5 * fl); }
    if (bone == 2.0) p = rotX(p, vec3(0.0, 1.58, 0.0), -0.9 * fl * smoothstep(1.35, 1.6, iHitInfo.y));
    // 덤벼들기(2026-09-03): 웅크림 0→1 동안 상체를 더 굽히고 팔을 머리 위로, 무릎을 굽혀 낮아진 뒤 마지막에 앞(+z)으로 튄다 — 0.8초 텔
    float w = iWind > 0.0 ? clamp((uTime - iWind) * 0.72, 0.0, 1.0) : 0.0;
    if (w > 0.0) {
      if (bone >= 3.0 && bone <= 6.0) p = rotX(p, vec3(0.0, 1.54, 0.0), -1.3 * w);
      if (bone >= 1.0 && bone <= 6.0) p = rotX(p, vec3(0.0, 1.05, 0.0), 0.45 * w);
      p.y -= 0.22 * w; p.z += 0.45 * w * w * w;
    }
    // 골반 바운스
    p.y += abs(sin(t)) * 0.07 - 0.05;
    return p;
  }

  vec3 deadPose(vec3 p, float bone) {
    // 널브러진 시체: 사지 벌어지고 머리 꺾임 (모델 공간, 몸체 회전은 인스턴스 행렬이 맡는다)
    float h = iPhase * 6.2831;
    if (bone == 3.0 || bone == 5.0) p = rotZ(p, vec3(-0.27, 1.54, 0.0), -1.2 + sin(h) * 0.5);
    if (bone == 4.0 || bone == 6.0) p = rotZ(p, vec3(0.27, 1.54, 0.0), 1.2 + cos(h) * 0.5);
    if (bone == 5.0) p = rotX(p, vec3(-0.27, 1.22, 0.0), -0.8);
    if (bone == 6.0) p = rotX(p, vec3(0.27, 1.22, 0.0), -0.5);
    if (bone == 7.0 || bone == 9.0) p = rotZ(p, vec3(-0.11, 0.9, 0.0), -0.35 + sin(h * 2.0) * 0.2);
    if (bone == 8.0 || bone == 10.0) p = rotZ(p, vec3(0.11, 0.9, 0.0), 0.3);
    if (bone == 9.0) p = rotX(p, vec3(-0.11, 0.46, 0.0), 0.9);
    if (bone == 2.0) p = rotZ(p, vec3(0.0, 1.58, 0.0), 0.9 * sign(sin(h)));
    // 몸 중심을 원점으로: 물리 몸체 중심(0.9m)에 맞춘다
    p.y -= 0.9;
    return p;
  }
`;

const BODY_VERT = ANIM_GLSL + /* glsl */`
  void main() {
    float acc = floor(aBone / 16.0), bone = aBone - acc * 16.0, look = floor(iType / 4.0), ty = iType - look * 4.0;
    vBone = bone; vHit = iHit; vType = ty; vMark = aimMark(); vAcc = acc; vPhase = iPhase;
    vWind = (iWind > 0.0 && uDead < 0.5) ? clamp((uTime - iWind) * 0.72, 0.0, 1.0) : 0.0;
    vec3 p = uDead > 0.5 ? deadPose(position, bone) : animate(position, bone);
    float hideAcc = ((acc == 1.0 && look != 1.0) || (acc == 2.0 && look != 2.0)) ? 1.0 : 0.0;   // 이 개체가 안 쓰는 갓·긴 머리는 접는다
    if (bone >= 2.0 && bone <= 6.0) p = mix(p, uDead > 0.5 ? bonePivot(bone) - vec3(0.0, 0.9, 0.0) : bonePivot(bone), max(goneBit(bone), hideAcc));   // 잃은 사지는 관절점으로 접혀 사라진다
    float shred = exp(-(uTime - iHit) * 16.0) * (1.0 - uDead);
    p.xz += vec2(sin(uTime * 190.0 + position.y * 31.0), cos(uTime * 163.0 + position.x * 27.0)) * 0.06 * shred;
    vModel = position;
    vec4 wp = instanceMatrix * vec4(p, 1.0);
    vWorld = (modelMatrix * wp).xyz;
    vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * wp;
  }
`;

// 몸체(2026-09-04 조선 좀비): 흰 삼베옷 + 창백한 살 + 검은 머리/갓 + 마른 피. 잉크 커브 앞의 명도라 옷은 밝은 회색, 피는 검붉게 나온다.
//   전엔 0.08 먹색 실루엣 하나였다 — 옷이 없으니 사람이었던 것으로 읽히지 않았다.
const BODY_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uMoonDir; uniform float uTime; uniform float uBolt;
  varying vec3 vModel; varying vec3 vNormalW; varying float vBone; varying float vHit; varying vec3 vWorld; varying float vAcc; varying float vPhase; varying float vType;
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 n = normalize(vNormalW);
    float top = max(0.0, dot(n, uMoonDir));
    vec3 v = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(0.0, dot(n, v)), 3.0);
    float hit = exp(-(uTime - vHit) * 14.0);
    float bolt = exp(-(uTime - uBolt) * 3.5);
    // 재질: 갓·머리카락은 검정, 머리(두개골·턱)와 손은 살, 발은 짚신, 나머지는 삼베옷
    bool hair = vAcc > 0.5, head = vBone == 2.0 && !hair;
    bool hand = (vBone == 5.0 || vBone == 6.0) && vModel.y < 0.93;
    bool foot = (vBone == 9.0 || vBone == 10.0) && vModel.y < 0.08;
    vec3 alb = vec3(0.70, 0.66, 0.58);                                   // 삼베
    if (head || hand) alb = vec3(0.34, 0.37, 0.35);                      // 달빛에 바랜 죽은 살
    if (hair) alb = vec3(0.035);
    if (foot) alb = vec3(0.16, 0.13, 0.10);
    // 마른 피: 개체(vPhase)마다 다른 얼룩. 가슴 앞·소매 끝·치마 조각에 검붉게, 입가·손은 항상
    float cell = hash3(floor(vModel * 9.0 + vPhase * 31.0));
    float stain = smoothstep(0.62, 0.72, cell) * (1.0 - float(head || hair));
    if (vBone == 1.0 && vModel.z > 0.05) stain = max(stain, smoothstep(0.45, 0.6, cell));   // 가슴 앞은 더 많이
    if (hand) stain = max(stain, 0.7);
    if (head && vModel.y < 1.7 && vModel.z > 0.05) stain = max(stain, 0.8);                // 입가·턱
    alb = mix(alb, vec3(0.30, 0.03, 0.03), stain * (0.75 + 0.25 * hash3(vModel * 3.0)));
    vec3 c = alb * (0.30 + top * 0.70) + rim * 0.14 + hit * 0.65 + bolt * 0.55;            // 피격 순간 종이처럼 하얘진다 · 번개엔 온몸이 흰빛
    gl_FragColor = vec4(c, 1.0);
  }
`;

const GLOW_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime; uniform vec3 uColor; uniform vec3 uBlood; uniform float uBolt; uniform float uDead;
  varying vec3 vModel; varying vec3 vNormalW; varying float vBone; varying float vHit; varying float vType; varying vec3 vWorld; varying float vMark; varying float vWind;
  void main() {
    float g = 0.0;
    vec3 col = uColor;
    // 덤벼들기 텔: 온몸이 붉게 달아오르며 점점 빠르게 박동 — '지금 저놈을 쏘라'
    if (vWind > 0.0) { col = mix(col, uBlood, 0.85 * vWind); g += vWind * (0.7 + 0.5 * sin(uTime * (10.0 + 30.0 * vWind))); }
    float camD = length(cameraPosition - vWorld);
    vec3 n = normalize(vNormalW), v = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(0.0, dot(n, v)), 1.6);
    // (자주색 림은 뺐다 — 외계인으로 읽혔다. 가시성은 흰 삼베옷(BODY_FRAG)이 맡는다)
    // 번개(uBolt = 마지막 번개 시각): 떼 전체가 흰빛으로 확 드러나고 0.5초에 걸쳐 잦아든다
    float bolt = exp(-(uTime - uBolt) * 3.5);
    g += bolt * (0.5 + rim * 1.6); col = mix(col, vec3(0.92, 0.88, 1.0), bolt * 0.75);
    float eyeR = vType == 1.0 ? 0.085 : 0.06;
    if (vBone == 2.0) {
      // 눈: 머리 전면(+z) 두 점
      float front = smoothstep(0.08, 0.12, vModel.z);
      float e1 = length(vModel.xy - vec2(-0.055, 1.75)), e2 = length(vModel.xy - vec2(0.055, 1.75));
      float eyes = front * (smoothstep(eyeR, 0.02, e1) + smoothstep(eyeR, 0.02, e2));
      g += eyes * 1.1; col = mix(col, vec3(0.92, 0.94, 0.86), eyes);   // 흐린 흰 눈알 — 멀리선 이 두 점만 남는다
    }
    if (vType == 2.0) {
      // 폭탄 좀비: 배(몸통 앞면)가 붉게 달아오르며 점점 빠르게 박동
      float belly = smoothstep(0.30, 0.08, length(vModel.xy - vec2(0.0, 1.22))) * smoothstep(0.06, 0.12, vModel.z);
      float beat = 0.6 + 0.4 * pow(abs(sin(uTime * 5.0 + vModel.y)), 6.0);
      if (vBone == 1.0 || vBone == 0.0) { g += belly * 2.4 * beat; col = mix(col, vec3(1.0, 0.42, 0.08), belly * 1.5); }   // 불씨 주황 — 자주색은 외계인
    }
    float hit = exp(-(uTime - vHit) * 12.0);
    g += hit * 1.2;
    // 조준선 위의 좀비: 호박색 림 — '지금 쏘면 이놈이 맞는다'
    if (vMark > 0.01) {
      g += vMark * (0.5 + rim * 2.4); col = mix(col, vec3(1.0, 0.68, 0.25), vMark * 0.9);
    }
    if (g < 0.02) discard;
    gl_FragColor = vec4(col * g, 1.0);
  }
`;

// 그림자 깊이용(동일 애니메이션)
const DEPTH_FRAG = /* glsl */`
  #include <packing>
  void main() { gl_FragColor = packDepthToRGBA(gl_FragCoord.z); }
`;

export const ZOMBIE_COLOR = new THREE.Color(0xd8cfc0);   // 2026-09-04: 자주색(0xb04cff) → 뼛빛. 피격 섬광·눈빛의 바탕색

export function createHorde(scene, physics, {
  count = 320, spawn, target, buildings, path,
} = {}) {
  const geo = buildZombieGeometry();
  const N = count;
  const iPhase = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  const iSpeed = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  const iHit = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(-100), 1);
  iHit.setUsage(THREE.DynamicDrawUsage);
  const iType = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  const iHitInfo = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2); iHitInfo.setUsage(THREE.DynamicDrawUsage);
  const iWind = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); iWind.setUsage(THREE.DynamicDrawUsage);
  const iGone = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); iGone.setUsage(THREE.DynamicDrawUsage);
  const look = new Uint8Array(N);   // 0 맨머리 · 1 갓 · 2 풀어진 머리 — iType 에 ×4 로 묶어 올린다
  geo.setAttribute('iPhase', iPhase); geo.setAttribute('iSpeed', iSpeed); geo.setAttribute('iHit', iHit); geo.setAttribute('iType', iType); geo.setAttribute('iHitInfo', iHitInfo); geo.setAttribute('iGone', iGone); geo.setAttribute('iWind', iWind);

  const uniforms = { uTime: { value: 0 }, uDead: { value: 0 }, uMoonDir: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() }, uColor: { value: ZOMBIE_COLOR }, uBlood: { value: new THREE.Color(0xff2020) }, uBolt: { value: -100 }, uAimO: { value: new THREE.Vector3() }, uAimD: { value: new THREE.Vector3(0, 0, -1) }, uAimT: { value: 0 } };
  const bodyMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, uniforms, side: THREE.DoubleSide });   // 옷·머리카락 판(양면)
  const glowMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: GLOW_FRAG, uniforms, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true });
  const depthMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: DEPTH_FRAG, uniforms, side: THREE.DoubleSide });

  const body = new THREE.InstancedMesh(geo, bodyMat, N);
  body.castShadow = true; body.customDepthMaterial = depthMat; body.frustumCulled = false;
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const glow = new THREE.InstancedMesh(geo, glowMat, N);
  glow.instanceMatrix = body.instanceMatrix; glow.layers.set(LAYER_SPOT); glow.frustumCulled = false;
  scene.add(body, glow);

  // 시체 인스턴스(별도 uDead=1 재질 — uniforms 는 복제)
  const deadUniforms = { ...uniforms, uDead: { value: 1 } };
  const corpseGeo = geo.clone();
  const cPhase = new THREE.InstancedBufferAttribute(new Float32Array(CORPSE_POOL).map(() => Math.random()), 1);
  corpseGeo.setAttribute('iPhase', cPhase);
  corpseGeo.setAttribute('iSpeed', new THREE.InstancedBufferAttribute(new Float32Array(CORPSE_POOL).fill(1), 1));
  const cHit = new THREE.InstancedBufferAttribute(new Float32Array(CORPSE_POOL).fill(-100), 1); cHit.setUsage(THREE.DynamicDrawUsage);
  corpseGeo.setAttribute('iHit', cHit);
  const cType = new THREE.InstancedBufferAttribute(new Float32Array(CORPSE_POOL), 1); cType.setUsage(THREE.DynamicDrawUsage);
  corpseGeo.setAttribute('iType', cType);
  const cGone = new THREE.InstancedBufferAttribute(new Float32Array(CORPSE_POOL), 1); cGone.setUsage(THREE.DynamicDrawUsage);
  corpseGeo.setAttribute('iGone', cGone); corpseGeo.setAttribute('iHitInfo', new THREE.InstancedBufferAttribute(new Float32Array(CORPSE_POOL * 2), 2)); corpseGeo.setAttribute('iWind', new THREE.InstancedBufferAttribute(new Float32Array(CORPSE_POOL), 1));
  const corpseBodyMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, uniforms: deadUniforms, side: THREE.DoubleSide });
  const corpseGlowMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: GLOW_FRAG, uniforms: deadUniforms, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true });
  const corpseDepthMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: DEPTH_FRAG, uniforms: deadUniforms, side: THREE.DoubleSide });
  const corpseBody = new THREE.InstancedMesh(corpseGeo, corpseBodyMat, CORPSE_POOL);
  corpseBody.castShadow = true; corpseBody.customDepthMaterial = corpseDepthMat; corpseBody.frustumCulled = false;
  corpseBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const corpseGlow = new THREE.InstancedMesh(corpseGeo, corpseGlowMat, CORPSE_POOL);
  corpseGlow.instanceMatrix = corpseBody.instanceMatrix; corpseGlow.layers.set(LAYER_SPOT); corpseGlow.frustumCulled = false;
  scene.add(corpseBody, corpseGlow);

  // ── 상태 배열 ──
  const px = new Float32Array(N), pz = new Float32Array(N), vx = new Float32Array(N), vz = new Float32Array(N);
  const py = new Float32Array(N), vy = new Float32Array(N), roofB = new Array(N).fill(null), roofT = new Float32Array(N);   // roofT: 용마루에 웅크려 있는 시간(초) — 실루엣이 하늘에 걸리는 순간   // 지붕 낙하(2026-09-03): 지붕 위 좀비는 roofB 에 집 레코드, 처마를 넘으면 null 이 되고 py>0 인 동안 낙하
  const yaw = new Float32Array(N), hp = new Float32Array(N), speed = new Float32Array(N), scale = new Float32Array(N);
  const alive = new Uint8Array(N);
  const type = new Uint8Array(N);
  // 0 보통 · 1 거대(느리고 단단, 도달 시 큰 피해) · 2 폭탄(죽으면 폭발) · 3 질주(작고 빠름)
  const TYPES = [
    { speed: [3.6, 5.2], hp: [3, 5], scale: [0.9, 1.12], wind: 1.4, strike: 6 },       // wind = 도달 뒤 붉게 웅크리는 시간(초) · strike = 덤벼들어 주는 피해(한 번, 그리고 꿰여 죽는다)
    { speed: [2.0, 2.6], hp: [42, 55], scale: [2.0, 2.3], wind: 1.8, strike: 15 },
    { speed: [3.2, 4.2], hp: [3, 4], scale: [1.0, 1.15], wind: 1.2, strike: 0 },      // 폭탄: 웅크린 뒤 폭발(피해는 폭발이 준다)
    { speed: [6.5, 8.0], hp: [1.5, 2.5], scale: [0.72, 0.85], wind: 1.0, strike: 4 },
  ];
  const mix = { brute: 0.035, bomber: 0.085, runner: 0.16 };   // 정차 지점마다 연출자가 바꾼다
  const rollType = () => { const r = Math.random(); return r < mix.brute ? 1 : r < mix.brute + mix.bomber ? 2 : r < mix.brute + mix.bomber + mix.runner ? 3 : 0; };
  const respawnAt = new Float32Array(N);
  // 덤벼들기(2026-09-03 掃 루프): 1/초 누수 대신 사건. 도달 → wind 초 붉게 웅크림(텔) → 피해 한 번 → 가시에 꿰여 죽는다. 웅크린 채 죽이면 cause 'save'.
  const wind = new Float32Array(N);      // 웅크림 시작 시각(0 = 아님)
  const relocate = new Uint8Array(N);    // 낙오 재배치 대기(파 소환 수 pool 을 쓰지 않는다)
  let spawnAcc = 0;
  const stagger = new Float32Array(N);   // 피격 경직(초)
  const STOP_DIST = 7.0;                  // 여기서 멈춰 공격한다 — 총열이 내려다볼 수 있는 거리
  const corpseScale = new Float32Array(CORPSE_POOL).fill(1);
  const stats = { kills: 0, reached: 0, alive: 0, reachDamage: 0, impaled: 0, pending: 0 };
  const hooks = { onExplode: null, onKill: null, onLand: null, onLimb: null, onStrike: null };
  const gone = new Uint8Array(N);        // 잃은 뼈 비트마스크(셰이더 iGone 과 같은 값)

  function reset(i, time) {
    if (spawn.pick) { const s = spawn.pick(); px[i] = s.x; pz[i] = s.z; roofB[i] = s.roof || null; py[i] = s.roof ? s.roof.bounds.max.y - 0.5 : 0; roofT[i] = s.roof ? 1.5 + Math.random() * 4.5 : 0; }
    else { px[i] = spawn.x + (Math.random() - 0.5) * 2 * spawn.halfW; pz[i] = spawn.z - Math.random() * 30; roofB[i] = null; py[i] = 0; }
    vy[i] = 0;
    vx[i] = 0; vz[i] = 0;
    yaw[i] = 0;
    const ty = rollType(); type[i] = ty; const T = TYPES[ty];
    hp[i] = THREE.MathUtils.lerp(T.hp[0], T.hp[1], Math.random());
    speed[i] = THREE.MathUtils.lerp(T.speed[0], T.speed[1], Math.random());   // 킹덤 좀비는 빠르다
    scale[i] = THREE.MathUtils.lerp(T.scale[0], T.scale[1], Math.random());
    alive[i] = 1; wind[i] = 0; iWind.setX(i, 0); gone[i] = 0; iGone.setX(i, 0);
    iPhase.setX(i, Math.random()); iSpeed.setX(i, speed[i] / (8 * scale[i])); 
    { const r = Math.random(); look[i] = ty === 1 ? (r < 0.6 ? 2 : 0) : r < 0.2 ? 1 : r < 0.7 ? 2 : 0; iType.setX(i, ty + look[i] * 4); }   // 갓 20% · 풀어진 머리 50% · 맨머리 30%(거대형은 갓 없이)
    iSpeed.needsUpdate = true; iType.needsUpdate = true;
    respawnAt[i] = 0;
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) { reset(i, 0); if (!spawn.pick) pz[i] += 60 - Math.random() * 70; }
  iPhase.needsUpdate = true; iSpeed.needsUpdate = true;

  // 건물 회피용 원(둘레 원으로 근사 — 골목이 열려 있으면 충분)
  // 집은 넉넉히 피하고, 석탑 같은 작은 장애물은 스치듯 지나간다(골목 한복판에서 떼가 뭉치지 않게)
  const allObstacles = buildings.filter((b) => { const sz = b.bounds.getSize(new THREE.Vector3()); return Math.max(sz.x, sz.z) > 3; }).map((b) => {
    const c = b.bounds.getCenter(new THREE.Vector3()); const sz = b.bounds.getSize(new THREE.Vector3());
    const small = Math.max(sz.x, sz.z) < 8;
    return { x: c.x, z: c.z, hx: sz.x / 2 + (small ? 0.1 : 0.6), hz: sz.z / 2 + (small ? 0.1 : 0.6), margin: small ? 0.5 : 1.5, b };
  });
  // 레일 위 마차 근처(±110m) 장애물만 마차가 20m 갈 때마다 골라 쓴다 — 길 전체 50채를 좀비 360마리가 매 프레임 훑지 않게
  let obstacles = allObstacles, obstacleS = Infinity;
  const rail = { s: 0, heading: 0, speed: 0 };   // main 이 매 프레임 update() 앞에 써 넣는다(마차의 진행거리·헤딩·앞방향 속도)
  const _al = { s: 0, lat: 0, k: 0 };            // along() 출력 재사용(프레임당 N번 호출 — 할당 금지)
  const alongS = (x, z) => path.along(x, z, _al).s;

  // 공간 해시(분리력)
  const CELL = 1.6, GRID = 64;
  const cellHead = new Int32Array(GRID * GRID), next = new Int32Array(N);
  const cellOf = (x, z) => (((Math.floor(x / CELL) & (GRID - 1)) << 6) | (Math.floor(z / CELL) & (GRID - 1)));

  function update(dt, time) {
    uniforms.uTime.value = time; deadUniforms.uTime.value = time;
    if (Math.abs(rail.s - obstacleS) > 20) { obstacleS = rail.s; obstacles = allObstacles.filter((o) => Math.abs(o.b.s - obstacleS) < 110); }
    cellHead.fill(-1);
    for (let i = 0; i < N; i++) { if (!alive[i]) continue; const c = cellOf(px[i], pz[i]); next[i] = cellHead[c]; cellHead[c] = i; }

    let aliveCount = 0, revived = 0, pending = 0;
    spawnAcc = Math.min(12, spawnAcc + dt * H.spawnRate);   // 파 소환은 초당 spawnRate — 쏟아지되 한 프레임에 다 나오지 않는다
    const tx = H.seek.x, tz = H.seek.z;   // 쫓는 점: main 이 매 프레임 넣는다(추격엔 마차 뒤 5 m — 옆구리가 아니라 꼬리에 붙어 화면 안에서 덤벼든다)
    // 표적(마차)이 달아나는 속도. 추격전에서 도달한 놈이 그냥 멈추면 마차가 그대로 빠져나가
    // 영원히 아무도 닿지 못한다 — 속도를 맞춰 따라붙어야 물고 늘어진다.
    const hold = H.chase ? rail.speed : 0;
    for (let i = 0; i < N; i++) {
      if (!alive[i]) {
        if (relocate[i] && H.tailDrop) { relocate[i] = 0; respawnAt[i] = 0; }   // 꼬리(2026-09-04): 파 끝의 낙오 재배치는 한 놈씩 12초 동안 흘러 들어와 掃 를 막았다 — 화면 밖으로 벗어난 놈은 그냥 없어진다(시체도 없었다)
        // 보스전엔 budget 만큼만 되살린다 — 떼를 얇게 깔아 보스에 집중시킨다
        // 재배치(relocate)는 파 소환 수를 쓰지 않는다. 새 소환은 pool 이 남아 있고 페이스(spawnAcc)가 허락할 때만.
        if (respawnAt[i] && time > respawnAt[i] && stats.alive + revived < H.budget && (relocate[i] || (H.pool > 0 && spawnAcc >= 1))) { if (!relocate[i]) { H.pool--; spawnAcc--; } relocate[i] = 0; reset(i, time); revived++; }
        else { if (relocate[i]) pending++; m.makeScale(0, 0, 0); body.setMatrixAt(i, m); continue; }
      }
      // 낙오: 조준 범위 밖으로 벗어난 놈은 조용히 재배치한다(시체 없이) — 떼는 항상 총구 쪽에 있어야 한다
      // 추격(뒤를 봄): 95m 넘게 처지거나 마차를 25m 앞질렀을 때. 보스(앞을 봄): 뒤로 45m 처졌을 때.
      const dzt = rail.s - alongS(px[i], pz[i]);   // 옛 pz−target.z ≡ −(s_i−s_v)
      // 추격 낙오 62 m(전 95): 못 따라오는 놈이 파를 끝내지 못하게 붙잡는다 — 재배치돼 14~55 m 뒤에서 다시 온다
      if (H.chase ? (dzt > 62 || dzt < -25) : (dzt > 45)) { alive[i] = 0; relocate[i] = H.tailDrop ? 0 : 1; wind[i] = 0; iWind.setX(i, 0); respawnAt[i] = time + 0.3 + Math.random() * 1.5; m.makeScale(0, 0, 0); body.setMatrixAt(i, m); continue; }
      aliveCount++;
      // 지붕 위·낙하 중(2026-09-03): seek·분리·회피 없이 제 갈 길만 간다. 지붕 위에선 마차 쪽으로 기어가며 용마루(top−0.5)→처마(top·0.55) 로 내려오고, AABB(처마선) 를 넘으면 살짝 뛰어 떨어진다.
      let air = false; const rb = roofB[i];
      if (rb) {
        air = true;
        if (!rb.alive) { roofB[i] = null; vy[i] = 0; }   // 집이 무너졌다 — 그 자리서 떨어진다
        else {
          const hx = (rb.bounds.max.x - rb.bounds.min.x) / 2, hz = (rb.bounds.max.z - rb.bounds.min.z) / 2;
          let dx = tx - px[i], dz = tz - pz[i]; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
          roofT[i] -= dt; const sp = roofT[i] > 0 ? 0 : speed[i] * 0.35 * H.speedMul;   // 1.5~6초 웅크려 마차를 노려보다가 기어 나온다 — 실루엣이 하늘에 오래 걸리게
          if (roofT[i] > 0) { yaw[i] = Math.atan2(dx, dz); }
          vx[i] += (dx * sp - vx[i]) * Math.min(1, dt * 4); vz[i] += (dz * sp - vz[i]) * Math.min(1, dt * 4);
          px[i] += vx[i] * dt; pz[i] += vz[i] * dt;
          const edge = Math.max(Math.abs(px[i] - rb.center.x) / hx, Math.abs(pz[i] - rb.center.z) / hz), top = rb.bounds.max.y;
          py[i] = THREE.MathUtils.lerp(top - 0.5, top * 0.55, Math.pow(Math.min(1, edge), 1.4));
          if (edge >= 1) { roofB[i] = null; vy[i] = 1.6; }
        }
      } else if (py[i] > 0) {
        air = true; vy[i] -= 20 * dt; py[i] += vy[i] * dt; px[i] += vx[i] * dt; pz[i] += vz[i] * dt;
        if (py[i] <= 0) { py[i] = 0; vy[i] = 0; stagger[i] = 0.6; vx[i] *= 0.3; vz[i] *= 0.3; hooks.onLand?.(px[i], pz[i], time); }   // 착지: 0.6초 비틀거림
      }
      if (!air) {
      // seek
      let dx = tx - px[i], dz = tz - pz[i];
      const dist = Math.hypot(dx, dz) || 1;
      dx /= dist; dz /= dist;
      // 옆폭(2026-09-04): 세로 폰은 반화각 ≈10.5° 라 마차 뒤 10 m 에서 옆 4 m 부터 화면 밖이다 — 화면 밖에서 웅크려 덤벼드는 건 피할 수 없는 피해. seek 점의 옆폭(H.seekHalfW, main 이 세로면 2 m) 안에 들 때까진 멈추지 않고 계속 모여든다
      const lat = Math.abs((px[i] - tx) * H.seekRight.x + (pz[i] - tz) * H.seekRight.z);
      const inLane = lat < H.seekHalfW;
      const nearStop = inLane && dist < STOP_DIST + 1.5;
      let ax = dx * (nearStop ? 0.15 : 1.0), az = dz * (nearStop ? 0.15 : 1.0);
      // 분리
      const cx = Math.floor(px[i] / CELL), cz = Math.floor(pz[i] / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        let j = cellHead[(((cx + ox) & (GRID - 1)) << 6) | ((cz + oz) & (GRID - 1))];
        while (j !== -1) {
          if (j !== i) {
            const sx = px[i] - px[j], sz = pz[i] - pz[j];
            const d2 = sx * sx + sz * sz;
            const rr = 0.5 * (scale[i] + scale[j]); const rr2 = rr * rr;
            if (d2 < rr2 && d2 > 1e-4) { const d = Math.sqrt(d2); const f = (rr - d) * 2.2 / d; ax += sx * f; az += sz * f; }
          }
          j = next[j];
        }
      }
      // 건물 회피(박스 밀어내기)
      for (const o of obstacles) {
        if (!o.b.alive) continue;
        const rx = px[i] - o.x, rz = pz[i] - o.z;
        const mg = o.margin;
        if (Math.abs(rx) < o.hx + mg && Math.abs(rz) < o.hz + mg) {
          const ex = o.hx + mg - Math.abs(rx), ez = o.hz + mg - Math.abs(rz);
          if (ex < ez) ax += Math.sign(rx) * 3.0 * (ex / mg + 0.2); else az += Math.sign(rz) * 3.0 * (ez / mg + 0.2);
          // 박스 안쪽으로 파고들었으면 즉시 밀어냄
          if (Math.abs(rx) < o.hx && Math.abs(rz) < o.hz) { if (o.hx - Math.abs(rx) < o.hz - Math.abs(rz)) px[i] = o.x + Math.sign(rx || 1) * (o.hx + 0.1); else pz[i] = o.z + Math.sign(rz || 1) * (o.hz + 0.1); }
        }
      }
      const al = Math.hypot(ax, az) || 1;
      if (stagger[i] > 0) stagger[i] -= dt;
      const sp = (stagger[i] > 0 ? speed[i] * 0.15 : speed[i]) * H.speedMul;   // 추격전엔 마차를 따라잡도록 배율을 올린다
      vx[i] += ((ax / al) * sp - vx[i]) * Math.min(1, dt * 6);
      vz[i] += ((az / al) * sp - vz[i]) * Math.min(1, dt * 6);
      px[i] += vx[i] * dt; pz[i] += vz[i] * dt;

      if (inLane && dist < STOP_DIST + scale[i] * 0.5) { // 포대 앞 도달: 멈춰서 공격한다(쏴서 치울 시간을 준다)
        // 추격전엔 마차 속도만큼만 따라 달린다 — 붙어서 긁되 파고들지는 않는다. 느린 놈은 못 따라와 처진다.
        if (hold > 0.2) { const h = Math.min(sp, hold); vx[i] = dx * h; vz[i] = dz * h; } else { vx[i] *= 0.2; vz[i] *= 0.2; }
        if (wind[i] === 0) { wind[i] = time; iWind.setX(i, time); }   // 웅크림 시작 — 셰이더가 붉게 달아오르며 몸을 낮춘다
        else if (time - wind[i] > TYPES[type[i]].wind * H.windMul) {
          stats.reached++;
          if (type[i] === 2) { kill(i, 0, 1, time, 4); continue; }   // 폭탄: 터진다(피해는 onExplode 가 거리로 준다)
          stats.reachDamage += TYPES[type[i]].strike * H.impaleMul * H.strikeMul; hooks.onStrike?.(px[i], pz[i], type[i], time);
          // 덤벼든 놈은 가시에 꿰여 마차 프레임에서 옆(sx)·앞(0.2)으로 튄다 — 점수 없음(cause 'strike')
          const th = rail.heading, fx = -Math.sin(th), fz = -Math.cos(th), rx = Math.cos(th), rz = -Math.sin(th);
          const sx = Math.sign((px[i] - tx) * rx + (pz[i] - tz) * rz || 1);
          kill(i, sx * 0.9 * rx + 0.2 * fx, sx * 0.9 * rz + 0.2 * fz, time, 6, 'strike'); continue;
        }
      } else if (wind[i]) { wind[i] = 0; iWind.setX(i, 0); }   // 마차가 벗어났다 — 웅크림 취소
      }
      { const ty = Math.atan2(vx[i], vz[i]); let dy = ty - yaw[i]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); yaw[i] += dy * Math.min(1, dt * 10); }
      q.setFromAxisAngle(up, yaw[i]);
      s.setScalar(scale[i]);
      p.set(px[i], py[i], pz[i]);
      m.compose(p, q, s);
      body.setMatrixAt(i, m);
    }
    stats.alive = aliveCount; stats.pending = pending;
    body.instanceMatrix.needsUpdate = true;
    iHit.needsUpdate = true; iHitInfo.needsUpdate = true; iWind.needsUpdate = true; iGone.needsUpdate = true; cGone.needsUpdate = true;

    // 시체 동기화
    for (const c of physics.corpses) {
      if (!c.alive) { m.makeScale(0, 0, 0); corpseBody.setMatrixAt(c.slot, m); continue; }
      const t = c.body.translation(), r = c.body.rotation();
      p.set(t.x, t.y, t.z); q.set(r.x, r.y, r.z, r.w); s.setScalar(corpseScale[c.slot]);
      m.compose(p, q, s);
      corpseBody.setMatrixAt(c.slot, m);
    }
    corpseBody.instanceMatrix.needsUpdate = true;
    cHit.needsUpdate = true;
  }

  // 광선 vs 좀비(수직 캡슐 근사: 반지름 0.58, 높이 1.95). 가까운 순으로 최대 maxHits 명 — 관통.
  const HB = { i: new Int32Array(6), t: new Float64Array(6), n: 0 };
  const hitPool = Array.from({ length: 6 }, () => ({ index: -1, t: 0, x: 0, y: 0, z: 0 }));
  const hits = [];
  function raycast(ox, oy, oz, dx, dy, dz, maxT, maxHits = 3) {
    HB.n = 0;
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      const ex = ox - px[i], ez = oz - pz[i];
      const near = Math.max(0, Math.min(1, (14 - Math.hypot(ex, ez)) / 14));
      const r = 0.62 * scale[i] + 0.4 * near, h = 1.95 * scale[i];
      const a = dx * dx + dz * dz, b = 2 * (ex * dx + ez * dz), c = ex * ex + ez * ez - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > maxT) continue;
      const y = oy + dy * t;
      if (y < py[i] - 0.3 || y > py[i] + h + 0.3) continue;   // 지붕 위 놈은 그 높이에서 맞는다
      if (HB.n === maxHits && t >= HB.t[HB.n - 1]) continue;
      let k = Math.min(HB.n, maxHits - 1);
      while (k > 0 && HB.t[k - 1] > t) { HB.t[k] = HB.t[k - 1]; HB.i[k] = HB.i[k - 1]; k--; }
      HB.t[k] = t; HB.i[k] = i; if (HB.n < maxHits) HB.n++;
    }
    if (!HB.n) return null;
    hits.length = HB.n;
    for (let k = 0; k < HB.n; k++) {
      const rec = hitPool[k], t = HB.t[k];
      rec.index = HB.i[k]; rec.t = t; rec.x = ox + dx * t; rec.y = oy + dy * t; rec.z = oz + dz * t; hits[k] = rec;
    }
    return hits;
  }

  // 피해. 죽으면 시체 스폰 + 인스턴스 재활용 예약. 반환: 죽었는지.
  function damage(i, amount, dirX, dirZ, time, force = 9, hx, hy, hz) {
    iHit.setX(i, time);
    let side = 0, yf = 1.2;
    if (hx !== undefined) {
      const dx = hx - px[i], dz = hz - pz[i], c = Math.cos(yaw[i]), sn = Math.sin(yaw[i]);
      side = Math.max(-1, Math.min(1, (dx * c - dz * sn) / (0.3 * scale[i]))); yf = (hy - py[i]) / scale[i];
      iHitInfo.setXY(i, side, yf);
      // 헤드샷: 정수리 근처 정면 — 피해 2배
      if (yf > 1.6 && Math.abs(side) < 0.5) amount *= 2.2;
    }
    hp[i] -= amount;
    if (hp[i] <= 0 && hx !== undefined && yf > 1.6 && Math.abs(side) < 0.5 && type[i] !== 1) { gone[i] |= 4; hooks.onLimb?.(hx, hy, hz, dirX, dirZ, time, 2); }   // 머리가 날아간 시체
    else if (hp[i] > 0 && hx !== undefined && yf > 1.15 && yf < 1.75 && Math.abs(side) > 0.5 && type[i] !== 1) {
      const bit = side < 0 ? 8 | 32 : 16 | 64;   // 왼팔(3·5) / 오른팔(4·6)
      if (!(gone[i] & bit) && Math.random() < 0.35) { gone[i] |= bit; iGone.setX(i, gone[i]); hooks.onLimb?.(hx, hy, hz, dirX, dirZ, time, 1); }
    }
    if (hp[i] > 0) { const kb = 1.0 / (scale[i] * scale[i]); /* 개틀링은 밀지 않고 탄막 안에 붙잡는다(경직이 발을 묶음) */ vx[i] -= dirX * kb; vz[i] -= dirZ * kb; stagger[i] = Math.max(stagger[i], 0.45 / scale[i]); return false; }
    kill(i, dirX, dirZ, time, force, wind[i] > 0 ? 'save' : null);   // 웅크린 놈을 제때 죽였다 — main 이 斬 보상
    return true;
  }
  function kill(i, dirX, dirZ, time, force = 9, cause = null) {
    if (!alive[i]) return;
    alive[i] = 0; stats.kills++;
    const cc = cause || H.causeOverride;   // 스킬 자동공격 래퍼가 'auto' 를 심는다 — 절반 점수·배율 없음
    hooks.onKill?.(type[i], px[i], pz[i], time, cc);
    if (cc === 'impale') stats.impaled++;
    respawnAt[i] = time + 2.5 + Math.random() * 4;
    const c = physics.spawnCorpse({ x: px[i], y: py[i], z: pz[i] }, { x: dirX * force * 0.35 + vx[i] * 0.3, y: force * (0.08 + Math.random() * 0.12), z: dirZ * force * 0.35 + vz[i] * 0.3 }, yaw[i], time, scale[i]);
    cHit.setX(c.slot, time); cType.setX(c.slot, (type[i] === 2 ? 0 : type[i]) + look[i] * 4); cType.needsUpdate = true; corpseScale[c.slot] = scale[i]; cGone.setX(c.slot, gone[i]);
    if (type[i] === 2) hooks.onExplode?.(px[i], pz[i], time);
    m.makeScale(0, 0, 0); body.setMatrixAt(i, m);
  }

  // 들이받기: 마차 정면 쐐기 구역(폭 ±halfW, 앞 front ~ 뒤 back) 안 좀비는 옆·앞으로 날아간다
  function ram(x, z, heading, halfW, front, back, time) {
    let n = 0;
    const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      const dx = px[i] - x, dz = pz[i] - z;
      const lat = dx * rx + dz * rz, ahead = dx * fx + dz * fz;   // 옛 dz ≡ −ahead
      if (Math.abs(lat) > halfW || -ahead > back || -ahead < -front) continue;
      const sx = Math.sign(lat || (Math.random() - 0.5));
      kill(i, sx * 0.8 * rx + 0.6 * fx, sx * 0.8 * rz + 0.6 * fz, time, 9); n++;   // 옆으로 튀고 앞으로 날아감(마차 프레임)
    }
    return n;
  }

  // 파편에 깔림: 큰 파편 근처 좀비 즉사
  function crushNear(x, z, radius, time) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), rr = radius * radius;
    const reach = Math.ceil(radius / CELL);
    let n = 0;
    for (let ox = -reach; ox <= reach; ox++) for (let oz = -reach; oz <= reach; oz++) {
      let j = cellHead[(((cx + ox) & (GRID - 1)) << 6) | ((cz + oz) & (GRID - 1))];
      while (j !== -1) {
        const nj = next[j];
        if (alive[j]) { const sx = px[j] - x, sz = pz[j] - z; if (sx * sx + sz * sz < rr) { kill(j, sx / (radius || 1), sz / (radius || 1), time, 6); n++; } }
        j = nj;
      }
    }
    return n;
  }

  // 스킬 가시 오라: 반경 안 좀비에 지속 피해 — 타격 플래시·넉백 없이 조용히 긁힌다
  function aura(x, z, radius, amount, time) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), rr = radius * radius;
    const reach = Math.ceil(radius / CELL);
    for (let ox = -reach; ox <= reach; ox++) for (let oz = -reach; oz <= reach; oz++) {
      let j = cellHead[(((cx + ox) & (GRID - 1)) << 6) | ((cz + oz) & (GRID - 1))];
      while (j !== -1) {
        const nj = next[j];
        if (alive[j]) { const sx = px[j] - x, sz = pz[j] - z; if (sx * sx + sz * sz < rr) { hp[j] -= amount; if (hp[j] <= 0) kill(j, sx / (radius || 1), 0.2, time, 3); } }
        j = nj;
      }
    }
  }

  // 앞뒤 전환 순간, 반대편에 남은 놈들을 조용히 치운다(시체 없이) — 조준 범위 밖에서 장갑을 갉는 걸 막는다.
  // sign +1 = 마차 뒤(s 작은 쪽), -1 = 마차 앞.
  function recycleSide(sign, time) {
    for (let i = 0; i < N; i++) { if (!alive[i]) continue; if ((rail.s - alongS(px[i], pz[i])) * sign > 0) { alive[i] = 0; relocate[i] = 1; wind[i] = 0; iWind.setX(i, 0); respawnAt[i] = time + 0.3 + Math.random() * 1.8; } }
  }

  // 정원(budget)까지 즉시 줄인다 — 먼 놈부터 조용히 치운다(보스 등장 섬광에 가려 사라진다).
  function trimTo(n, time) {
    for (let i = 0; i < N; i++) if (!alive[i] && relocate[i]) { relocate[i] = 0; respawnAt[i] = 0; }   // 재배치 대기도 버린다 — 코인 직후 타이틀 낙오자들이 pool 을 우회해 되돌아와 출발 전에 덤벼들었다(실측 −13)
    let live = []; for (let i = 0; i < N; i++) if (alive[i]) live.push(i);
    if (live.length <= n) return;
    live.sort((a, b) => (Math.hypot(px[b] - target.x, pz[b] - target.z) - Math.hypot(px[a] - target.x, pz[a] - target.z)));
    for (let k = 0; k < live.length - n; k++) { const i = live[k]; alive[i] = 0; relocate[i] = 0; wind[i] = 0; iWind.setX(i, 0); respawnAt[i] = 0; }   // 되돌아오지 않는다(파 pool 로만 다시 나온다) — 재배치로 두면 1파가 타이틀 떼 270 이 됐다
  }

  // 파 시작: 앞으로 n 마리를 소환할 수 있다(pool). 죽어 있는 슬롯은 곧바로 나올 수 있게 예약 시각을 당긴다. 재배치 대기는 그대로.
  function startWave(n, time) { H.pool = n; for (let i = 0; i < N; i++) if (!alive[i] && !relocate[i]) respawnAt[i] = time + Math.random() * 0.4; }
  const H = { update, raycast, damage, kill, crushNear, ram, aura, recycleSide, trimTo, startWave, mix, stats, rail, hooks, px, pz, py, wind, roofB, vx, vz, alive, type, scale, N, body, glow, uniforms, causeOverride: null, impaleMul: 1, strikeMul: 1, windMul: 1, chase: false, tailDrop: false, seekHalfW: 99, seekRight: { x: 1, z: 0 }, budget: N, speedMul: 1, pool: Infinity, spawnRate: 30, seek: { x: target.x, z: target.z } };
  return H;
}
