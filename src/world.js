// 레일(육조거리): 남쪽(+z)에서 출발해 북쪽(-z) 궁궐까지 곧게 뻗은 한 길. 전 구간을 로딩 때 한 번에 짓는다(집 한 채 15~25ms, 50채 ≈ 1초).
// 구역(district)마다 초가/기와 비율·소품 세트·담 밀도가 바뀌고, 정차 지점(stop) 셋에서 웨이브가 온다.
// 각 건물은 재질별 병합 메시 하나로 그려지고(드로우콜 억제), 원본 부위 메시는 파괴 시 물리 파편으로 쓴다.
import * as THREE from 'three';
import { PRESETS, buildBuilding, buildPalaceCompound } from 'cheoma/building';
import { buildTempleCompound } from 'cheoma/src/api/temple.js';
import { buildProp } from 'cheoma/src/api/props.js';
import { mergeStatic } from 'cheoma/src/village/instancing.js';
import { canonicalizeSharedMaterials } from 'cheoma/src/builder/palette.js';

export const ROAD_HALF = 7;      // 길 반폭(m). 이 안엔 집이 없고 소품만 가끔 놓인다(들이받을 것)
export const ROUTE = {
  start: 14,                     // 마차 출발 z
  end: -450,                     // 궁궐 광장(길 끝)
  palace: { x: 0, z: -520, tier: 'capital' },        // 58×90 → 남쪽 정문이 z≈-475 에서 광장을 본다
  temple: { x: -52, z: -338, y: 5, yaw: 0.4 },       // 두 번째 정차 지점 왼쪽 언덕
  stops: [
    { z: -150, name: '시전 거리', sub: '장이 서던 곳', boss: null, quota: 180, cap: 80, mix: { brute: 0.02, bomber: 0.08, runner: 0.22 } },
    { z: -300, name: '절 문 앞', sub: '종이 울리지 않는다', boss: 'giant', quota: 260, cap: 100, mix: { brute: 0.06, bomber: 0.12, runner: 0.16 } },
    { z: -450, name: '궁궐 광장', sub: '문이 열려 있다', boss: 'rex', quota: 380, cap: 130, mix: { brute: 0.08, bomber: 0.15, runner: 0.22 } },
  ],
  districts: [
    { z0: 0, z1: -150, name: '초가 마을', choga: 0.85, wall: 0.25, props: ['haystack', 'jangdokdae', 'well', 'jige', 'chicken-coop', 'brush-fence', 'mortar-pestle', 'straw-mat'], lane: ['haystack', 'jige', 'straw-mat'] },
    { z0: -150, z1: -300, name: '기와 골목', choga: 0.45, wall: 0.7, props: ['stone-lantern', 'jangdokdae', 'stone-wall', 'straw-mat', 'jangseung-pair', 'garden-rock', 'well'], lane: ['jangdokdae', 'haystack', 'jangseung'] },
    { z0: -300, z1: -450, name: '육조 거리', choga: 0.1, wall: 0.9, props: ['stone-lantern', 'haetae', 'pagoda', 'rank-stones', 'ding-censer', 'stone-wall', 'danggan'], lane: ['stone-lantern', 'haetae', 'rank-stones'] },
  ],
};

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

export function districtAt(z) { return ROUTE.districts.find((d) => z <= d.z0 && z > d.z1) || ROUTE.districts[ROUTE.districts.length - 1]; }
function nearStop(z, r = 18) { return ROUTE.stops.some((s) => Math.abs(s.z - z) < r); }
// 사찰 언덕·궁궐 앞은 집을 비운다
function blocked(x, z) {
  const T = ROUTE.temple; if (x < -22 && z < T.z + 34 && z > T.z - 34) return true;
  if (z < -462) return true;
  return false;
}

// seed: 날짜 해시(데일리 시드) — 같은 날엔 모두가 같은 길을 달린다
export function buildWorld(scene, seed = 20260903) {
  const buildings = [];
  const rand = rng(seed);
  let seedN = 1000;
  const place = (kind, root, x, y, z, yaw) => { root.position.set(x, y, z); root.rotation.y = yaw; const b = buildingRecord(kind, root, scene); buildings.push(b); return b; };
  const house = (style, x, z, yaw) => place(style, buildBuilding({ ...PRESETS[style], seed: seedN++ }), x, 0, z, yaw);
  const prop = (name, x, z, yaw = 0, opts = {}) => place('prop', buildProp(name, { seed: seedN++, scale: 1, ...opts }), x, 0, z, yaw);

  // ── 랜드마크 ──
  const palace = buildPalaceCompound({ tier: ROUTE.palace.tier, seed: 5 });
  const palaceRec = place('palace', palace, ROUTE.palace.x, 0, ROUTE.palace.z, 0);
  palaceRec.landmark = true;
  const temple = buildTempleCompound({ variant: 'compact', seed: 11 });
  place('temple', temple, ROUTE.temple.x, ROUTE.temple.y, ROUTE.temple.z, ROUTE.temple.yaw).landmark = true;
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(24, 38, ROUTE.temple.y, 24, 1), new THREE.MeshStandardMaterial({ color: 0x4a463e, roughness: 1 }));
  hill.position.set(ROUTE.temple.x, ROUTE.temple.y / 2, ROUTE.temple.z); hill.receiveShadow = true; scene.add(hill);

  // ── 길 양편 집: 정면이 길을 본다. 왼쪽(x<0)은 +x 를, 오른쪽은 -x 를 향한다 ──
  for (const side of [-1, 1]) {
    let z = ROUTE.start - 26;
    while (z > ROUTE.end - 6) {
      const d = districtAt(z);
      const depth = 13 + rand() * 5;              // 길 중심에서 집 중심까지
      const x = side * depth;
      if (!blocked(x, z) && !(nearStop(z, 14) && rand() < 0.5)) {
        const style = rand() < d.choga ? 'choga' : 'giwa';
        house(style, x, z, side * Math.PI / 2 + (rand() - 0.5) * 0.24);
        // 집 사이 담(길가 x≈±9.3): 구역의 담 밀도만큼
        if (rand() < d.wall) prop(rand() < 0.5 ? 'stone-wall' : 'brush-fence', side * 9.3, z + 7.5 + rand() * 2, Math.PI / 2, { length: 4 + rand() * 3 });
      }
      z -= 11 + rand() * 7;
    }
  }

  // ── 소품: 길가(x≈±8) 12~20m 마다, 차선 안(|x|<3.5) 35m 마다 들이받을 것 하나 ──
  for (let z = ROUTE.start - 20; z > ROUTE.end - 20; z -= 12 + rand() * 8) {
    const d = districtAt(z);
    const side = rand() < 0.5 ? -1 : 1;
    const name = d.props[Math.floor(rand() * d.props.length)];
    prop(name, side * (7.6 + rand() * 1.6), z, name === 'stone-wall' ? Math.PI / 2 : rand() * 6.28, name === 'stone-wall' ? { length: 4 + rand() * 3 } : {});
  }
  for (let z = ROUTE.start - 45; z > ROUTE.end - 10; z -= 30 + rand() * 14) {
    if (nearStop(z, 10)) continue;
    const d = districtAt(z);
    const name = d.lane[Math.floor(rand() * d.lane.length)];
    prop(name, (rand() - 0.5) * 6, z, rand() * 6.28, { scale: name === 'haystack' ? 1.3 : 1 });
  }
  // ── 정차 지점 연출: 시전(장독대·멍석·낟가리 빽빽), 절 문(석등 열·당간), 광장(해태 한 쌍·석탑) ──
  const [S1, S2, S3] = ROUTE.stops;
  for (let k = 0; k < 10; k++) { const side = k % 2 ? 1 : -1; prop(['jangdokdae', 'straw-mat', 'haystack', 'jige', 'chicken-coop'][k % 5], side * (6 + rand() * 4), S1.z - 26 + rand() * 46, rand() * 6.28); }
  for (let k = 0; k < 4; k++) prop('stone-lantern', -7.5 + k * 0.0, S2.z - 24 + k * 12, 0);
  prop('danggan', -12, S2.z - 6, 0); prop('pagoda', 6.5, S2.z - 18, 0, { scale: 1.1 });
  prop('haetae', -5.5, S3.z - 14, 0); prop('haetae', 5.5, S3.z - 14, 0, { mirror: true });
  prop('jangseung-pair', 0, S3.z - 22, 0, { scale: 1.2 });

  return { buildings, hill };
}

export { MIN_PART_VOLUME };
