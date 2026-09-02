// 밤의 생활감: 한지 창호 호롱불(cheoma 의 hanjiGlow 재질 태그 재사용) + 처마 끝 등롱. 전부 호박색 스팟컬러.
import * as THREE from 'three';
import { candleFlicker } from 'cheoma/src/env/night-glow.js';
import { LAYER_SPOT } from './look.js';

const WARM = new THREE.Color(0xffb35c);
const LANTERN = new THREE.Color(0xffb347);

export function createNightlife(scene, buildings) {
  const windows = [];   // { spotMat, worldMat, base, dim, phase }
  const lanterns = [];  // { mat, light, phase }

  let idx = 0;
  for (const b of buildings) {
    b.merged.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const m = mesh.material;
      const base = m?.userData?.hanjiGlow;
      if (base == null) return;
      const h = (Math.sin((idx + 1) * 12.9898) * 43758.5453) % 1;
      const dim = Math.abs(h) < 0.16 ? 0.45 : 0.85 + 0.15 * Math.abs(h);
      // 세계 패스: 창이 중간톤으로 살짝 밝아진다
      m.emissive.copy(WARM); m.emissiveMap = m.map || null; m.emissiveIntensity = base * dim * 2.2; m.needsUpdate = true;
      // 스팟 패스: 같은 geometry 를 호박색으로 한 번 더 — 병합 레인지가 접히면(파괴) 함께 사라진다
      const spotMat = new THREE.MeshBasicMaterial({ color: LANTERN, map: m.map || null });
      const glow = new THREE.Mesh(mesh.geometry, spotMat);
      glow.layers.set(LAYER_SPOT);
      mesh.add(glow);
      windows.push({ spotMat, worldMat: m, base, dim, phase: idx * 1.7 });
      idx++;
    });

    // 처마 등롱: 남쪽(+z, 플레이어 쪽) 정면 양 끝 처마 밑에 하나씩. 궁궐·절은 정면 폭을 따라 여럿.
    const { min, max } = b.bounds;
    const eaveY = b.kind === 'palace' ? 7.5 : b.kind === 'temple' ? min.y + 5.2 : min.y + 3.1;
    const n = b.kind === 'palace' ? 6 : b.kind === 'temple' ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.5 : (k + 0.5) / n;
      const x = THREE.MathUtils.lerp(min.x + 1.2, max.x - 1.2, t);
      const z = max.z - (b.kind === 'palace' ? 3.5 : 0.9);
      addLantern(x, eaveY, z, b.kind === 'giwa' || b.kind === 'choga');
    }
  }

  function addLantern(x, y, z, withLight) {
    const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    // 끈 + 종이 몸통(세계 레이어, 어둡게) + 불(스팟)
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0x111111 })); cord.position.y = 0.25; g.add(cord);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, emissive: 0xffb35c, emissiveIntensity: 1.6, roughness: 1 }));
    body.scale.set(1, 1.25, 1); body.position.y = -0.3; g.add(body);
    const mat = new THREE.MeshBasicMaterial({ color: LANTERN });
    const fire = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat); fire.scale.set(1, 1.25, 1); fire.position.y = -0.3; fire.layers.set(LAYER_SPOT); g.add(fire);
    let light = null;
    if (withLight) { light = new THREE.PointLight(0xffb347, 22, 15, 1.9); light.position.y = -0.4; g.add(light); }
    lanterns.push({ mat, light, body, phase: Math.random() * 20, group: g });
  }

  let t = 0;
  function update(dt) {
    t += dt;
    for (const w of windows) {
      const f = candleFlicker(t, w.phase) * w.dim;
      w.spotMat.color.copy(LANTERN).multiplyScalar(f * (0.55 + w.base * 1.8));
      w.worldMat.emissiveIntensity = w.base * f * 2.2;
    }
    for (const l of lanterns) {
      const f = candleFlicker(t, l.phase);
      l.mat.color.copy(LANTERN).multiplyScalar(f);
      if (l.light) l.light.intensity = 22 * f;
    }
  }

  // 건물이 무너지면 그 등롱도 떨어진다(간단히: 숨김)
  function onBuildingCollapsed(b) {
    for (const l of lanterns) {
      const p = l.group.position;
      if (p.x >= b.bounds.min.x - 2 && p.x <= b.bounds.max.x + 2 && p.z >= b.bounds.min.z - 2 && p.z <= b.bounds.max.z + 4) {
        l.group.visible = false; if (l.light) l.light.intensity = 0; l.light = null;
      }
    }
  }

  return { update, onBuildingCollapsed, windows, lanterns };
}
