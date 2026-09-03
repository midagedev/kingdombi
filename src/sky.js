// 밤하늘(2026-09-03 AAA 룩 1차): 그라데이션 돔 + 별밭(cheoma 순수 함수) + 크레이터 달 + 달빛 받는 구름 빌보드 + 먹 산 능선(cheoma).
// 전부 세계 레이어 → 잉크 후처리를 통과해 종이 위 먹·흰 점으로 남는다. 카메라를 따라다니고, 안개를 받지 않는다.
import * as THREE from 'three';
import { buildStarField, moonTexel } from 'cheoma/src/env/celestial.js';
import { buildMountains } from 'cheoma/src/env/mountains.js';

const STAR_VERT = /* glsl */`
  attribute float aSize; attribute float aPhase; attribute vec3 aColor;
  uniform float uTime, uPx; varying vec3 vColor; varying float vTw;
  void main() {
    vColor = aColor;
    vTw = 1.0 - 0.13 * sin(uTime * (1.7 + aPhase * 2.3) + aPhase * 40.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPx * 2.4;
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = /* glsl */`
  precision highp float; varying vec3 vColor; varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.25, d);
    gl_FragColor = vec4(vColor * vTw * 4.5, a);   // 잉크 커브가 어두운 점을 눌러 버린다 — 선형 HDR 값을 크게 올려 종이 위 흰 점으로 남긴다
  }
`;

function moonTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  const light = [0.55, 0.42, 0.72]; const ll = Math.hypot(...light); light[0] /= ll; light[1] /= ll; light[2] /= ll;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + 0.5) / size * 2 - 1, ny = 1 - (y + 0.5) / size * 2, r2 = nx * nx + ny * ny, o = (y * size + x) * 4;
    if (r2 > 1) { d[o + 3] = 0; continue; }
    // moonTexel 은 구 uv 를 받는다 → 원반 법선을 uv 로 되돌린다(phi = atan2(z, -x), theta = acos(y))
    const nz = Math.sqrt(1 - r2), u = Math.atan2(nz, -nx) / (Math.PI * 2), v = Math.acos(ny) / Math.PI;
    const t = moonTexel(u, v, light);
    const edge = 1 - Math.pow(Math.max(0, r2 - 0.86) / 0.14, 2);   // 림 안티에일리어싱
    d[o] = t[0] * 255; d[o + 1] = t[1] * 255; d[o + 2] = t[2] * 255; d[o + 3] = 255 * Math.max(0, edge);
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

// fbm 구름 알파(부드러운 덩어리 + 찢어진 가장자리)
function cloudTexture(seed, size = 256) {
  const c = document.createElement('canvas'); c.width = size; c.height = size >> 1;
  const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data;
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 17.3) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const a = hash(ix, iy), b = hash(ix + 1, iy), c2 = hash(ix, iy + 1), d2 = hash(ix + 1, iy + 1); return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d2) * sx * sy; };
  const fbm = (x, y) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { v += noise(x * f, y * f) * a; a *= 0.5; f *= 2.1; } return v; };
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const u = x / c.width * 2 - 1, v = y / c.height * 2 - 1;
    const shape = 1 - (u * u * 0.9 + v * v * 2.2);                      // 납작한 타원 덩어리
    const n = fbm(x / 38 + seed, y / 38);
    const a = Math.max(0, Math.min(1, (shape * 0.9 + (n - 0.45) * 1.6)));
    const lit = 0.55 + 0.45 * fbm(x / 22 + 9, y / 22 - 4);             // 밝은 결(달빛 받는 윗면)
    const o = (y * c.width + x) * 4; d[o] = d[o + 1] = d[o + 2] = 255 * lit; d[o + 3] = 255 * a * a;
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

export function createSky(scene, { night, horizon, moonDir, isMobile = false }) {
  const group = new THREE.Group(); scene.add(group);

  // 돔: 지평선 안개빛 → 천정 검정. 달 쪽 하늘이 은은히 밝다(달무리보다 넓은 산란).
  const dome = new THREE.Mesh(new THREE.SphereGeometry(640, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: night }, bottom: { value: horizon }, uMoon: { value: moonDir } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`uniform vec3 top, bottom, uMoon; varying vec3 vP;
      void main(){ vec3 n = normalize(vP); float h = clamp(n.y, 0.0, 1.0);
        vec3 c = mix(bottom, top, pow(h, 0.45));
        float m = max(0.0, dot(n, uMoon)); c += vec3(0.16, 0.17, 0.22) * pow(m, 9.0) + vec3(0.05, 0.05, 0.07) * pow(m, 2.5);
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  dome.renderOrder = -30; group.add(dome);

  // 별: cheoma 별밭(등급 멱법칙·흑체 색). 한 드로우.
  const sf = buildStarField({ radius: 600, fieldCount: isMobile ? 900 : 1600, minElevationDeg: 4 });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sf.position, 3));
  sg.setAttribute('aColor', new THREE.BufferAttribute(sf.color, 3));
  sg.setAttribute('aSize', new THREE.BufferAttribute(sf.size, 1));
  sg.setAttribute('aPhase', new THREE.BufferAttribute(sf.phase, 1));
  const starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uTime: { value: 0 }, uPx: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(sg, starMat); stars.renderOrder = -29; stars.frustumCulled = false; group.add(stars);

  // 달: 크레이터·바다·위상(cheoma moonTexel) + 달무리
  const moon = new THREE.Mesh(new THREE.CircleGeometry(17, 48), new THREE.MeshBasicMaterial({ map: moonTexture(), transparent: true, fog: false }));
  moon.renderOrder = -28; group.add(moon);
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, fog: false }));
  halo.scale.setScalar(150); halo.renderOrder = -27; group.add(halo);

  // 구름: 빌보드 8장. 달에 가까울수록 밝다(뒤에서 비추는 달빛). 천천히 흐른다.
  const clouds = [];
  const cloudTexs = [cloudTexture(1), cloudTexture(2), cloudTexture(3)];
  const N = isMobile ? 6 : 9;
  for (let i = 0; i < N; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexs[i % 3], transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
    const az = (i / N) * Math.PI * 2 + Math.random() * 0.5, el = 0.12 + Math.random() * 0.3;
    const w = 220 + Math.random() * 200; s.scale.set(w, w * 0.5, 1); s.renderOrder = -26;
    clouds.push({ s, az, el, w, speed: (0.004 + Math.random() * 0.004) * (Math.random() < 0.5 ? 1 : -1) });
    group.add(s);
  }

  // 먹 산: 먼 세 층만(가까운 능선은 460 m 길 앞을 가로막는다). 안개를 끄고 지평선빛보다 살짝 어둡게 — 실루엣만.
  const mt = buildMountains({ seed: 91117 });
  const keep = [];
  mt.group.children.forEach((m) => { if (m.isMesh && m.geometry.type === 'BufferGeometry') keep.push(m); });
  keep.slice(0, 2).forEach((m) => m.removeFromParent());            // 168·232 m 층 제거
  mt.group.traverse((m) => { if (m.material) { m.material.fog = false; m.material.needsUpdate = true; } });
  mt.setPalette(horizon.clone().multiplyScalar(0.62).getHex(), horizon.clone().multiplyScalar(0.85).getHex(), horizon.getHex(), 0.45);
  mt.group.renderOrder = -20; group.add(mt.group);

  const tmp = new THREE.Vector3();
  function update(cam, time, dpr) {
    group.position.set(cam.x, 0, cam.z);
    dome.position.y = cam.y; stars.position.y = cam.y;
    moon.position.set(0, cam.y, 0).addScaledVector(moonDir, 520); moon.lookAt(cam);
    halo.position.set(0, cam.y, 0).addScaledVector(moonDir, 517);
    starMat.uniforms.uTime.value = time; starMat.uniforms.uPx.value = dpr;
    for (const c of clouds) {
      c.az += c.speed * 0.016;
      const d = 480, cx = Math.cos(c.az) * d, cz = Math.sin(c.az) * d, cy = Math.sin(c.el) * d + 20;
      c.s.position.set(cx, cy, cz);
      tmp.set(cx, cy - 20, cz).normalize();
      const m = Math.max(0, tmp.dot(moonDir));
      const lit = 0.30 + 0.75 * Math.pow(m, 5.0);          // 달 뒤 구름은 은빛 가장자리, 반대편은 먹빛
      c.s.material.color.setScalar(lit);
    }
  }
  return { group, update, moon, halo, stars, clouds };
}
