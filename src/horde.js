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

function tag(g, id) { if (g.index) g = g.toNonIndexed(); const n = g.attributes.position.count; g.setAttribute("aBone", new THREE.Float32BufferAttribute(new Float32Array(n).fill(id), 1)); return g; }
function buildZombieGeometry() {
  const parts = [];
  for (const b of BONES) {
    const g = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2], 1, 2, 1);
    g.translate(b.at[0], b.at[1], b.at[2]);
    parts.push(tag(g, b.id));
  }
  // 케데헌 데몬 문법: 뿔 한 쌍(머리), 가슴 코어(발광 팔면체), 발톱(전완 끝 웨지)
  for (const sx of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.035, 0.22, 5); horn.translate(0, 0.11, 0); horn.rotateZ(-sx * 0.55); horn.translate(sx * 0.09, 1.86, 0.0);
    parts.push(tag(horn, 2));
    const claw = new THREE.ConeGeometry(0.045, 0.16, 4); claw.rotateX(Math.PI); claw.translate(sx * 0.27, 0.86, 0.02);
    parts.push(tag(claw, sx < 0 ? 5 : 6));
  }
  const core = new THREE.OctahedronGeometry(0.085, 0); core.translate(0, 1.34, 0.13); parts.push(tag(core, 1));
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
  attribute float aBone;
  attribute float iPhase;   // 개체 위상
  attribute float iSpeed;   // 걸음 주파수 배율
  attribute float iHit;     // 피격 시각
  attribute float iType;    // 0 보통 1 거대 2 폭탄 3 질주
  uniform float uTime; uniform float uDead;
  varying vec3 vModel; varying vec3 vNormalW; varying float vBone; varying float vHit; varying float vType; varying vec3 vWorld;

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
    vBone = aBone; vHit = iHit; vType = iType;
    vec3 p = uDead > 0.5 ? deadPose(position, aBone) : animate(position, aBone);
    float shred = exp(-(uTime - iHit) * 16.0) * (1.0 - uDead);
    p.xz += vec2(sin(uTime * 190.0 + position.y * 31.0), cos(uTime * 163.0 + position.x * 27.0)) * 0.06 * shred;
    vModel = position;
    vec4 wp = instanceMatrix * vec4(p, 1.0);
    vWorld = (modelMatrix * wp).xyz;
    vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * wp;
  }
`;

// 몸체: 잉크 실루엣. 위에서 오는 달빛만 아주 약하게 형태를 남긴다.
const BODY_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uMoonDir; uniform float uTime;
  varying vec3 vModel; varying vec3 vNormalW; varying float vBone; varying float vHit; varying vec3 vWorld;
  void main() {
    vec3 n = normalize(vNormalW);
    float top = max(0.0, dot(n, uMoonDir));
    vec3 v = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(0.0, dot(n, v)), 3.0);        // 프레넬 림 — 전열이 검은 덩어리가 아닌 '몸'으로 읽힌다(라이트 0)
    float hit = exp(-(uTime - vHit) * 14.0);
    vec3 c = vec3(0.02) + top * 0.10 + rim * 0.28 + hit * 0.9;   // 피격 순간 실루엣이 종이처럼 하얘진다
    gl_FragColor = vec4(c, 1.0);
  }
`;

// 발광(스팟 레이어): 보라 눈 + 핏줄. 케데헌 데몬 감각의 보랏빛 문양.
const GLOW_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime; uniform vec3 uColor; uniform vec3 uBlood;
  varying vec3 vModel; varying vec3 vNormalW; varying float vBone; varying float vHit; varying float vType; varying vec3 vWorld;
  void main() {
    float g = 0.0;
    vec3 col = uColor;
    float eyeR = vType == 1.0 ? 0.085 : 0.06;
    if (vBone == 2.0) {
      // 눈: 머리 전면(+z) 두 점
      float front = smoothstep(0.08, 0.12, vModel.z);
      float e1 = length(vModel.xy - vec2(-0.055, 1.75)), e2 = length(vModel.xy - vec2(0.055, 1.75));
      g += front * (smoothstep(eyeR, 0.02, e1) + smoothstep(eyeR, 0.02, e2)) * 2.2;
    }
    // 가슴 코어: 팔면체 표면 전체가 빛난다(모델 좌표로 판정)
    if (vBone == 1.0 && length(vModel - vec3(0.0, 1.34, 0.13)) < 0.1) g += 2.0 * (0.7 + 0.3 * sin(uTime * 2.5 + vModel.x * 40.0));
    if (vType == 2.0) {
      // 폭탄 좀비: 배(몸통 앞면)가 붉게 달아오르며 점점 빠르게 박동
      float belly = smoothstep(0.30, 0.08, length(vModel.xy - vec2(0.0, 1.22))) * smoothstep(0.06, 0.12, vModel.z);
      float beat = 0.6 + 0.4 * pow(abs(sin(uTime * 5.0 + vModel.y)), 6.0);
      if (vBone == 1.0 || vBone == 0.0) { g += belly * 2.4 * beat; col = mix(uColor, uBlood, belly * 1.5); }
    }
    // 핏줄: 몸통·팔·다리 표면의 가느다란 줄무늬 (모델 공간 노이즈)
    float veins = sin(vModel.y * 38.0 + sin(vModel.x * 23.0 + vModel.z * 17.0) * 3.0 + uTime * 2.0);
    veins = smoothstep(0.90, 0.99, veins);
    float pulse = 0.55 + 0.45 * sin(uTime * 3.0 + vModel.y * 2.0);
    if (vBone != 2.0) g += veins * 0.55 * pulse;
    float hit = exp(-(uTime - vHit) * 12.0);
    g += hit * 1.2;
    if (g < 0.02) discard;
    gl_FragColor = vec4(col * g, 1.0);
  }
`;

// 그림자 깊이용(동일 애니메이션)
const DEPTH_FRAG = /* glsl */`
  #include <packing>
  void main() { gl_FragColor = packDepthToRGBA(gl_FragCoord.z); }
`;

export const ZOMBIE_COLOR = new THREE.Color(0xb04cff);

export function createHorde(scene, physics, {
  count = 320, spawn, target, buildings,
} = {}) {
  const geo = buildZombieGeometry();
  const N = count;
  const iPhase = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  const iSpeed = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  const iHit = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(-100), 1);
  iHit.setUsage(THREE.DynamicDrawUsage);
  const iType = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  geo.setAttribute('iPhase', iPhase); geo.setAttribute('iSpeed', iSpeed); geo.setAttribute('iHit', iHit); geo.setAttribute('iType', iType);

  const uniforms = { uTime: { value: 0 }, uDead: { value: 0 }, uMoonDir: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() }, uColor: { value: ZOMBIE_COLOR }, uBlood: { value: new THREE.Color(0xff2020) } };
  const bodyMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, uniforms });
  const glowMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: GLOW_FRAG, uniforms, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true });
  const depthMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: DEPTH_FRAG, uniforms });

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
  const corpseBodyMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, uniforms: deadUniforms });
  const corpseGlowMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: GLOW_FRAG, uniforms: deadUniforms, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true });
  const corpseDepthMat = new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: DEPTH_FRAG, uniforms: deadUniforms });
  const corpseBody = new THREE.InstancedMesh(corpseGeo, corpseBodyMat, CORPSE_POOL);
  corpseBody.castShadow = true; corpseBody.customDepthMaterial = corpseDepthMat; corpseBody.frustumCulled = false;
  corpseBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const corpseGlow = new THREE.InstancedMesh(corpseGeo, corpseGlowMat, CORPSE_POOL);
  corpseGlow.instanceMatrix = corpseBody.instanceMatrix; corpseGlow.layers.set(LAYER_SPOT); corpseGlow.frustumCulled = false;
  scene.add(corpseBody, corpseGlow);

  // ── 상태 배열 ──
  const px = new Float32Array(N), pz = new Float32Array(N), vx = new Float32Array(N), vz = new Float32Array(N);
  const yaw = new Float32Array(N), hp = new Float32Array(N), speed = new Float32Array(N), scale = new Float32Array(N);
  const alive = new Uint8Array(N);
  const type = new Uint8Array(N);
  // 0 보통 · 1 거대(느리고 단단, 도달 시 큰 피해) · 2 폭탄(죽으면 폭발) · 3 질주(작고 빠름)
  const TYPES = [
    { speed: [3.6, 5.2], hp: [3, 5], scale: [0.9, 1.12], reachDmg: 1.0 },      // reachDmg = 포대 앞에서 1초마다 주는 피해
    { speed: [2.0, 2.6], hp: [42, 55], scale: [2.0, 2.3], reachDmg: 8 },
    { speed: [3.2, 4.2], hp: [3, 4], scale: [1.0, 1.15], reachDmg: 6 },       // 폭탄: 도달 즉시 폭발(1회)
    { speed: [6.5, 8.0], hp: [1.5, 2.5], scale: [0.72, 0.85], reachDmg: 0.7 },
  ];
  const mix = { brute: 0.035, bomber: 0.085, runner: 0.16 };   // 정차 지점마다 연출자가 바꾼다
  const rollType = () => { const r = Math.random(); return r < mix.brute ? 1 : r < mix.brute + mix.bomber ? 2 : r < mix.brute + mix.bomber + mix.runner ? 3 : 0; };
  const respawnAt = new Float32Array(N);
  const attackT = new Float32Array(N);   // 포대 앞 공격 타이머
  const stagger = new Float32Array(N);   // 피격 경직(초)
  const STOP_DIST = 7.0;                  // 여기서 멈춰 공격한다 — 총열이 내려다볼 수 있는 거리
  const corpseScale = new Float32Array(CORPSE_POOL).fill(1);
  const stats = { kills: 0, reached: 0, alive: 0, reachDamage: 0 };
  const hooks = { onExplode: null, onKill: null };

  function reset(i, time) {
    if (spawn.pick) { const s = spawn.pick(); px[i] = s.x; pz[i] = s.z; }
    else { px[i] = spawn.x + (Math.random() - 0.5) * 2 * spawn.halfW; pz[i] = spawn.z - Math.random() * 30; }
    vx[i] = 0; vz[i] = 0;
    yaw[i] = 0;
    const ty = rollType(); type[i] = ty; const T = TYPES[ty];
    hp[i] = THREE.MathUtils.lerp(T.hp[0], T.hp[1], Math.random());
    speed[i] = THREE.MathUtils.lerp(T.speed[0], T.speed[1], Math.random());   // 킹덤 좀비는 빠르다
    scale[i] = THREE.MathUtils.lerp(T.scale[0], T.scale[1], Math.random());
    alive[i] = 1;
    iPhase.setX(i, Math.random()); iSpeed.setX(i, speed[i] / (8 * scale[i])); iType.setX(i, ty);
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
  // 레일 위 마차 근처(±90m) 장애물만 매 0.5초 골라 쓴다 — 길 전체 50채를 좀비 360마리가 매 프레임 훑지 않게
  let obstacles = allObstacles, obstacleZ = Infinity;

  // 공간 해시(분리력)
  const CELL = 1.6, GRID = 64;
  const cellHead = new Int32Array(GRID * GRID), next = new Int32Array(N);
  const cellOf = (x, z) => (((Math.floor(x / CELL) & (GRID - 1)) << 6) | (Math.floor(z / CELL) & (GRID - 1)));

  function update(dt, time) {
    uniforms.uTime.value = time; deadUniforms.uTime.value = time;
    if (Math.abs(target.z - obstacleZ) > 20) { obstacleZ = target.z; obstacles = allObstacles.filter((o) => Math.abs(o.z - obstacleZ) < 110); }
    cellHead.fill(-1);
    for (let i = 0; i < N; i++) { if (!alive[i]) continue; const c = cellOf(px[i], pz[i]); next[i] = cellHead[c]; cellHead[c] = i; }

    let aliveCount = 0;
    const tx = target.x, tz = target.z;
    for (let i = 0; i < N; i++) {
      if (!alive[i]) {
        if (respawnAt[i] && time > respawnAt[i]) reset(i, time);
        else { m.makeScale(0, 0, 0); body.setMatrixAt(i, m); continue; }
      }
      // 낙오: 마차 뒤로 45m 넘게 처지면 조용히 앞으로 재배치한다(시체 없이) — 떼는 항상 앞에 있어야 한다
      if (pz[i] > target.z + 45) { alive[i] = 0; respawnAt[i] = time + 0.3 + Math.random() * 1.5; m.makeScale(0, 0, 0); body.setMatrixAt(i, m); continue; }
      aliveCount++;
      // seek
      let dx = tx - px[i], dz = tz - pz[i];
      const dist = Math.hypot(dx, dz) || 1;
      dx /= dist; dz /= dist;
      const nearStop = dist < STOP_DIST + 1.5;
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
      const sp = stagger[i] > 0 ? speed[i] * 0.15 : speed[i];
      vx[i] += ((ax / al) * sp - vx[i]) * Math.min(1, dt * 6);
      vz[i] += ((az / al) * sp - vz[i]) * Math.min(1, dt * 6);
      px[i] += vx[i] * dt; pz[i] += vz[i] * dt;
      const ty = Math.atan2(vx[i], vz[i]);
      let dy = ty - yaw[i]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw[i] += dy * Math.min(1, dt * 10);

      if (dist < STOP_DIST + scale[i] * 0.5) { // 포대 앞 도달: 멈춰서 공격한다(쏴서 치울 시간을 준다)
        vx[i] *= 0.2; vz[i] *= 0.2;
        if (type[i] === 2) { stats.reached++; stats.reachDamage += TYPES[2].reachDmg; kill(i, 0, 1, time, 4); continue; }
        attackT[i] += dt;
        if (attackT[i] >= 1.0) { attackT[i] -= 1.0; stats.reached++; stats.reachDamage += TYPES[type[i]].reachDmg; iHit.setX(i, time); }
      } else attackT[i] = 0.6; // 도착 0.4초 뒤 첫 공격
      q.setFromAxisAngle(up, yaw[i]);
      s.setScalar(scale[i]);
      p.set(px[i], 0, pz[i]);
      m.compose(p, q, s);
      body.setMatrixAt(i, m);
    }
    stats.alive = aliveCount;
    body.instanceMatrix.needsUpdate = true;
    iHit.needsUpdate = true;

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
      const r = 0.58 * scale[i], h = 1.95 * scale[i];
      const ex = ox - px[i], ez = oz - pz[i];
      const a = dx * dx + dz * dz, b = 2 * (ex * dx + ez * dz), c = ex * ex + ez * ez - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > maxT) continue;
      const y = oy + dy * t;
      if (y < 0 || y > h) continue;
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
  function damage(i, amount, dirX, dirZ, time, force = 9) {
    iHit.setX(i, time);
    hp[i] -= amount;
    if (hp[i] > 0) { const kb = 1.0 / (scale[i] * scale[i]); /* 개틀링은 밀지 않고 탄막 안에 붙잡는다(경직이 발을 묶음) */ vx[i] -= dirX * kb; vz[i] -= dirZ * kb; stagger[i] = Math.max(stagger[i], 0.45 / scale[i]); return false; }
    kill(i, dirX, dirZ, time, force);
    return true;
  }
  function kill(i, dirX, dirZ, time, force = 9) {
    if (!alive[i]) return;
    alive[i] = 0; stats.kills++;
    hooks.onKill?.(type[i], px[i], pz[i], time);
    respawnAt[i] = time + 2.5 + Math.random() * 4;
    const c = physics.spawnCorpse({ x: px[i], y: 0, z: pz[i] }, { x: dirX * force * 0.35 + vx[i] * 0.3, y: force * (0.08 + Math.random() * 0.12), z: dirZ * force * 0.35 + vz[i] * 0.3 }, yaw[i], time, scale[i]);
    cHit.setX(c.slot, time); cType.setX(c.slot, type[i] === 2 ? 0 : type[i]); cType.needsUpdate = true; corpseScale[c.slot] = scale[i];
    if (type[i] === 2) hooks.onExplode?.(px[i], pz[i], time);
    m.makeScale(0, 0, 0); body.setMatrixAt(i, m);
  }

  // 들이받기: 마차 정면 쐐기 구역(폭 ±halfW, 앞 front ~ 뒤 back) 안 좀비는 옆·앞으로 날아간다
  function ram(x, z, halfW, front, back, time) {
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      const dx = px[i] - x, dz = pz[i] - z;
      if (Math.abs(dx) > halfW || dz > back || dz < -front) continue;
      const sx = Math.sign(dx || (Math.random() - 0.5));
      kill(i, sx * 0.8, -0.6, time, 9); n++;
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

  return { update, raycast, damage, kill, crushNear, ram, mix, stats, hooks, px, pz, alive, type, scale, N, body, glow, uniforms };
}
