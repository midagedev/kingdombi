// 타격감·바이럴 루프(DOM/CSS, GPU 비용 0): 낙관 스탬프, 연쇄 등급, 배너, 전적 카드 + 공유(텍스트/PNG), 최고 기록.
const CSS = `
  #stamp { position:absolute; left:50%; top:36%; transform:translate(-50%,-50%); font: 200 min(30vw, 190px)/1 var(--serif); color: var(--ink); opacity:0; pointer-events:none; }
  #stamp.slam { animation: slam .7s cubic-bezier(.16,.9,.2,1) forwards; }
  @keyframes slam { 0% { opacity:0; transform:translate(-50%,-50%) scale(1.25);} 20% { opacity:.92; transform:translate(-50%,-50%) scale(1);} 100% { opacity:0; transform:translate(-50%,-50%) scale(.97);} }
  #combo { position:absolute; right:16px; top: calc(max(env(safe-area-inset-top), 14px) + 62px); text-align:right; opacity:0; transition: opacity .3s; }
  #combo b { display:block; font: 300 22px/1 var(--mono); font-variant-numeric: tabular-nums; color: var(--violet); }
  #combo span { display:block; margin-top:3px; font: 300 10px/1 var(--serif); letter-spacing:.5em; opacity:.6; }
  #combo.gold b { color:#e6c87a; }
  #combo.on { opacity:1; }
  #combo.pop b { animation: pop .25s ease-out; }
  @keyframes pop { 0% { transform: scale(1.35);} 100% { transform: scale(1);} }
  #banner { position:absolute; left:50%; top:20%; transform:translateX(-50%); font: 300 12px/1 var(--serif); letter-spacing:.45em; color: var(--ink); opacity:0; transition: opacity .5s; white-space:nowrap; border-bottom: 1px solid var(--red); padding-bottom: 8px; }
  #banner.on { opacity:.9; }
  #end .card { text-align:center; }
  #end .card h2 { margin:0 0 18px; font: 200 46px/1.15 var(--serif); color: var(--ink); letter-spacing:.02em; }
  #end .card .rec { font: 300 10px/1 var(--mono); letter-spacing:.5em; color:#e6c87a; margin-bottom: 26px; }
  #end .card .rec.muted { color: rgba(233,230,223,.4); }
  #end .stats { display:grid; grid-template-columns: repeat(4, auto); gap: 0 22px; margin: 0 0 34px; justify-content:center; }
  #end .stats div { font: 300 9px/1 var(--serif); letter-spacing:.4em; opacity:.55; }
  #end .stats div b { display:block; margin-bottom:8px; font: 300 26px/1 var(--mono); font-variant-numeric: tabular-nums; color: var(--ink); letter-spacing:0; opacity:1; }
  #end .stats div.red b { color: var(--red); }
  #end .btns { display:flex; gap:28px; justify-content:center; pointer-events:auto; }
  #end button { font: 300 12px/1 var(--serif); letter-spacing:.3em; padding: 10px 2px; background:transparent; color: var(--ink); border:0; border-bottom: 1px solid rgba(233,230,223,.35); cursor:pointer; }
  #end button:first-child { border-bottom-color: var(--red); }
  #end .hint { margin-top: 30px; font: 300 10px/1.8 var(--serif); letter-spacing:.2em; opacity:.4; }
  #best { position:absolute; left:50%; bottom: 13%; transform:translateX(-50%); font: 300 10px/1 var(--mono); letter-spacing:.3em; opacity:.45; }
`;

const COMBO_TIERS = [[5, '격살'], [12, '학살'], [22, '지옥'], [40, '신화']];
const MILESTONES = [[100, '백귀토벌'], [300, '삼백'], [500, '오백귀'], [1000, '천귀참'], [2000, '살아 있는 흉기']];

export function createJuice(hud) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  for (const [id, cls] of [['stamp', ''], ['combo', ''], ['banner', ''], ['best', '']]) { const d = document.createElement('div'); d.id = id; hud.appendChild(d); }
  const $ = (id) => document.getElementById(id);
  const stampEl = $('stamp'), comboEl = $('combo'), bannerEl = $('banner'), bestEl = $('best');

  const best = { kills: +(localStorage.getItem('kb.best.kills') || 0), time: +(localStorage.getItem('kb.best.time') || 0), runs: +(localStorage.getItem('kb.runs') || 0) };
  if (best.kills) bestEl.textContent = `BEST ${best.kills} · ${fmt(best.time)}`;

  let stampT = 0, comboCount = 0, comboLast = -1e9, maxCombo = 0, tier = -1, bannerT = 0, milestoneIdx = 0;

  function stamp(ch) {
    if (performance.now() - stampT < 350) return;
    stampT = performance.now();
    stampEl.textContent = ch; stampEl.classList.remove('slam'); void stampEl.offsetWidth; stampEl.classList.add('slam');
  }
  function banner(text, ms = 2200) { bannerEl.textContent = text; bannerEl.classList.add('on'); bannerT = performance.now() + ms; }

  function onKill(time, kills) {
    if (time - comboLast > 2.5) { comboCount = 0; tier = -1; }
    comboLast = time; comboCount++; maxCombo = Math.max(maxCombo, comboCount);
    let t = -1; for (let i = 0; i < COMBO_TIERS.length; i++) if (comboCount >= COMBO_TIERS[i][0]) t = i;
    if (t >= 0) {
      comboEl.innerHTML = `<b>${comboCount}</b><span>${COMBO_TIERS[t][1]}</span>`; comboEl.classList.add('on'); comboEl.classList.toggle('gold', t === 3);
      if (t !== tier) { comboEl.classList.remove('pop'); void comboEl.offsetWidth; comboEl.classList.add('pop'); }
      tier = t;
    }
    if (milestoneIdx < MILESTONES.length && kills >= MILESTONES[milestoneIdx][0]) { banner(`${MILESTONES[milestoneIdx][0]} — ${MILESTONES[milestoneIdx][1]}`); stamp('鬼'); milestoneIdx++; }
  }
  function update(time) {
    if (time - comboLast > 2.5 && comboEl.classList.contains('on')) comboEl.classList.remove('on');
    if (bannerT && performance.now() > bannerT) { bannerEl.classList.remove('on'); bannerT = 0; }
  }

  function fmt(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

  function shareText(st) {
    const pips = Math.min(10, Math.floor(st.kills / 100));
    return [
      '🌑 킹덤비 · 조선 느와르 좀비 개틀링',
      st.win ? `새벽을 보았다${st.isRecord ? ' — 신기록' : ''}` : `${fmt(st.time)} 만에 포대가 무너졌다${st.isRecord ? ' — 신기록' : ''}`,
      '',
      `처치 ${st.kills} · 최고 연쇄 ${st.maxCombo} · 명중률 ${Math.round(st.accuracy * 100)}% · 집 ${st.razed}채 붕괴`,
      pips ? '🩸'.repeat(pips) : '🌑 흑백의 밤',
      '',
      '너는 새벽까지 버틸 수 있나 → https://midagedev.github.io/kingdombi/',
    ].join('\n');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try { const a = document.createElement('textarea'); a.value = text; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); return ok; } catch { return false; }
  }
  async function share(st) {
    const text = shareText(st);
    if (navigator.share) { try { await navigator.share({ text }); return '공유했다'; } catch (e) { if (e?.name === 'AbortError') return '취소'; } }
    return (await copy(text)) ? '클립보드에 복사했다' : '복사 실패';
  }
  // 장면 저장: 게임 프레임 + 타이포 스트립 → PNG. captureFrame 은 렌더 직후의 캔버스 blob 을 준다.
  async function savePng(st, frameBlob) {
    const img = await createImageBitmap(frameBlob);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const H = Math.round(c.height * 0.15);
    g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, c.height - H, c.width, H);
    const px = (k) => Math.round(c.width * k);
    g.fillStyle = '#c1121f'; g.fillRect(px(0.06), c.height - H + px(0.06), px(0.06), 2);
    g.textBaseline = 'top';
    g.fillStyle = '#e9e6df'; g.font = `200 ${px(0.085)}px "Noto Serif KR", "Apple Myungjo", serif`;
    g.fillText('킹덤비', px(0.06), c.height - H + px(0.085));
    g.fillStyle = 'rgba(233,230,223,.7)'; g.font = `300 ${px(0.03)}px "IBM Plex Mono", ui-monospace, monospace`;
    g.fillText(`처치 ${st.kills}   연쇄 ${st.maxCombo}   명중 ${Math.round(st.accuracy * 100)}%   ${fmt(st.time)}`, px(0.06), c.height - H + px(0.19));
    g.fillStyle = 'rgba(233,230,223,.4)';
    g.fillText('midagedev.github.io/kingdombi', px(0.06), c.height - H + px(0.235));
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = new File([blob], 'kingdombi.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text: '킹덤비' }); return '공유했다'; } catch (e) { if (e?.name === 'AbortError') return '취소'; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kingdombi.png'; a.click(); return '저장했다';
  }

  function endCard(endEl, st, frameBlob, onRestart) {
    st.maxCombo = maxCombo;
    st.isRecord = st.kills > best.kills;
    best.runs++; localStorage.setItem('kb.runs', best.runs);
    if (st.isRecord) { best.kills = st.kills; best.time = st.time; localStorage.setItem('kb.best.kills', st.kills); localStorage.setItem('kb.best.time', st.time); }
    endEl.innerHTML = `<div class="card">
      <h2>${st.win ? '새벽이 왔다' : '밤을 넘기지 못했다'}</h2>
      ${st.isRecord ? '<div class="rec">NEW RECORD</div>' : `<div class="rec muted">BEST ${best.kills}</div>`}
      <div class="stats">
        <div class="red">처치<b>${st.kills}</b></div><div>최고 연쇄<b>${st.maxCombo}</b></div>
        <div>명중률<b>${Math.round(st.accuracy * 100)}%</b></div><div>생존<b>${fmt(st.time)}</b></div>
      </div>
      <div class="btns"><button id="btnShare">전적 공유</button><button id="btnPng" class="ghost">장면 저장</button><button id="btnRetry" class="ghost">다시</button></div>
      <div class="hint">화면을 누르면 다시 밤으로</div></div>`;
    endEl.style.opacity = 1; endEl.style.pointerEvents = 'auto';
    const stop = (e) => e.stopPropagation();
    endEl.querySelector('#btnShare').addEventListener('pointerdown', stop);
    endEl.querySelector('#btnPng').addEventListener('pointerdown', stop);
    endEl.querySelector('#btnShare').addEventListener('click', async (e) => { e.stopPropagation(); e.target.textContent = await share(st); });
    endEl.querySelector('#btnPng').addEventListener('click', async (e) => { e.stopPropagation(); e.target.textContent = frameBlob ? await savePng(st, frameBlob) : '프레임 없음'; });
    endEl.querySelector('#btnRetry').addEventListener('click', onRestart);
    endEl.addEventListener('pointerdown', (e) => { if (e.target.tagName !== 'BUTTON') onRestart(); });
  }

  return { stamp, banner, onKill, update, endCard, get maxCombo() { return maxCombo; } };
}
