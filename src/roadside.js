// 길가 밀도(2026-09-03 AAA 룩 6차): 길 밖 맨땅이 '비어 있음'으로 읽혔다. 풀 포기 3000(교차 쿼드 2장, 바람에 흔들림) + 돌 400 을 인스턴스 두 드로우로.
// 배치는 레일 좌표(path.at(s, lat))로 길 양옆 |lat| 9~42 m — 길 위·집 AABB·사찰 언덕·궁궐 뒤는 비운다. 세계 레이어(잉크가 회색으로 남긴다).
import * as THREE from 'three';

function tuftTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) { const x0 = 12 + i * 5 + Math.random() * 3, lean = (Math.random() - 0.5) * 22, h = 26 + Math.random() * 30; g.lineWidth = 2 + Math.random() * 2; g.beginPath(); g.moveTo(x0, 64); g.quadraticCurveTo(x0 + lean * 0.4, 64 - h * 0.6, x0 + lean, 64 - h); g.stroke(); }
  return new THREE.CanvasTexture(c);
}

export function createRoadside(scene, path, world, { end = 464, stub = 36, roadHalf = 7, isMobile = false } = {}) {
  const hill = world.hill?.position;
  const ok = (x, z, s) => {
    if (path.onRoad(x, z, 1.5, stub) || s > end + 14) return false;
    if (hill && Math.hypot(x - hill.x, z - hill.z) < 44) return false;
    for (const b of world.buildings) { const bb = b.bounds; if (x > bb.min.x - 0.6 && x < bb.max.x + 0.6 && z > bb.min.z - 0.6 && z < bb.max.z + 0.6) return false; }
    return true;
  };
  const place = (n, latMin, latMax) => {
    const out = [], p = new THREE.Vector3();
    for (let k = 0, tries = 0; k < n && tries < n * 6; tries++) {
      const s = -80 + Math.random() * (end + 120), lat = (latMin + Math.random() * (latMax - latMin)) * (Math.random() < 0.5 ? -1 : 1);
      path.at(s, lat, p); if (!ok(p.x, p.z, s)) continue;
      out.push([p.x, p.z]); k++;
    }
    return out;
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  // 풀: 교차 쿼드 2장(아래 고정, 위가 흔들린다)
  const NG = isMobile ? 1400 : 3000;
  const q1 = new THREE.PlaneGeometry(0.7, 0.55, 1, 2); q1.translate(0, 0.275, 0); const q2 = q1.clone(); q2.rotateY(Math.PI / 2);
  const grassGeo = (() => { const a = q1.toNonIndexed(), b = q2.toNonIndexed(); const g = new THREE.BufferGeometry(); const n = a.attributes.position.count; const P = new Float32Array(n * 6), N = new Float32Array(n * 6), U = new Float32Array(n * 4); P.set(a.attributes.position.array); P.set(b.attributes.position.array, n * 3); N.set(a.attributes.normal.array); N.set(b.attributes.normal.array, n * 3); U.set(a.attributes.uv.array); U.set(b.attributes.uv.array, n * 2); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); return g; })();
  const tWind = { value: 0 };
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x3c4a2c, alphaMap: tuftTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = tWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vec4 wp0 = instanceMatrix * vec4(position, 1.0);\n float sway = sin(uWind * 1.7 + wp0.x * 0.35 + wp0.z * 0.27) * 0.5 + sin(uWind * 3.1 + wp0.z * 0.9) * 0.2;\n transformed.x += sway * uv.y * uv.y * 0.22; transformed.z += sway * uv.y * uv.y * 0.08;');
  };
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, NG); grass.frustumCulled = false; grass.receiveShadow = true;
  place(NG, roadHalf + 2, 42).forEach(([x, z], i) => { q.setFromAxisAngle(UP, Math.random() * 6.283); const s = 0.6 + Math.random() * 0.9; sc.set(s, s * (0.7 + Math.random() * 0.6), s); pos.set(x, 0, z); m.compose(pos, q, sc); grass.setMatrixAt(i, m); });
  scene.add(grass);

  // 돌: 눌린 이십면체
  const NS = isMobile ? 180 : 400;
  const stoneGeo = new THREE.IcosahedronGeometry(0.28, 0); stoneGeo.scale(1.3, 0.7, 1.0);
  const stones = new THREE.InstancedMesh(stoneGeo, new THREE.MeshStandardMaterial({ color: 0x585652, roughness: 0.9 }), NS); stones.frustumCulled = false; stones.castShadow = true; stones.receiveShadow = true;
  place(NS, roadHalf + 1, 45).forEach(([x, z], i) => { q.setFromAxisAngle(UP, Math.random() * 6.283); const s = 0.4 + Math.random() * 1.4; sc.set(s, s * (0.6 + Math.random() * 0.8), s * (0.8 + Math.random() * 0.5)); pos.set(x, -0.05, z); m.compose(pos, q, sc); stones.setMatrixAt(i, m); });
  scene.add(stones);

  return { update: (time) => { tWind.value = time; }, grass, stones };
}
