import * as THREE from 'three';

// ── 레일 좌표계(2026-09-03, 코너 도입) ──
// 세계는 여전히 월드 x/z 로 그려지고 물리도 월드다. "길을 따라 얼마나 앞인가"만 이 좌표계를 쓴다.
//   s   : 경로 위 진행 거리(m). ROUTE.start 에서 0, 앞으로 갈수록 커진다.
//   lat : 길 중심에서 옆으로. 오른쪽 +, 왼쪽 −(진행 방향 기준).
//   θ   : 헤딩. forward = (−sin θ, −cos θ), right = (cos θ, −sin θ). θ=0 이 −z(북), 우회전은 θ −= π/2.
//         three.js 의 rotation.y = θ 와 같은 회전이라 물체 yaw_world = θ_seg + yaw_local.
// 직선 시절(z 축) 등식: pz − vpos.z ≡ −(s_i − s_v). 옛 dz 를 보던 자리는 전부 이 부호로 옮긴다.
// 구간은 직선(축 정렬) 여러 개를 코너에서 90° 로 잇는다 — 집이 네 방향 중 하나라 AABB 판정이 그대로 산다.
// 마차만 코너를 반경 R 의 호로 돈다(pose). s 는 꼭짓점 폴리라인 기준이라 호 위에선 실제 속도가 0.79 배 — 코너 감속으로 읽힌다.
export function createPath({ start = { x: 0, z: 14 }, heading0 = 0, corners = [], R = 16, roadHalf = 7 } = {}) {
  const segs = [];
  {
    let ox = start.x, oz = start.z, th = heading0, s0 = 0;
    for (const c of corners) {
      const len = c.s - s0;
      segs.push({ k: segs.length, ox, oz, th, s0, s1: c.s, fx: -Math.sin(th), fz: -Math.cos(th), rx: Math.cos(th), rz: -Math.sin(th), turn: c.turn });
      ox += -Math.sin(th) * len; oz += -Math.cos(th) * len; th += c.turn; s0 = c.s;
    }
    segs.push({ k: segs.length, ox, oz, th, s0, s1: Infinity, fx: -Math.sin(th), fz: -Math.cos(th), rx: Math.cos(th), rz: -Math.sin(th), turn: 0 });
    segs[0].s0 = -Infinity;
  }
  const segAt = (s) => { for (const g of segs) if (s < g.s1) return g; return segs[segs.length - 1]; };
  /** (s, lat) → 월드. out 은 Vector3 또는 {x,z}. y 는 건드리지 않는다. */
  function at(s, lat, out = new THREE.Vector3()) {
    const g = segAt(s), d = s - (g.s0 === -Infinity ? 0 : g.s0);   // 첫 구간 원점은 start(s=0)
    out.x = g.ox + g.fx * d + g.rx * lat; out.z = g.oz + g.fz * d + g.rz * lat; return out;
  }
  /** 구간 g 위의 (s, lat) → 월드. s 가 g 의 범위를 넘어도 g 의 직선을 그대로 연장한다(코너 뒤 옆길 stub 용). */
  function atSeg(g, s, lat, out = new THREE.Vector3()) { const d = s - (g.s0 === -Infinity ? 0 : g.s0); out.x = g.ox + g.fx * d + g.rx * lat; out.z = g.oz + g.fz * d + g.rz * lat; return out; }
  /** 구간 g 기준 투영 */
  function proj(g, x, z, out) {
    const base = g.s0 === -Infinity ? 0 : g.s0, dx = x - g.ox, dz = z - g.oz;
    out.s = base + dx * g.fx + dz * g.fz; out.lat = dx * g.rx + dz * g.rz; out.k = g.k; return out;
  }
  const _p = { s: 0, lat: 0, k: 0 };
  /** 월드 → (s, lat, k). 코너 근처엔 두 구간이 다 후보 — |lat| 가 작은 쪽(길 위에 가까운 쪽)을 고른다. */
  function along(x, z, out = { s: 0, lat: 0, k: 0 }) {
    let best = null, bestLat = Infinity;
    for (const g of segs) {
      proj(g, x, z, _p);
      const lo = g.s0 === -Infinity ? -Infinity : g.s0 - roadHalf, hi = g.s1 === Infinity ? Infinity : g.s1 + roadHalf;
      if (_p.s < lo || _p.s > hi) continue;
      const a = Math.abs(_p.lat); if (a < bestLat) { bestLat = a; best = g; }
    }
    if (!best) { // 어느 구간 범위에도 없다(코너 바깥 대각선) — 가장 가까운 끝으로
      let bd = Infinity; for (const g of segs) { proj(g, x, z, _p); const lo = g.s0 === -Infinity ? -1e9 : g.s0, hi = g.s1 === Infinity ? 1e9 : g.s1; const over = Math.max(lo - _p.s, _p.s - hi, 0), d = Math.hypot(over, _p.lat); if (d < bd) { bd = d; best = g; } }
    }
    return proj(best, x, z, out);
  }
  /** 마차 자세: 코너 ±R 구간은 호. 반환 θ. pos 는 Vector3(x,z 만). */
  function pose(s, pos) {
    for (let i = 0; i < segs.length - 1; i++) {
      const g = segs[i], sc = g.s1;
      if (s > sc - R && s < sc + R) {
        const u = (s - (sc - R)) / (2 * R), th = g.th + g.turn * u, sg = Math.sign(g.turn);
        // 호 중심 = 접점 A(sc−R) 에서 회전 안쪽으로 R(우회전이면 오른쪽). 위치 = 중심 + sign(turn)·right(θ)·R
        at(sc - R, 0, pos); const cx = pos.x - sg * g.rx * R, cz = pos.z - sg * g.rz * R;
        pos.x = cx + sg * Math.cos(th) * R; pos.z = cz + sg * -Math.sin(th) * R;
        return th;
      }
    }
    at(s, 0, pos); return segAt(s).th;
  }
  const heading = (s) => { for (let i = 0; i < segs.length - 1; i++) { const g = segs[i], sc = g.s1; if (s > sc - R && s < sc + R) return g.th + g.turn * (s - (sc - R)) / (2 * R); } return segAt(s).th; };
  /** 길 위인가(모든 구간 회랑, 코너 끝 stub 포함). margin 은 길 반폭에 더한다. */
  function onRoad(x, z, margin = 0, stub = 0) {
    for (const g of segs) {
      proj(g, x, z, _p);
      const lo = g.s0 === -Infinity ? -Infinity : g.s0 - roadHalf, hi = g.s1 === Infinity ? Infinity : g.s1 + stub;
      if (Math.abs(_p.lat) < roadHalf + margin && _p.s > lo - margin && _p.s < hi + margin) return true;
    }
    return false;
  }
  /** 헤딩 θ 의 앞 벡터를 out 에 */
  const fwd = (s, out = new THREE.Vector3()) => { const th = heading(s); out.set(-Math.sin(th), 0, -Math.cos(th)); return out; };
  return { segs, at, atSeg, along, proj, pose, heading, fwd, onRoad, R, roadHalf };
}
