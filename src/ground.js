// 지면(2026-09-03 AAA 룩 1차): 비에 젖은 흙땅 + 바큇자국 난 길.
// 평면 하나는 그대로(물리·좀비 py=0·데칼이 y=0 을 가정) — 밋밋함은 실루엣이 아니라 셰이딩이었다.
// 캔버스로 굽는 알베도·법선·거칠기 맵: 돌·풀·진흙 결, 낮은 거칠기의 물웅덩이(달·등롱 반사가 '젖음'을 판다), 길엔 바큇자국 두 줄과 찢어진 가장자리.
// 바닥 평면은 마차를 따라가므로 텍스처 offset 을 월드 좌표로 고정한다(무늬가 마차와 함께 미끄러지지 않게).
import * as THREE from 'three';

const hash = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
function noise(x, y, s) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; }
// 타일 이음매 없는 fbm: 주기 P 로 좌표를 감는다
function fbmT(x, y, P, s, oct = 5) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { const X = ((x * f) % P + P) % P, Y = ((y * f) % P + P) % P; v += noise(X, Y, s + i * 13) * a; a *= 0.5; f *= 2; } return v; }

function tex(c, srgb) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function heightToNormal(h, w, hgt, strength) {
  const c = document.createElement('canvas'); c.width = w; c.height = hgt; const g = c.getContext('2d'), img = g.createImageData(w, hgt), d = img.data;
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    const l = h[y * w + (x - 1 + w) % w], r = h[y * w + (x + 1) % w], u = h[((y - 1 + hgt) % hgt) * w + x], dn = h[((y + 1) % hgt) * w + x];
    let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const o = (y * w + x) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}

// ── 흙땅 타일(정방형, TILE m) ──
function bakeDirt(S = 512) {
  const alb = document.createElement('canvas'), rough = document.createElement('canvas'); alb.width = alb.height = rough.width = rough.height = S;
  const ga = alb.getContext('2d'), gr = rough.getContext('2d'), ia = ga.createImageData(S, S), ir = gr.createImageData(S, S), h = new Float32Array(S * S);
  const P = 8;   // 노이즈 주기(타일당 8칸)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S * P, v = y / S * P, i = y * S + x, o = i * 4;
    const mud = fbmT(u, v, P, 1, 5);                       // 큰 진흙 굴곡
    const grain = fbmT(u * 6, v * 6, P * 6, 2, 3);         // 잔결
    const stone = Math.pow(Math.max(0, fbmT(u * 5, v * 5, P * 5, 3, 3) - 0.62) / 0.38, 0.7);   // 박힌 돌
    const grass = Math.max(0, fbmT(u * 1.5 + 3, v * 1.5, P * 1.5, 4, 4) - 0.55) / 0.45;            // 풀 얼룩
    const puddle = Math.max(0, Math.min(1, (fbmT(u * 0.9 + 7, v * 0.9 + 2, P * 0.9, 5, 4) - 0.56) / 0.08));   // 물웅덩이(부드러운 가장자리)
    let r = 0.30 + mud * 0.16 + (grain - 0.5) * 0.10, g = 0.27 + mud * 0.14 + (grain - 0.5) * 0.09, b = 0.24 + mud * 0.12 + (grain - 0.5) * 0.08;
    r += stone * 0.28; g += stone * 0.28; b += stone * 0.27;
    r = r * (1 - grass * 0.5) + 0.18 * grass; g = g * (1 - grass * 0.5) + 0.26 * grass; b = b * (1 - grass * 0.5) + 0.14 * grass;
    // 웅덩이: 어둡고 푸른 물빛
    r = r * (1 - puddle * 0.75) + 0.06 * puddle; g = g * (1 - puddle * 0.75) + 0.07 * puddle; b = b * (1 - puddle * 0.75) + 0.10 * puddle;
    ia.data[o] = r * 255; ia.data[o + 1] = g * 255; ia.data[o + 2] = b * 255; ia.data[o + 3] = 255;
    const ro = (0.82 - grass * 0.15 + (grain - 0.5) * 0.1) * (1 - puddle) + 0.10 * puddle;   // 웅덩이는 거울처럼
    ir.data[o] = ir.data[o + 1] = ir.data[o + 2] = ro * 255; ir.data[o + 3] = 255;
    h[i] = (mud * 0.6 + grain * 0.25 + stone * 0.9) * (1 - puddle * 0.9);   // 웅덩이 표면은 평평
  }
  ga.putImageData(ia, 0, 0); gr.putImageData(ir, 0, 0);
  return { map: tex(alb, true), roughnessMap: tex(rough, false), normalMap: tex(heightToNormal(h, S, S, 2.2), false) };
}

// ── 길 타일(가로 W m × 세로 L m): 다져진 흙, 바큇자국 두 줄(물 고임), 노이즈로 찢어진 가장자리 ──
function bakeRoad(W = 18, L = 24, S = 256) {
  const H = S * 2;
  const alb = document.createElement('canvas'), rough = document.createElement('canvas'), alpha = document.createElement('canvas');
  alb.width = rough.width = alpha.width = S; alb.height = rough.height = alpha.height = H;
  const ga = alb.getContext('2d'), gr = rough.getContext('2d'), gl = alpha.getContext('2d');
  const ia = ga.createImageData(S, H), ir = gr.createImageData(S, H), il = gl.createImageData(S, H), h = new Float32Array(S * H);
  const P = 6;
  for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / H, i = y * S + x, o = i * 4;
    const nx = u * P, nz = v * P * (L / W);
    const mud = fbmT(nx, nz, P, 11, 5), grain = fbmT(nx * 5, nz * 5, P * 5, 12, 3);
    const xm = (u - 0.5) * W;                                             // 중심 기준 m
    // 바큇자국: ±1.95 m, 폭 0.5 m, 살짝 구불구불
    const wob = (fbmT(nz * 0.5, 0.3, P * 0.5, 13, 2) - 0.5) * 0.5;
    const rut = Math.max(Math.exp(-Math.pow((Math.abs(xm) - 1.95 - wob) / 0.32, 2)), 0);
    const water = Math.pow(rut, 1.5) * Math.max(0, Math.min(1, (fbmT(nz * 1.2, 0.5, P * 1.2, 14, 3) - 0.35) / 0.2));   // 자국 안 고인 물(끊어져 있다)
    // 중앙 볕: 다져진 부분이 살짝 밝다. 가장자리로 갈수록 흙땅과 섞인다
    const center = Math.max(0, 1 - Math.pow(Math.abs(xm) / (W * 0.5), 2.2));
    let r = 0.34 + mud * 0.14 + (grain - 0.5) * 0.08 + center * 0.07, g = 0.31 + mud * 0.12 + (grain - 0.5) * 0.07 + center * 0.06, b = 0.27 + mud * 0.10 + (grain - 0.5) * 0.06 + center * 0.05;
    r *= 1 - rut * 0.35; g *= 1 - rut * 0.35; b *= 1 - rut * 0.33;
    r = r * (1 - water * 0.7) + 0.07 * water; g = g * (1 - water * 0.7) + 0.08 * water; b = b * (1 - water * 0.7) + 0.11 * water;
    ia.data[o] = r * 255; ia.data[o + 1] = g * 255; ia.data[o + 2] = b * 255; ia.data[o + 3] = 255;
    const ro = (0.78 + (grain - 0.5) * 0.1 - center * 0.08) * (1 - water) + 0.12 * water;
    ir.data[o] = ir.data[o + 1] = ir.data[o + 2] = ro * 255; ir.data[o + 3] = 255;
    // 가장자리 알파: 6.5 m 부터 노이즈로 찢어지며 8.5 m 에 0
    const edgeN = (fbmT(nz * 2.0, u * 3.0, P * 2.0, 15, 3) - 0.5) * 1.6;
    const a = Math.max(0, Math.min(1, (W * 0.5 - 1.0 - Math.abs(xm) + edgeN) / 1.6));
    il.data[o] = il.data[o + 1] = il.data[o + 2] = a * 255; il.data[o + 3] = 255;
    h[i] = mud * 0.5 + grain * 0.2 - rut * 0.9;
  }
  ga.putImageData(ia, 0, 0); gr.putImageData(ir, 0, 0); gl.putImageData(il, 0, 0);
  return { map: tex(alb, true), roughnessMap: tex(rough, false), alphaMap: tex(alpha, false), normalMap: tex(heightToNormal(h, S, H, 2.6), false) };
}

export function createGround(scene, path, { roadHalf = 7, end = 464, stub = 36 } = {}) {
  const TILE = 28, SIZE = 900;
  const dirt = bakeDirt();
  const gmat = new THREE.MeshStandardMaterial({ ...dirt, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.9, 0.9) });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), gmat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);
  const gmaps = [dirt.map, dirt.roughnessMap, dirt.normalMap];
  for (const t of gmaps) t.repeat.set(SIZE / TILE, SIZE / TILE);

  // 길: 구간마다 한 띠. alphaMap 가장자리라 흙땅과 섞인다.
  const RW = (roadHalf + 2) * 2, RL = 24;
  const road = bakeRoad(RW, RL);
  const rmat = new THREE.MeshStandardMaterial({ ...road, roughness: 1, metalness: 0, transparent: true, depthWrite: false, normalScale: new THREE.Vector2(0.8, 0.8) });
  const c = new THREE.Vector3();
  path.segs.forEach((g, i) => {
    const sa = g.s0 === -Infinity ? -100 : g.s0 - roadHalf, sb = g.s1 === Infinity ? end + 130 : g.s1 + stub;
    const len = sb - sa;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(RW, len), rmat.clone()); path.atSeg(g, (sa + sb) / 2, 0, c);
    for (const k of ['map', 'roughnessMap', 'alphaMap', 'normalMap']) { const t = road[k].clone(); t.repeat.set(1, len / RL); t.offset.set(0, (sa / RL) % 1); m.material[k] = t; }
    m.rotation.set(-Math.PI / 2, g.th, 0, 'YXZ'); m.position.set(c.x, -0.02 - i * 0.003, c.z); m.receiveShadow = true; m.renderOrder = -1; scene.add(m);
  });

  function update(vx, vz) {
    ground.position.x = vx; ground.position.z = vz;
    for (const t of gmaps) t.offset.set(vx / TILE, -vz / TILE);
  }
  return { ground, update };
}
