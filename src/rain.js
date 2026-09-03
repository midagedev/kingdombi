// 세계 공간 비(2026-09-03 AAA 룩 6차): 화면 공간 줄무늬(look.js)는 남기되 절반으로 줄이고, 카메라 둘레 상자 안에 떨어지는 빗줄기 1500 + 바닥 물튀김 링 200 을 얹는다.
// 빗줄기: 인스턴스 쿼드, 정점 셰이더가 카메라 둘레 40×30×40 상자에서 fract 로 감아 떨어뜨리고 카메라 오른쪽 벡터(수평)로 빌보드 — 한 드로우.
// 물튀김: CPU 갱신 200 링(카메라 둘레 반경 22 m 바닥, 0.3초에 커지며 사라짐) — 한 드로우. 둘 다 세계 레이어(잉크가 회색으로 남긴다).
import * as THREE from 'three';

const RAIN_VERT = /* glsl */`
  attribute vec3 aSeed;
  uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec2 uWind;
  varying float vY; varying float vFade;
  void main() {
    float sp = 18.0 + aSeed.z * 10.0;
    vec3 c = vec3(aSeed.x, fract(aSeed.y - uTime * sp / uBox.y), aSeed.z);
    c.xz += uWind * uTime * 0.02;   // 바람 표류(감긴 좌표라 상자 안에 머문다)
    c.xz = fract(c.xz);
    vec3 w = uCam + (c - 0.5) * uBox;
    vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
    vec3 lean = normalize(vec3(uWind.x * 0.25, -1.0, uWind.y * 0.25));
    w += right * position.x - lean * position.y * (0.55 + aSeed.z * 0.4);
    vY = uv.y;
    float d = length(w - uCam);
    vFade = smoothstep(2.0, 6.0, d) * (1.0 - smoothstep(18.0, 28.0, d));   // 너무 가까운 것·먼 것은 지운다
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;
const RAIN_FRAG = /* glsl */`
  precision highp float; varying float vY; varying float vFade;
  void main() { float a = (1.0 - abs(vY - 0.5) * 2.0) * vFade * 0.55; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.75, 0.8, 0.9), a); }
`;

function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 24, 0, 6.2832); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(32, 32, 16, 0, 6.2832); g.stroke();
  return new THREE.CanvasTexture(c);
}

export function createRain(scene, { drops = 1500, splashes = 200 } = {}) {
  const geo = new THREE.PlaneGeometry(0.02, 0.5);
  const seed = new THREE.InstancedBufferAttribute(new Float32Array(drops * 3).map(() => Math.random()), 3);
  geo.setAttribute('aSeed', seed);
  const mat = new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(44, 30, 44) }, uWind: { value: new THREE.Vector2(0.4, 0.2) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const rain = new THREE.InstancedMesh(geo, mat, drops); rain.frustumCulled = false; scene.add(rain);
  { const m = new THREE.Matrix4(); for (let i = 0; i < drops; i++) rain.setMatrixAt(i, m); }

  const sgeo = new THREE.PlaneGeometry(1, 1); sgeo.rotateX(-Math.PI / 2);
  const smat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, opacity: 0.5, color: 0xb0b8c8 });
  const splash = new THREE.InstancedMesh(sgeo, smat, splashes); splash.frustumCulled = false; scene.add(splash);
  const born = new Float32Array(splashes).map(() => -Math.random()), sx = new Float32Array(splashes), sz = new Float32Array(splashes);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const LIFE = 0.32;
  let t = 0;
  function update(dt, cam) {
    t += dt; mat.uniforms.uTime.value = t; mat.uniforms.uCam.value.copy(cam);
    for (let i = 0; i < splashes; i++) {
      let age = t - born[i];
      if (age > LIFE) { born[i] = t + Math.random() * 0.2; const a = Math.random() * 6.283, r = 3 + Math.sqrt(Math.random()) * 20; sx[i] = cam.x + Math.cos(a) * r; sz[i] = cam.z + Math.sin(a) * r; age = -1; }
      const k = age < 0 ? 0 : age / LIFE;
      p.set(sx[i], 0.035, sz[i]); s.setScalar(k <= 0 ? 0 : 0.12 + k * 0.5); m.compose(p, q, s); splash.setMatrixAt(i, m);
    }
    splash.instanceMatrix.needsUpdate = true;
  }
  return { update, rain, splash };
}
