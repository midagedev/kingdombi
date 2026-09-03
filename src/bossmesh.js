// 보스 부품 빌더(2026-09-03 AAA 룩 3차): 巨人·恐龍의 몸을 박스에서 '조형'으로.
// 원칙 — 실루엣은 원기둥·구·선반(lathe) 조합, 표면은 갈비뼈·등가시·못·쇠사슬·포승·찢어진 천으로 잉크선이 걸릴 결을 준다.
// 골격(그룹 계층·회전 축)은 boss.js 가 그대로 쓴다. 여기서는 그룹에 붙는 메시만 만든다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function merge(geos) { const m = mergeGeometries(geos.map((g) => g.index ? g.toNonIndexed() : g), false); geos.forEach((g) => g.dispose()); return m; }
export function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; return m; }
const tr = (g, x, y, z) => { g.translate(x, y, z); return g; };
const rx = (g, a) => { g.rotateX(a); return g; };
const rz = (g, a) => { g.rotateZ(a); return g; };
const ry = (g, a) => { g.rotateY(a); return g; };

/** 위아래 반지름이 다른 몸통 마디(세로 y 축, 원점이 중심) */
export const tapered = (rTop, rBot, h, seg = 12) => new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
/** 근육 덩어리: 눌린 구 */
export const blob = (r, sx = 1, sy = 1, sz = 1, seg = 12) => { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)); g.scale(sx, sy, sz); return g; };
/** 갈비뼈: 반원 튜브 n개(x 축 좌우로 벌어짐), y 간격 gap, 아래로 갈수록 작아진다 */
// axis 'y': 세로 몸통(巨人) — 수평 반고리를 y 로 쌓는다. axis 'z': 가로 몸통(恐龍) — XY 면 반고리를 z 로 늘어놓는다. side ±1 = 오른/왼 옆구리
export function ribs(n, r0, gap, tube, side = 1, axis = 'y') {
  const gs = [];
  for (let i = 0; i < n; i++) {
    const r = r0 * (1 - i * (axis === 'y' ? 0.07 : 0.04)); const g = new THREE.TorusGeometry(r, tube, 5, 12, Math.PI * 0.95);
    if (axis === 'y') { g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 2 * side); g.translate(0, -i * gap, 0); }
    else { g.rotateZ(-Math.PI / 2 * side); g.translate(0, 0, i * gap); }
    gs.push(g);
  }
  return merge(gs);
}
/** 4각 사다리 마디(주둥이·턱): 면이 축에 정렬되게 45° 돌린다 */
const sq4 = (rt, rb, h) => { const g = tapered(rt, rb, h, 4); g.rotateY(Math.PI / 4); return g; };
/** 등가시: z 축(등) 방향으로 n개, 가운데가 길다 */
export function spikes(n, len, base, span, axis = 'z') {
  const gs = [];
  for (let i = 0; i < n; i++) { const u = n === 1 ? 0.5 : i / (n - 1), l = len * (0.55 + 0.45 * Math.sin(u * Math.PI)); const g = new THREE.ConeGeometry(base, l, 5); g.translate(0, l / 2, 0); g.rotateX(-0.35); if (axis === 'z') g.translate(0, 0, -span / 2 + u * span); else g.translate(-span / 2 + u * span, 0, 0); gs.push(g); }
  return merge(gs);
}
/** 못 박힌 쇠판: 판 + 테두리 못 */
// 굽은 갑주판: 반지름 R 의 원통 껍질(두께 d, 앞뒤 두 겹 + 위아래 테) + 테두리 못 + 세로 보강대. 앞면(+z)이 바깥.
export function rivetedPlate(w, h, d) {
  const R = w * 0.9, th = w / R, gs = [];
  const shell = (rad, hh) => { const g = new THREE.CylinderGeometry(rad, rad, hh, 10, 1, true, -th / 2, th); g.rotateY(Math.PI); g.translate(0, 0, -R + d / 2); return g; };   // 원통 중심을 뒤로 밀어 판 앞면이 z≈+d/2 에 오게
  gs.push(shell(R, h), shell(R - d, h));
  for (const y of [-h / 2, h / 2]) { const ring = new THREE.TorusGeometry(R - d / 2, d / 2, 4, 10, th); ring.rotateX(Math.PI / 2); ring.rotateY(Math.PI / 2 + Math.PI - th / 2); ring.translate(0, y, -R + d / 2); gs.push(ring); }
  const r = Math.min(w, h) * 0.06, nx = Math.max(3, Math.round(w / (r * 6))), ny = Math.max(2, Math.round(h / (r * 6)));
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (i !== 0 && i !== nx - 1 && j !== 0 && j !== ny - 1) continue;
    const a = -th / 2 + th * (0.1 + 0.8 * i / (nx - 1)), g = new THREE.SphereGeometry(r, 6, 4);
    g.translate(Math.sin(a) * R, -h / 2 + r * 2 + (h - r * 4) * (j / (ny - 1)), Math.cos(a) * R - R + d / 2 + r * 0.3); gs.push(g);
  }
  gs.push(tr(new THREE.BoxGeometry(w * 0.10, h * 0.92, d * 0.9), 0, 0, d * 0.7));   // 세로 보강대
  return merge(gs);
}
/** 투구 반쪽: z 축을 따라 놓인 반원통 껍질(side ±1 = 좌/우 반). 두개골 위에 덮인다 */
export function helmetHalf(R, len, d, side) {
  const gs = [];
  const sh = (rad) => { const g = new THREE.CylinderGeometry(rad, rad * 0.8, len, 8, 1, true, side > 0 ? 0 : Math.PI / 2, Math.PI / 2); g.rotateX(-Math.PI / 2); return g; };   // 위 사분면 하나(+y 쪽)
  gs.push(sh(R), sh(R - d));
  // 정중선 볏
  gs.push(tr(new THREE.BoxGeometry(d * 1.2, R * 0.35, len * 0.9), side * d * 0.7, R * 0.95, 0));
  const r = d * 0.5; for (let i = 0; i < 5; i++) { const a = (side > 0 ? 0.25 : Math.PI / 2 + 0.25) + (Math.PI / 2 - 0.5) * (i / 4), g = new THREE.SphereGeometry(r, 6, 4); g.translate(Math.cos(a) * R, Math.sin(a) * R, len * 0.35); gs.push(g); }
  return merge(gs);
}
/** 포승·쇠사슬: 고리 n개가 y 축 아래로 이어진다 */
export function chain(n, r, tube) {
  const gs = [];
  for (let i = 0; i < n; i++) { const g = new THREE.TorusGeometry(r, tube, 5, 10); if (i % 2) g.rotateY(Math.PI / 2); g.translate(0, -i * r * 1.5, 0); gs.push(g); }
  return merge(gs);
}
/** 감긴 포승: 몸통 둘레 링 n개(각도 살짝 기울여 감은 느낌) */
export function ropeWrap(n, r, tube, gap) {
  const gs = [];
  for (let i = 0; i < n; i++) { const g = new THREE.TorusGeometry(r, tube, 5, 16); g.rotateX(Math.PI / 2 + (i % 2 ? 0.12 : -0.12)); g.translate(0, -i * gap, 0); gs.push(g); }
  return merge(gs);
}
/** 찢어진 천: 아래로 늘어진 삼각 조각들(양면) */
export function tatters(n, r, len) {
  const gs = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, l = len * (0.5 + Math.random()); const g = new THREE.PlaneGeometry(len * 0.35, l, 1, 2); g.translate(0, -l / 2, 0); g.rotateY(-a); g.translate(Math.cos(a) * r, 0, Math.sin(a) * r); gs.push(g); }
  return merge(gs);
}
/** 갈고리 발톱: 살짝 굽은 원뿔(두 마디) */
export function talon(base, len) {
  const a = new THREE.ConeGeometry(base, len * 0.6, 6); a.translate(0, -len * 0.3, 0);
  const b = new THREE.ConeGeometry(base * 0.55, len * 0.55, 6); b.rotateX(0.55); b.translate(0, -len * 0.6, len * 0.18);
  const c = new THREE.CylinderGeometry(base, base, len * 0.2, 6); c.translate(0, len * 0.1, 0);
  return merge([a, b, c]);
}
/** 굽은 뿔: 마디 원뿔 3개 */
export function horn(base, len, curve = 0.5) {
  const gs = []; let y = 0, z = 0, ang = 0, r = base;
  for (let i = 0; i < 3; i++) { const l = len / 3, g = new THREE.CylinderGeometry(r * 0.72, r, l, 7); g.translate(0, l / 2, 0); g.rotateX(ang); g.translate(0, y, z); gs.push(g); y += Math.cos(ang) * l; z += -Math.sin(ang) * l; ang += curve; r *= 0.72; }
  const tip = new THREE.ConeGeometry(r, len * 0.35, 7); tip.translate(0, len * 0.175, 0); tip.rotateX(ang); tip.translate(0, y, z); gs.push(tip);
  return merge(gs);
}

// ── 巨人 부품(S = 배율). 잉크 ink · 뼈 bone · 어둠 dark 재질 ──
export function giantParts(S, { ink, bone, dark }) {
  const P = {};
  // 골반: 넓은 접시 + 허리 포승
  P.pelvis = mesh(merge([blob(0.20 * S, 1.0, 0.6, 0.75), tr(tapered(0.19 * S, 0.14 * S, 0.14 * S, 12), 0, 0.02 * S, 0)]), ink);
  P.pelvisRope = mesh(ropeWrap(3, 0.205 * S, 0.014 * S, 0.035 * S), dark); P.pelvisRope.position.y = 0.05 * S;
  // 몸통: 어깨 넓고 허리 좁은 선반 + 배(눌린 구) + 왼쪽 갈비뼈 노출 + 등가시 + 어깨 근육
  const torsoProfile = [[0.14, 0.0], [0.17, 0.08], [0.22, 0.22], [0.26, 0.36], [0.27, 0.46], [0.24, 0.52], [0.10, 0.56]].map(([r, y]) => new THREE.Vector2(r * S, y * S));
  P.torso = mesh(merge([new THREE.LatheGeometry(torsoProfile, 14), tr(blob(0.16 * S, 1.0, 0.8, 0.7), 0, 0.14 * S, 0.11 * S), tr(blob(0.11 * S, 1, 0.8, 1), -0.2 * S, 0.47 * S, 0), tr(blob(0.11 * S, 1, 0.8, 1), 0.2 * S, 0.47 * S, 0)]), ink); P.torso.scale.z = 0.74;   // 선반은 회전 대칭 — 앞뒤를 눌러 가슴판이 된다
  P.ribs = mesh(tr(ribs(5, 0.20 * S, 0.045 * S, 0.012 * S, -1, 'y'), 0.02 * S, 0.42 * S, 0.02 * S), bone);
  P.spine = mesh(tr(rx(spikes(6, 0.16 * S, 0.028 * S, 0.34 * S, 'z'), Math.PI / 2), 0, 0.30 * S, -0.22 * S), bone);   // 등 뒤로 솟은 가시(회전해 y 방향 배열)
  P.torsoRope = mesh(ropeWrap(4, 0.235 * S, 0.014 * S, 0.05 * S), dark); P.torsoRope.position.y = 0.36 * S;
  P.tatters = mesh(tatters(9, 0.19 * S, 0.5 * S), dark, false); P.tatters.material = dark; P.tatters.position.y = 0.04 * S;
  // 머리: 두개골(눌린 구) + 주둥이 + 아래턱 + 눈구멍(어둠) + 굽은 뿔 두 개 + 늘어진 머리카락 판
  P.head = mesh(merge([blob(0.13 * S, 1.0, 1.1, 1.05), tr(tapered(0.07 * S, 0.10 * S, 0.10 * S, 8), 0, 0.02 * S, 0.11 * S), tr(rx(new THREE.CylinderGeometry(0.07 * S, 0.05 * S, 0.13 * S, 8), Math.PI / 2), 0, 0.06 * S, 0.06 * S)]), ink);
  P.jaw = mesh(tr(new THREE.BoxGeometry(0.14 * S, 0.05 * S, 0.14 * S), 0, -0.04 * S, 0.06 * S), ink);
  P.sockets = mesh(merge([tr(blob(0.035 * S), -0.055 * S, 0.04 * S, 0.10 * S), tr(blob(0.035 * S), 0.055 * S, 0.04 * S, 0.10 * S)]), dark);
  P.horns = mesh(merge([tr(rz(horn(0.035 * S, 0.34 * S, 0.45), -0.55), 0.09 * S, 0.12 * S, 0), tr(rz(horn(0.035 * S, 0.34 * S, 0.45), 0.55), -0.09 * S, 0.12 * S, 0)]), bone);
  P.hair = mesh(tr(tatters(6, 0.11 * S, 0.30 * S), 0, 0.08 * S, -0.03 * S), dark, false);
  // 팔: 위팔(근육 마디) · 아래팔(뼈처럼 가늘고 손목 넓음) · 손 + 발톱 셋 · 손목 쇠사슬
  P.upperArm = () => mesh(merge([tapered(0.055 * S, 0.075 * S, 0.30 * S, 10), tr(blob(0.075 * S), 0, 0.14 * S, 0), tr(blob(0.05 * S), 0, -0.15 * S, 0)]), ink);
  P.lowerArm = () => mesh(merge([tapered(0.06 * S, 0.045 * S, 0.30 * S, 10), tr(new THREE.BoxGeometry(0.09 * S, 0.07 * S, 0.06 * S), 0, -0.18 * S, 0.01 * S)]), ink);
  P.claws = () => mesh(merge([-1, 0, 1].map((k) => tr(talon(0.018 * S, 0.17 * S), k * 0.03 * S, -0.21 * S, 0.02 * S))), bone);
  P.wristChain = () => mesh(chain(5, 0.022 * S, 0.006 * S), dark);
  P.wristRope = () => mesh(ropeWrap(2, 0.062 * S, 0.010 * S, 0.03 * S), dark);
  // 다리: 허벅지(굵은 마디) · 종아리 · 발(발가락 셋)
  P.upperLeg = () => mesh(merge([tapered(0.075 * S, 0.095 * S, 0.44 * S, 10), tr(blob(0.09 * S), 0, 0.2 * S, 0), tr(blob(0.07 * S, 1, 0.8, 1), 0, -0.23 * S, 0)]), ink);
  P.lowerLeg = () => mesh(merge([tapered(0.06 * S, 0.075 * S, 0.40 * S, 10), tr(new THREE.BoxGeometry(0.13 * S, 0.06 * S, 0.19 * S), 0, -0.22 * S, 0.04 * S)]), ink);
  P.toes = () => mesh(merge([-1, 0, 1].map((k) => tr(rx(talon(0.02 * S, 0.11 * S), -Math.PI / 2 + 0.3), k * 0.04 * S, -0.24 * S, 0.15 * S))), bone);
  return P;
}

// ── 恐龍 부품 ──
export function rexParts({ ink, bone, dark }) {
  const P = {};
  // 몸통: 앞이 두꺼운 타원 + 가슴 갈비뼈 양쪽 + 등가시 + 엉덩이 근육
  P.body = mesh(merge([blob(1.7, 1.0, 1.05, 2.1, 14), tr(blob(1.2, 1.15, 0.9, 1.0, 12), 0, -0.3, 2.2), tr(blob(1.3, 1.0, 0.85, 1.1, 12), 0, 0.2, -2.3)]), ink);
  P.ribsL = mesh(tr(ribs(7, 1.85, 0.36, 0.08, -1, 'z'), 0, 0.1, -1.3), bone);
  P.ribsR = mesh(tr(ribs(7, 1.85, 0.36, 0.08, 1, 'z'), 0, 0.1, -1.3), bone);
  P.spine = mesh(tr(spikes(9, 0.9, 0.16, 5.6, 'z'), 0, 1.55, 0.1), bone);
  P.bodyRope = mesh(tr(rx(ropeWrap(3, 1.75, 0.08, 0.9), Math.PI / 2), 0, 0.1, 0.4), dark);
  // 목: 굽은 마디 + 아래 늘어진 살
  P.neck = mesh(merge([rx(tapered(0.75, 1.0, 2.6, 12), Math.PI / 2), tr(blob(0.6, 1, 0.7, 1.2), 0, -0.55, -0.4)]), ink);
  P.neckSpikes = mesh(tr(spikes(4, 0.55, 0.12, 2.0, 'z'), 0, 0.8, 0), bone);
  // 두개골: 눌린 구 + 주둥이(앞이 좁은 사다리) + 눈두덩 + 코 + 눈구멍
  P.skull = mesh(merge([blob(1.0, 1.0, 0.75, 1.1, 12), tr(rx(sq4(0.75, 1.3, 2.6), Math.PI / 2), 0, -0.05, -1.9), tr(blob(0.45, 1, 0.6, 1), -0.6, 0.55, -0.6), tr(blob(0.45, 1, 0.6, 1), 0.6, 0.55, -0.6), tr(blob(0.3, 1, 0.6, 1.4), 0, 0.35, -2.9)]), ink);
  P.skullRidge = mesh(tr(spikes(5, 0.45, 0.09, 1.6, 'z'), 0, 0.85, -0.6), bone);
  P.sockets = mesh(merge([tr(blob(0.28, 1, 1, 0.7), -0.7, 0.55, -1.15), tr(blob(0.28, 1, 1, 0.7), 0.7, 0.55, -1.15)]), dark);
  P.jaw = mesh(merge([tr(rx(sq4(0.65, 1.15, 2.6), Math.PI / 2), 0, -0.25, -1.4), tr(blob(0.55, 1.2, 0.6, 0.8), 0, -0.3, 0.1)]), ink);
  P.jawSag = mesh(tr(tatters(5, 0.5, 0.6), 0, -0.4, 0.2), dark, false);
  // 꼬리 마디(s = 축소 비율): 매끈한 마디 + 위 가시
  P.tail = (s) => mesh(merge([tr(rx(tapered(0.55 * s, 0.68 * s, 1.95, 10), Math.PI / 2), 0, 0, 0.95), tr(new THREE.ConeGeometry(0.1 * s, 0.5 * s, 5), 0, 0.68 * s + 0.2 * s, 0.9)]), ink);
  // 다리: 허벅지(큰 근육) · 정강이 · 발(발톱 셋)
  P.thigh = mesh(merge([blob(1.0, 0.85, 1.15, 1.0, 12), tr(tapered(0.55, 0.75, 1.2, 10), 0, -1.4, 0.1)]), ink);
  P.shin = mesh(merge([tapered(0.38, 0.5, 2.3, 10), tr(blob(0.55, 1, 0.8, 1), 0, 1.0, 0)]), ink);
  P.foot = mesh(merge([tr(new THREE.BoxGeometry(1.2, 0.5, 1.6), 0, -0.25, -0.3), tr(blob(0.5, 1, 0.6, 1), 0, -0.1, 0.4)]), ink);
  P.footClaws = () => mesh(merge([-1, 0, 1].map((k) => tr(rx(talon(0.15, 0.9), -Math.PI / 2 + 0.25), k * 0.42, -0.3, -1.3))), bone);
  // 앞발: 가늘고 굽음 + 발톱 둘
  P.arm = () => mesh(merge([tapered(0.13, 0.18, 1.1, 8), tr(rx(talon(0.07, 0.45), 0.6), -0.1, -0.6, -0.1), tr(rx(talon(0.07, 0.45), 0.6), 0.1, -0.6, -0.1)]), ink);
  // 쇠판: 못 박힌 판 + 가죽끈
  P.plate = (w, h, d, mat) => { const m = mesh(rivetedPlate(w, h, d), mat); return m; };
  return P;
}

// 巨人 쇠판(못 박힌)
export const giantPlate = (w, h, d, mat) => mesh(rivetedPlate(w, h, d), mat);
