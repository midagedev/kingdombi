// 오프닝·컨티뉴·엔딩 판(2026-09-03): DOM 카드 대신 카메라에 붙인 캔버스 판 하나.
// 스팟 레이어라 색이 살고(호박·적), 잉크 후처리(비·그레인·플래시·반전)를 통과해 세계와 같은 종이 위에 놓인다.
// 이름 입력·공유·다시 버튼·순위표 줄만 DOM(juice.endCard)에 남는다 — 입력과 링크는 DOM 이어야 한다.
import * as THREE from 'three';
import { LAYER_SPOT } from './look.js';
import { S } from './i18n.js';

export function createCine(scene, camera, { isMobile }) {
  if (!camera.parent) scene.add(camera);   // 카메라 자식(판)이 그려지려면 카메라가 씬 안에 있어야 한다
  const W = 1024, D = 12;   // 캔버스 한 변 · 카메라 앞 거리(m)
  const cv = document.createElement('canvas'); cv.width = cv.height = W; const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); plate.layers.set(LAYER_SPOT); plate.renderOrder = 999; plate.position.set(0, 0, -D); plate.visible = false; camera.add(plate);
  const SERIF = '"Noto Serif KR","Apple Myungjo","Nanum Myeongjo",serif', MONO = '"IBM Plex Mono",Menlo,monospace', INK = '#e9e6df', AMBER = '#ffb347', RED = '#c1121f';
  let mode = null, blinkOn = true, blinkT = 0, st = null, fade = 0, target = 0;
  // 판은 가로에선 화면 짧은 변 92% 짜리 정사각형.
  // 세로 폰은 화면 너비의 1.3배 — 정사각 판이 좌우로 조금 넘치지만 글줄은 캔버스 폭 73% 안이라 잘리지 않고, 글자가 읽을 만한 크기가 된다(0.92 배에선 GAME OVER 가 12px 로 보였다)
  function fit() { const h = 2 * D * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), w = h * camera.aspect; const s = camera.aspect < 1 ? w * 1.3 : Math.min(w, h) * 0.92; plate.scale.set(s, s, 1); }
  const text = (t, x, y, size, font, color, { align = 'center', spacing = 0, alpha = 1, weight = 300 } = {}) => {
    g.save(); g.globalAlpha = alpha; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.font = `${weight} ${size}px ${font}`;
    if (spacing && 'letterSpacing' in g) g.letterSpacing = `${spacing}px`;
    g.fillText(t, x, y); g.restore();
  };
  function draw() {
    g.clearRect(0, 0, W, W);
    const c = W / 2;
    if (mode === 'title') {
      text('K I N G D O M B I', c, 170, 30, MONO, INK, { alpha: 0.55 });
      text('킹덤비', c, 335, 250, SERIF, INK, { weight: 200 });   // 로고는 양 언어 공통(그래픽)
      g.fillStyle = RED; g.fillRect(c - 16, 456, 32, 2);
      if (blinkOn) text('INSERT COIN', c, 524, 36, MONO, AMBER, { spacing: 14 });
      text(S.titleHint(isMobile), c, 620, 26, SERIF, INK, { alpha: 0.6 });
    } else if (mode === 'cont') {
      text('CONTINUE?', c, 440, 48, MONO, INK, { spacing: 22 });
      if (blinkOn) text(S.contHint, c, 560, 30, SERIF, AMBER);
    } else if (mode === 'end' && st) {
      // 글 뒤 어두운 띠 — 마차 실루엣·떼 위에서도 읽힌다
      const gr = g.createLinearGradient(0, 120, 0, 640); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.25, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 120, W, 520);
      if (st.win) text(S.win, c, 230, 96, SERIF, INK, { weight: 200 }); else text(S.lose, c, 230, 64, MONO, INK, { spacing: 18 });
      text(String(st.score).padStart(7, '0'), c - 50, 390, 118, MONO, INK);
      text(st.rank, c + 330, 382, 96, SERIF, RED, { weight: 200 });
      text(S.statLine(st), c, 500, 28, MONO, INK, { alpha: 0.75 });
      if (st.isRecord) text('NEW HI-SCORE', c, 566, 26, MONO, AMBER, { spacing: 12 });
      else if (st.credits > 1) text(`CREDITS ${st.credits}`, c, 566, 26, MONO, INK, { spacing: 12, alpha: 0.5 });
    }
    tex.needsUpdate = true;
  }
  function show(m, data = null) { mode = m; st = data; blinkOn = true; blinkT = 0; target = 1; plate.visible = true; fit(); draw(); }
  function hide() { target = 0; }
  function update(rawDt) {
    if (!plate.visible) return;
    fade += (target - fade) * Math.min(1, rawDt * (target ? 3 : 6)); mat.opacity = fade;
    if (target === 0 && fade < 0.01) { plate.visible = false; mode = null; return; }
    if (mode === 'title' || mode === 'cont') { blinkT += rawDt; if (blinkT > 0.6) { blinkT = 0; blinkOn = !blinkOn; draw(); } }
    plate.position.y = Math.sin(performance.now() * 0.0006) * 0.05;   // 숨 쉬듯 떠 있다
    fit();
  }
  document.fonts?.ready.then(() => { if (mode) draw(); });   // 웹폰트가 늦게 오면 다시 그린다
  return { show, hide, update, get mode() { return mode; } };
}
