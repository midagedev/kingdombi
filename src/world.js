// 레일(육조거리): 남쪽(+z)에서 출발해 북쪽(-z) 궁궐까지 곧게 뻗은 한 길. 전 구간을 로딩 때 한 번에 짓는다(집 한 채 15~25ms, 50채 ≈ 1초).
// 구역(district)마다 초가/기와 비율·소품 세트·담 밀도가 바뀌고, 정차 지점(stop) 셋에서 웨이브가 온다.
// 각 건물은 재질별 병합 메시 하나로 그려지고(드로우콜 억제), 원본 부위 메시는 파괴 시 물리 파편으로 쓴다.
import * as THREE from 'three';
import { createPath } from './path.js';
import { PRESETS, buildBuilding, buildPalaceCompound } from 'cheoma/building';
import { buildTempleCompound } from 'cheoma/src/api/temple.js';
import { buildProp } from 'cheoma/src/api/props.js';
import { mergeStatic } from 'cheoma/src/village/instancing.js';
import { canonicalizeSharedMaterials } from 'cheoma/src/builder/palette.js';

export const ROAD_HALF = 7;      // 길 반폭(m). 이 안엔 집이 없고 소품만 가끔 놓인다(들이받을 것)
export const ROUTE = {
  // 레일 좌표(s): 출발점 0, 앞으로 갈수록 커진다(src/path.js). 옛 z 값과의 관계 s = 14 − z.
  start: { x: 0, z: 14 },        // 마차 출발 월드 좌표(s = 0)
  end: 464,                      // 궁궐 광장(길 끝) s
  // 90° 코너 [{ s, turn }] — turn −π/2 우회전 · +π/2 좌회전. 비면 옛 직선과 동일.
  // 북 0→190 · 시전(164) 지나 우회전 → 동 190→250 → 좌회전 → 북 250→. 절 문(314)·궁궐(464)은 마지막 북향 구간 — 보스가 코너 너머에 서지 않고 궁궐도 회전 없이 남향.
  corners: [{ s: 190, turn: -Math.PI / 2 }, { s: 250, turn: Math.PI / 2 }],
  R: 16,                         // 마차가 코너를 도는 호 반경
  stub: 36,                      // 코너 뒤로 옛 방향 길이 이어지는 옆길 길이(집·길 띠) — 떼가 골목에서 쏟아지는 자리
  palace: { s: 534, tier: 'capital' },               // 58×90 → 남쪽 정문이 s≈489 에서 광장을 본다. 마지막 구간이 북향이어야 회전이 없다
  temple: { s: 198, lat: -72, y: 5, yaw: 0.4 },      // 동향 구간 왼쪽(북) 언덕 = 꺾인 길 안쪽 크룩. 마지막 구간 기준으론 절 문(314) 왼쪽 52 m, 8 m 앞 — 옛 배치와 같은 자리
  stops: [
    { s: 164, name: '시전 거리', sub: '장이 서던 곳', boss: null, quota: 180, cap: 80, mix: { brute: 0.02, bomber: 0.08, runner: 0.22 } },
    { s: 314, name: '절 문 앞', sub: '종이 울리지 않는다', boss: 'giant', quota: 260, cap: 100, mix: { brute: 0.06, bomber: 0.12, runner: 0.16 } },
    { s: 464, name: '궁궐 광장', sub: '문이 열려 있다', boss: 'rex', quota: 380, cap: 130, mix: { brute: 0.08, bomber: 0.15, runner: 0.22 } },
  ],
  // 추격 압박 곡선(2026-09-03): 구역이 바뀔 때 떼의 정원(cap, 전체 좀비 수 비율)·종류 비율(mix)·속도 배율(speed)이 오른다.
  // speed 1.6~1.8(2026-09-04, 전 1.45~1.65 — "더 공격적으로 와도 괜찮겠어"): 마차 5 m/s 보다 모두 빨라야 파가 밀물처럼 닥쳐 12 m 뒤에 뭉친다 — 느리면 14~55 m 에 흩어져 작은 점을 하나씩 잡는 게임이 된다(실측 3 킬/초).
  // speed 는 마차 5.0 m/s 를 보통형(3.6~5.2)이 따라잡을 만큼은 돼야 한다 — 1.15 면 절반, 1.3 이면 대부분이 붙는다.
  districts: [
    { s1: 164, name: '초가 마을', choga: 0.85, wall: 0.25, cap: 0.75, speed: 1.6, mix: { brute: 0.02, bomber: 0.06, runner: 0.14 }, props: ['haystack', 'jangdokdae', 'well', 'jige', 'chicken-coop', 'brush-fence', 'mortar-pestle', 'straw-mat'], lane: ['haystack', 'jige', 'straw-mat'] },
    { s1: 314, name: '기와 골목', choga: 0.45, wall: 0.7, cap: 0.9, speed: 1.7, mix: { brute: 0.04, bomber: 0.10, runner: 0.20 }, props: ['stone-lantern', 'jangdokdae', 'stone-wall', 'straw-mat', 'jangseung-pair', 'garden-rock', 'well'], lane: ['jangdokdae', 'haystack', 'jangseung'] },
    { s1: 464, name: '육조 거리', choga: 0.1, wall: 0.9, cap: 1.0, speed: 1.8, mix: { brute: 0.07, bomber: 0.14, runner: 0.26 }, props: ['stone-lantern', 'haetae', 'pagoda', 'rank-stones', 'ding-censer', 'stone-wall', 'danggan'], lane: ['stone-lantern', 'haetae', 'rank-stones'] },
  ],
};
export const createRoutePath = () => createPath({ start: ROUTE.start, corners: ROUTE.corners, R: ROUTE.R, roadHalf: ROAD_HALF });

// 결정적 난수(같은 길이 매번 나온다 — 데모·디버그·클립 재현)
export function rng(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 시각적으로 동일한 재질을 건물 전체에서 하나로 통일 → 병합 후 드로우콜이 재질 종류 수까지 떨어진다.
const MAT_CANON = new Map();
const _bb = new THREE.Box3(), _im = new THREE.Matrix4(), _wm = new THREE.Matrix4();
function partBox(mesh) {
  if (!mesh.isInstancedMesh) return new THREE.Box3().setFromObject(mesh);
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const out = new THREE.Box3();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, _im); _wm.multiplyMatrices(mesh.matrixWorld, _im);
    _bb.copy(mesh.geometry.boundingBox).applyMatrix4(_wm); out.union(_bb);
  }
  return out;
}

const MIN_PART_VOLUME = 0.02; // m³ — 이보다 작은 부위는 파편 몸체 대신 파티클로만 터진다

// 건물 subtree 를 "부위(part)" 목록으로 평탄화한다. 부위 = 렌더 가능한 mesh 하나(월드 변환 포함).
// 드로우콜의 근원은 재질 수(기와집 한 채 = 43종). 잉크 룩에서 색은 정점색으로 충분하다 — 불투명 표준 재질의 color 를
// 정점 color 로 굽고, 같은 텍스처(map·bumpMap)를 쓰는 부위는 vertexColors 재질 하나를 공유한다 → 43 → ~15.
// 창호(hanjiGlow)·밝은 발광(아궁이 불)·투명은 그대로 둔다(nightlife 가 태그를 읽는다).
const SHARED = new Map();
const seenGeo = new WeakSet();
function bakeVertexColors(root) {
  root.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh)) return;
    const m = o.material;
    if (!m?.isMeshStandardMaterial || Array.isArray(m) || m.transparent || m.emissiveMap || m.alphaMap || m.userData?.hanjiGlow != null) return;
    if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.6) return;
    let g = o.geometry;
    if (seenGeo.has(g)) { g = g.clone(); o.geometry = g; }   // 공유 geometry 는 색이 다를 수 있으니 복제
    seenGeo.add(g);
    const n = g.attributes.position.count, c = new Float32Array(n * 3), col = m.color;
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    const key = `${m.map?.uuid ?? '-'}|${m.bumpMap?.uuid ?? '-'}|${m.side}`;
    let sm = SHARED.get(key);
    if (!sm) {
      sm = new THREE.MeshStandardMaterial({ map: m.map ?? null, bumpMap: m.bumpMap ?? null, bumpScale: m.bumpScale, side: m.side, roughness: m.roughness, metalness: m.metalness, vertexColors: true });
      sm.userData = { ...m.userData }; SHARED.set(key, sm);
    }
    o.material = sm;
  });
}

function collectParts(root) {
  // strict merge 가 거부하는 것들(숨김 오브젝트·조명·renderOrder)은 미리 걷어낸다 — 어차피 이 게임의 룩엔 필요 없다.
  const junk = [];
  root.traverse((o) => { if (o !== root && (o.visible === false || o.isLight || o.renderOrder !== 0)) junk.push(o); });
  for (const o of junk) o.removeFromParent();
  bakeVertexColors(root);
  canonicalizeSharedMaterials(root, MAT_CANON);
  root.updateWorldMatrix(true, true);
  const parts = [];
  root.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || !o.geometry) return;
    parts.push(o);
  });
  return parts;
}

function buildingRecord(kind, root, scene) {
  const parts = collectParts(root);
  // 루트 하나만 넘겨 루트의 위치·회전을 보존한다(부위를 직접 넘기면 부모 변환이 날아간다).
  // 부위마다 __mergeSrc 태그를 달아 병합 메시 안의 정점 레인지를 부위 id 로 추적 → 파괴 시 그 레인지만 접는다.
  parts.forEach((m, i) => { m.userData.__mergeSrc = i; });
  const merged = mergeStatic([root], `${kind}-merged`, { ids: [-1], partitionShadowFlags: true, reattachShadowDepthTextureLifecycle: true });
  merged.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  scene.add(merged);

  const bounds = new THREE.Box3().setFromObject(root);
  const partInfo = parts.map((mesh, i) => {
    const box = partBox(mesh);
    const size = box.getSize(new THREE.Vector3());
    return { id: i, mesh, box, size, volume: size.x * size.y * size.z, center: box.getCenter(new THREE.Vector3()), destroyed: false };
  });
  // 부위별 체력: 부피가 클수록 단단하다. 지붕(위쪽)은 얇고 잘 부서지게.
  for (const p of partInfo) {
    const h = (p.center.y - bounds.min.y) / Math.max(1e-3, bounds.max.y - bounds.min.y);
    p.hp = kind === 'prop' ? 1.5 + Math.cbrt(p.volume) * 3 : 4 + Math.cbrt(p.volume) * 12 * (h > 0.6 ? 0.5 : 1);
  }
  const center = bounds.getCenter(new THREE.Vector3());
  return {
    kind, root, merged, bounds, center, parts: partInfo,
    hide: (id) => merged.userData.setHidden?.(id, true),
    hp: partInfo.reduce((a, p) => a + p.hp, 0) * 0.14,   // 이 값이 0이면 남은 부위가 통째로 무너진다
    alive: true,
  };
}

// 출발점 뒤(s<0)도 첫 구역이다 — 예전엔 마지막 구역으로 떨어져 출발 직후 육조거리 규칙이 잠깐 적용됐다
export function districtAt(s) { return ROUTE.districts.find((d) => s < d.s1) || ROUTE.districts[ROUTE.districts.length - 1]; }
function nearStop(s, r = 18) { return ROUTE.stops.some((st) => Math.abs(st.s - s) < r); }

// seed: 날짜 해시(데일리 시드) — 같은 날엔 모두가 같은 길을 달린다
export function buildWorld(scene, seed = 20260903, path = createRoutePath()) {
  const buildings = [];
  const rand = rng(seed);
  const _a = { s: 0, lat: 0, k: 0 }, _v = new THREE.Vector3();
  let seedN = 1000;
  const place = (kind, root, x, y, z, yaw) => { root.position.set(x, y, z); root.rotation.y = yaw; const b = buildingRecord(kind, root, scene); path.along(b.center.x, b.center.z, _a); b.s = _a.s; b.lat = _a.lat; buildings.push(b); return b; };
  // (s, lat) 배치 — yaw 는 그 자리 길 헤딩에 더해진다(길이 어느 쪽을 향해도 정면이 길을 본다)
  const houseAt = (style, s, lat, yaw, g = null) => { (g ? path.atSeg(g, s, lat, _v) : path.at(s, lat, _v)); return place(style, buildBuilding({ ...PRESETS[style], seed: seedN++ }), _v.x, 0, _v.z, (g ? g.th : path.heading(s)) + yaw); };
  const propAt = (name, s, lat, yaw = 0, opts = {}, g = null) => { (g ? path.atSeg(g, s, lat, _v) : path.at(s, lat, _v)); return place('prop', buildProp(name, { seed: seedN++, scale: 1, ...opts }), _v.x, 0, _v.z, (g ? g.th : path.heading(s)) + yaw); };
  // 사찰 언덕·궁궐 앞은 집을 비운다. 코너 안쪽·옆길 회랑도(다른 구간의 길 위).
  const T = ROUTE.temple; path.at(T.s, T.lat, _v); const templeX = _v.x, templeZ = _v.z;
  const blocked = (x, z, s) => Math.hypot(x - templeX, z - templeZ) < 42 || s > ROUTE.end + 12;

  // ── 랜드마크 ──
  const palace = buildPalaceCompound({ tier: ROUTE.palace.tier, seed: 5 });
  path.at(ROUTE.palace.s, 0, _v);
  const palaceRec = place('palace', palace, _v.x, 0, _v.z, path.heading(ROUTE.palace.s));
  palaceRec.landmark = true;
  const temple = buildTempleCompound({ variant: 'compact', seed: 11 });
  place('temple', temple, templeX, T.y, templeZ, path.heading(T.s) + T.yaw).landmark = true;
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(24, 38, T.y, 24, 1), new THREE.MeshStandardMaterial({ color: 0x4a463e, roughness: 1 }));
  hill.position.set(templeX, T.y / 2, templeZ); hill.receiveShadow = true; scene.add(hill);

  // ── 길 양편 집: 정면이 길을 본다. 왼쪽(lat<0)은 +π/2 를, 오른쪽은 −π/2 를 향한다 ──
  // 구간마다 짓는다. 출발점 뒤(s<0)로도 70 m — 추격 카메라가 뒤를 보므로 첫 10초 동안 빈 벌판이 화면을 채웠다(2026-09-03 실측).
  // 코너 뒤로는 옛 방향으로 stub 만큼 이어 짓는다(옆길). 다른 구간의 길 회랑 안(중심선에서 13 m)에 들어오는 집은 건너뛴다 — 코너 안쪽이 비고 옆길이 뚫린다.
  for (const g of path.segs) {
    const sa = g.s0 === -Infinity ? -70 : g.s0, sb = g.s1 === Infinity ? ROUTE.end + 6 : g.s1 + ROUTE.stub;
    for (const side of [-1, 1]) {
      let s = sa;
      while (s < sb) {
        const d = districtAt(s);
        const depth = 13 + rand() * 5;              // 길 중심에서 집 중심까지
        path.atSeg(g, s, side * depth, _v);
        if (!blocked(_v.x, _v.z, s) && !path.onRoad(_v.x, _v.z, 6, ROUTE.stub) && !(nearStop(s, 14) && rand() < 0.5)) {
          const style = rand() < d.choga ? 'choga' : 'giwa';
          houseAt(style, s, side * depth, side * Math.PI / 2 + (rand() - 0.5) * 0.24, g);
          // 집 사이 담(길가 lat≈±9.3): 구역의 담 밀도만큼
          if (rand() < d.wall) propAt(rand() < 0.5 ? 'stone-wall' : 'brush-fence', s - 7.5 - rand() * 2, side * 9.3, Math.PI / 2, { length: 4 + rand() * 3 }, g);
        }
        s += 11 + rand() * 7;
      }
    }
  }

  // ── 소품: 길가(lat≈±8) 12~20m 마다, 차선 안(|lat|<3.5) 35m 마다 들이받을 것 하나 ──
  for (let s = -60; s < ROUTE.end + 20; s += 12 + rand() * 8) {
    const d = districtAt(s);
    const side = rand() < 0.5 ? -1 : 1;
    const name = d.props[Math.floor(rand() * d.props.length)];
    propAt(name, s, side * (7.6 + rand() * 1.6), name === 'stone-wall' ? Math.PI / 2 : rand() * 6.28, name === 'stone-wall' ? { length: 4 + rand() * 3 } : {});
  }
  for (let s = 45; s < ROUTE.end + 10; s += 30 + rand() * 14) {
    if (nearStop(s, 10)) continue;
    const d = districtAt(s);
    const name = d.lane[Math.floor(rand() * d.lane.length)];
    propAt(name, s, (rand() - 0.5) * 6, rand() * 6.28, { scale: name === 'haystack' ? 1.3 : 1 });
  }
  // ── 정차 지점 연출: 시전(장독대·멍석·낟가리 빽빽), 절 문(석등 열·당간), 광장(해태 한 쌍·석탑) ── (옛 z − a ≡ s + a)
  const [S1, S2, S3] = ROUTE.stops;
  for (let k = 0; k < 10; k++) { const side = k % 2 ? 1 : -1; propAt(['jangdokdae', 'straw-mat', 'haystack', 'jige', 'chicken-coop'][k % 5], S1.s + 26 - rand() * 46, side * (6 + rand() * 4), rand() * 6.28); }
  for (let k = 0; k < 4; k++) propAt('stone-lantern', S2.s + 24 - k * 12, -7.5, 0);
  propAt('danggan', S2.s + 6, -12, 0); propAt('pagoda', S2.s + 18, 6.5, 0, { scale: 1.1 });
  propAt('haetae', S3.s + 14, -5.5, 0); propAt('haetae', S3.s + 14, 5.5, 0, { mirror: true });
  propAt('jangseung-pair', S3.s + 22, 0, 0, { scale: 1.2 });

  return { buildings, hill, path };
}

export { MIN_PART_VOLUME };
