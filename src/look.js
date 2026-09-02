// 느와르 룩 파이프라인. 세계(layer 0)는 잉크 흑백으로, 스팟컬러 오브젝트(layer 1)만 색을 가진다.
// 두 패스가 하나의 depth texture 를 공유해 스팟컬러도 세계에 정확히 가려진다.
import * as THREE from 'three';

export const LAYER_WORLD = 0;
export const LAYER_SPOT = 1;   // 피·좀비 발광·등롱·총구 화염·과열 총열

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BLUR = /* glsl */`
  uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tex, vUv).rgb * 0.227;
    c += texture2D(tex, vUv + dir * 1.385).rgb * 0.316;
    c += texture2D(tex, vUv - dir * 1.385).rgb * 0.316;
    c += texture2D(tex, vUv + dir * 3.231).rgb * 0.070;
    c += texture2D(tex, vUv - dir * 3.231).rgb * 0.070;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const COMPOSITE = /* glsl */`
  precision highp float;
  uniform sampler2D tWorld, tSpot, tGlow, tDepth;
  uniform vec2 texel; uniform float time, flash, near, far, rain, darkness, raw, blood, invert;
  varying vec2 vUv;

  float linDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return (2.0 * near * far) / (far + near - z * (far - near));
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec3 col = texture2D(tWorld, vUv).rgb;
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));

    // 잉크 톤 커브: 어둠은 순흑으로 눌리고 하이라이트는 종이처럼 뜬다.
    float ink = smoothstep(0.0, 0.85, pow(lum, 0.72));
    ink = pow(ink, 1.05 + darkness);

    // 깊이 기반 윤곽선 (펜 선). 멀수록 얇아진다.
    float d = linDepth(vUv);
    float dx = abs(linDepth(vUv + vec2(texel.x, 0.0)) - d) + abs(linDepth(vUv - vec2(texel.x, 0.0)) - d);
    float dy = abs(linDepth(vUv + vec2(0.0, texel.y)) - d) + abs(linDepth(vUv - vec2(0.0, texel.y)) - d);
    float edge = clamp((dx + dy) / max(d * 0.10, 0.02) - 0.6, 0.0, 1.0) * (1.0 - smoothstep(90.0, 260.0, d) * 0.7) * (1.0 - smoothstep(300.0, 420.0, d));
    // 그래픽노블 윤곽: 어두운 면엔 흰 선, 밝은 면엔 검은 선
    float edgeTone = 1.0 - smoothstep(0.30, 0.50, ink);
    ink = mix(ink, edgeTone, edge * 0.75);
    // 세부 잉크선: 밝기 기울기(기와 골·창살·공포·기둥). 실루엣 밖 내부 디테일을 펜 선으로 남긴다.
    float lx = dot(texture2D(tWorld, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722)) - dot(texture2D(tWorld, vUv - vec2(texel.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
    float ly = dot(texture2D(tWorld, vUv + vec2(0.0, texel.y)).rgb, vec3(0.2126, 0.7152, 0.0722)) - dot(texture2D(tWorld, vUv - vec2(0.0, texel.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
    float detail = smoothstep(0.06, 0.22, abs(lx) + abs(ly)) * (1.0 - smoothstep(50.0, 160.0, d)) * (1.0 - edge);
    ink = mix(ink, ink * 0.4, detail * 0.65);

    // 비 줄무늬 (스크린 공간, 화면 위쪽에서 아래로)
    vec2 rp = vec2(vUv.x * 160.0, vUv.y * 14.0 + time * 14.0);
    float streak = step(0.965, hash(vec2(floor(rp.x), floor(rp.y) + floor(vUv.x * 160.0) * 7.0)))
                 * smoothstep(0.0, 0.5, fract(rp.y)) * (1.0 - smoothstep(0.5, 1.0, fract(rp.y)));
    ink += streak * rain * 0.22;

    // 필름 그레인 + 비네트
    float g = hash(vUv * vec2(1920.0, 1080.0) + fract(time * 13.0)) - 0.5;
    ink += g * 0.06;
    vec2 q = vUv - 0.5;
    ink *= 1.0 - dot(q, q) * 1.1;

    vec3 world = vec3(ink);
    // 종이 위의 잉크: 아주 미세한 한색 편향(순수 무채색보다 폰에서 덜 탁하다)
    world *= vec3(0.96, 0.98, 1.0);

    // 스팟컬러: 원색 + 발광
    vec3 spot = texture2D(tSpot, vUv).rgb;
    vec3 glow = texture2D(tGlow, vUv).rgb;
    float sm = max(spot.r, max(spot.g, spot.b));
    vec3 outc = mix(world, spot, clamp(sm * 1.4, 0.0, 1.0)) + glow * 0.9;

    // 붉은 밤: 보루가 무너져 간다 — 흑백 세계가 붉게 물들고 가장자리가 심장처럼 맥동한다
    if (blood > 0.001) {
      vec3 red = vec3(ink * 1.05 + 0.10, ink * 0.10, ink * 0.08);
      float pulse = 0.5 + 0.5 * sin(time * 4.2);
      outc = mix(outc, red + spot * 0.4 + glow * 0.6, blood * 0.85);
      outc += blood * dot(q, q) * 2.2 * vec3(0.45 + 0.25 * pulse, 0.0, 0.0);
    }
    // 총구 화염 플래시: 화면 전체가 한 순간 종이처럼 하얘진다
    outc += flash * vec3(1.0, 0.96, 0.9) * (0.35 + 0.65 * ink);
    // 임팩트 프레임(만화식 반전)
    outc = mix(outc, 1.0 - outc, invert);

    if (raw > 0.5) outc = col + spot;
    if (raw > 1.5) outc = vec3(clamp(d / 150.0, 0.0, 1.0));
    gl_FragColor = vec4(outc, 1.0);
  }
`;

export function createLook(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const depth = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType);
  const rtWorld = new THREE.WebGLRenderTarget(size.x, size.y, { depthTexture: depth, depthBuffer: true });
  const rtSpot = new THREE.WebGLRenderTarget(size.x, size.y, { depthTexture: depth, depthBuffer: true });
  const glowW = Math.max(1, size.x >> 2), glowH = Math.max(1, size.y >> 2);
  const rtGlowA = new THREE.WebGLRenderTarget(glowW, glowH, { depthBuffer: false });
  const rtGlowB = new THREE.WebGLRenderTarget(glowW, glowH, { depthBuffer: false });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const blurMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLUR, uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
  const compMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: COMPOSITE, depthTest: false, depthWrite: false,
    uniforms: {
      tWorld: { value: rtWorld.texture }, tSpot: { value: rtSpot.texture }, tGlow: { value: rtGlowB.texture }, tDepth: { value: depth },
      texel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) }, time: { value: 0 }, flash: { value: 0 },
      near: { value: camera.near }, far: { value: camera.far }, rain: { value: 1 }, darkness: { value: 0 }, raw: { value: /dbg=depth/.test(location.search) ? 2 : /dbg=raw/.test(location.search) ? 1 : 0 }, blood: { value: 0 }, invert: { value: 0 },
    },
  });
  const quad = new THREE.Mesh(quadGeo, compMat);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const spotClear = new THREE.Color(0x000000);
  const state = { flash: 0, rain: 1, darkness: 0, blood: 0, invert: 0 };

  function blit(mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  }

  function setSize(w, h) {
    rtWorld.setSize(w, h); rtSpot.setSize(w, h);
    rtGlowA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); rtGlowB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    compMat.uniforms.texel.value.set(1 / w, 1 / h);
  }

  function render(time) {
    const bg = scene.background;
    // 1) 세계 패스
    camera.layers.set(LAYER_WORLD);
    renderer.setRenderTarget(rtWorld);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    // 2) 스팟 패스: depth 공유, 컬러만 클리어
    // scene.background 이 Color 면 WebGLBackground 가 forceClear 로 depth 까지 지운다 → null 로 두고 직접 클리어.
    camera.layers.set(LAYER_SPOT);
    scene.background = null;
    renderer.setRenderTarget(rtSpot);
    renderer.autoClear = false;
    renderer.setClearColor(spotClear, 1);
    renderer.clear(true, false, false);
    renderer.render(scene, camera);
    scene.background = bg;
    renderer.autoClear = true;
    if (bg?.isColor) renderer.setClearColor(bg, 1);
    camera.layers.set(LAYER_WORLD);
    // 3) 스팟 발광 블러(1/4 해상도)
    blurMat.uniforms.tex.value = rtSpot.texture; blurMat.uniforms.dir.value.set(1 / rtGlowA.width, 0); blit(blurMat, rtGlowA);
    blurMat.uniforms.tex.value = rtGlowA.texture; blurMat.uniforms.dir.value.set(0, 1 / rtGlowA.height); blit(blurMat, rtGlowB);
    // 4) 합성
    compMat.uniforms.time.value = time;
    compMat.uniforms.flash.value = state.flash;
    compMat.uniforms.rain.value = state.rain;
    compMat.uniforms.darkness.value = state.darkness;
    compMat.uniforms.blood.value = state.blood; compMat.uniforms.invert.value = state.invert;
    compMat.uniforms.near.value = camera.near; compMat.uniforms.far.value = camera.far;
    blit(compMat, null);
  }

  return { render, setSize, state };
}
