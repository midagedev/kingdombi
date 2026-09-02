// 아레나 구성: 절차생성(cheoma) 건물을 손으로 배치한다. +z = 남쪽(플레이어), -z = 북쪽(궁궐·좀비 출구).
// 각 건물은 재질별 병합 메시 하나로 그려지고(드로우콜 억제), 원본 부위 메시는 파괴 시 물리 파편으로 쓴다.
import * as THREE from 'three';
import { PRESETS, buildBuilding, buildPalaceCompound } from 'cheoma/building';
import { buildTempleCompound } from 'cheoma/src/api/temple.js';
import { mergeStatic } from 'cheoma/src/village/instancing.js';
import { canonicalizeSharedMaterials } from 'cheoma/src/builder/palette.js';

// 시각적으로 동일한 재질을 건물 전체에서 하나로 통일 → 병합 후 드로우콜이 재질 종류 수까지 떨어진다.
const MAT_CANON = new Map();
const _bb = new THREE.Box3(), _v = new THREE.Vector3(), _im = new THREE.Matrix4(), _wm = new THREE.Matrix4();
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

export const LAYOUT = {
  palace: { x: 0, z: -175, tier: 'capital' },            // 58×90, 남향 정문이 플레이어를 본다
  temple: { x: -58, z: -92, y: 5, yaw: 0.35 },           // 서쪽 언덕 위 소규모 사찰
  houses: [
    { style: 'giwa',  x: -22, z: -96, yaw:  0.08 },
    { style: 'choga', x:  22, z: -84, yaw: -0.12 },
    { style: 'giwa',  x:  20, z: -56, yaw:  0.18 },
    { style: 'choga', x: -21, z: -52, yaw: -0.06 },
    { style: 'giwa',  x: -14, z: -26, yaw:  Math.PI + 0.35 }, // 길 한복판 가까이, 첫 파괴 대상
  ],
  player: { x: 0, y: 3.2, z: 30 },
  spawn: { x: 0, z: -105, halfW: 20 },                    // 궁 정문 앞 광장에서 쏟아진다
};

const MIN_PART_VOLUME = 0.02; // m³ — 이보다 작은 부위는 파편 몸체 대신 파티클로만 터진다

// 건물 subtree 를 "부위(part)" 목록으로 평탄화한다. 부위 = 렌더 가능한 mesh 하나(월드 변환 포함).
function collectParts(root) {
  // strict merge 가 거부하는 것들(숨김 오브젝트·조명·renderOrder)은 미리 걷어낸다 — 어차피 이 게임의 룩엔 필요 없다.
  const junk = [];
  root.traverse((o) => { if (o !== root && (o.visible === false || o.isLight || o.renderOrder !== 0)) junk.push(o); });
  for (const o of junk) o.removeFromParent();
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
    p.hp = 4 + Math.cbrt(p.volume) * 12 * (h > 0.6 ? 0.5 : 1);
  }
  return {
    kind, root, merged, bounds, parts: partInfo,
    hide: (id) => merged.userData.setHidden?.(id, true),
    hp: partInfo.reduce((a, p) => a + p.hp, 0) * 0.14,   // 이 값이 0이면 남은 부위가 통째로 무너진다
    alive: true,
  };
}

export function buildWorld(scene) {
  const buildings = [];

  const palace = buildPalaceCompound({ tier: LAYOUT.palace.tier, seed: 5 });
  palace.position.set(LAYOUT.palace.x, 0, LAYOUT.palace.z);
  buildings.push(buildingRecord('palace', palace, scene));

  const temple = buildTempleCompound({ variant: 'compact', seed: 11 });
  temple.position.set(LAYOUT.temple.x, LAYOUT.temple.y, LAYOUT.temple.z);
  temple.rotation.y = LAYOUT.temple.yaw;
  buildings.push(buildingRecord('temple', temple, scene));

  for (const h of LAYOUT.houses) {
    const b = buildBuilding({ ...PRESETS[h.style], seed: 1000 + buildings.length });
    b.position.set(h.x, 0, h.z);
    b.rotation.y = h.yaw;
    buildings.push(buildingRecord(h.style, b, scene));
  }

  // 사찰 언덕 (단순 흙더미)
  const hill = new THREE.Mesh(
    new THREE.CylinderGeometry(26, 40, LAYOUT.temple.y, 24, 1),
    new THREE.MeshStandardMaterial({ color: 0x4a463e, roughness: 1 }),
  );
  hill.position.set(LAYOUT.temple.x, LAYOUT.temple.y / 2, LAYOUT.temple.z);
  hill.receiveShadow = true;
  scene.add(hill);

  return { buildings, hill };
}

export { MIN_PART_VOLUME };
