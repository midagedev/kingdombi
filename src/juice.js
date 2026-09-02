// 타격감·바이럴 루프(DOM/CSS, GPU 비용 0): 낙관 스탬프, 연쇄 등급, 배너, 전적 카드 + 공유(텍스트/PNG), 최고 기록.
const CSS = `
  #stamp { position:absolute; left:50%; top:38%; transform:translate(-50%,-50%) scale(2.6); font: 900 min(46vw, 260px)/1 "Apple SD Gothic Neo", "Noto Serif KR", serif; color:#c1121f; opacity:0; pointer-events:none; text-shadow: 0 0 30px rgba(193,18,31,.7), 0 0 2px #000; mix-blend-mode: screen; }
  #stamp.slam { animation: slam .55s cubic-bezier(.2,.9,.2,1) forwards; }
  @keyframes slam { 0% { opacity:0; transform:translate(-50%,-50%) scale(2.6) rotate(-6deg);} 18% { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(-6deg);} 100% { opacity:0; transform:translate(-50%,-50%) scale(.92) rotate(-6deg);} }
  #combo { position:absolute; right:14px; top: calc(max(env(safe-area-inset-top), 12px) + 44px); text-align:right; font: 900 15px/1.2 system-ui, sans-serif; color:#eee; opacity:0; transition: opacity .25s; letter-spacing:.1em; }
  #combo b { display:block; font-size:28px; color:#b04cff; }
  #combo.gold b { color:#ffd166; }
  #combo.on { opacity:1; }
  #combo.pop b { animation: pop .3s ease-out; }
  @keyframes pop { 0% { transform: scale(1.6);} 100% { transform: scale(1);} }
  #banner { position:absolute; left:50%; top:22%; transform:translateX(-50%); font: 700 15px/1 system-ui, sans-serif; letter-spacing:.35em; color:#f2f2f2; background: rgba(193,18,31,.85); padding: 10px 18px; opacity:0; transition: opacity .4s; white-space:nowrap; }
  #banner.on { opacity:1; }
  #end .card { background: rgba(8,8,10,.92); border: 1px solid #333; padding: 22px 26px; min-width: 64vw; text-align:left; }
  #end .card h2 { margin:0 0 6px; font: 900 40px/1.1 "Apple SD Gothic Neo", system-ui, sans-serif; color:#f2f2f2; }
  #end .card .rec { color:#ffd166; font: 700 12px/1 system-ui; letter-spacing:.3em; margin-bottom:14px; animation: pulse 1.2s infinite; }
  @keyframes pulse { 50% { opacity:.4; } }
  #end .stats { display:grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin: 12px 0 18px; }
  #end .stats div { font: 500 12px/1.2 system-ui; color:#999; letter-spacing:.15em; }
  #end .stats div b { display:block; font: 900 26px/1.2 system-ui; color:#eee; letter-spacing:0; }
  #end .stats div.red b { color:#c1121f; }
  #end .btns { display:flex; gap:10px; pointer-events:auto; }
  #end button { flex:1; font: 700 14px/1 system-ui; padding: 13px 10px; background:#f2f2f2; color:#000; border:0; cursor:pointer; letter-spacing:.1em; }
  #end button.ghost { background:transparent; color:#eee; border:1px solid #555; }
  #end .hint { margin-top: 12px; font: 500 12px/1.6 system-ui; color:#888; text-align:center; }
  #best { position:absolute; left:50%; bottom: 14%; transform:translateX(-50%); font: 700 12px/1 ui-monospace, monospace; color:#888; letter-spacing:.25em; }
`;

const COMBO_TIERS = [[5, '격살'], [12, '학살'], [22, '지옥'], [40, '신화']];
const MILESTONES = [[100, '백귀토벌'], [300, '삼백'], [500, '오백귀'], [1000, '천귀참'], [2000, '살아 있는 흉기']];

export function createJuice(hud) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  for (const [id, cls] of [['stamp', ''], ['combo', ''], ['banner', ''], ['best', '']]) { const d = document.createElement('div'); d.id = id; hud.appendChild(d); }
  const $ = (id) => document.getElementById(id);
  const stampEl = $('stamp'), comboEl = $('combo'), bannerEl = $('banner'), bestEl = $('best');

  const best = { kills: +(localStorage.getItem('kb.best.kills') || 0), time: +(localStorage.getItem('kb.best.time') || 0), runs: +(localStorage.getItem('kb.runs') || 0) };
  if (best.kills) bestEl.textContent = `최고 처치 ${best.kills} · ${fmt(best.time)} 생존`;

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
      comboEl.innerHTML = `<b>${comboCount}</b>${COMBO_TIERS[t][1]}`; comboEl.classList.add('on'); comboEl.classList.toggle('gold', t === 3);
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
    const H = Math.round(c.height * 0.16);
    g.fillStyle = 'rgba(0,0,0,0.78)'; g.fillRect(0, c.height - H, c.width, H);
    g.fillStyle = '#c1121f'; g.fillRect(0, c.height - H, c.width, 4);
    const px = (k) => Math.round(c.width * k);
    g.fillStyle = '#f2f2f2'; g.font = `900 ${px(0.11)}px "Apple SD Gothic Neo", sans-serif`; g.textBaseline = 'top';
    g.fillText('킹덤비', px(0.06), c.height - H + px(0.03));
    g.fillStyle = '#bbb'; g.font = `700 ${px(0.038)}px system-ui, sans-serif`;
    g.fillText(`처치 ${st.kills} · 연쇄 ${st.maxCombo} · 명중 ${Math.round(st.accuracy * 100)}% · ${fmt(st.time)}`, px(0.06), c.height - H + px(0.16));
    g.fillStyle = '#b04cff'; g.font = `700 ${px(0.03)}px ui-monospace, monospace`;
    g.fillText('midagedev.github.io/kingdombi', px(0.06), c.height - H + px(0.215));
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
      ${st.isRecord ? '<div class="rec">NEW RECORD</div>' : `<div class="rec" style="animation:none;color:#666">최고 ${best.kills}</div>`}
      <div class="stats">
        <div class="red">처치<b>${st.kills}</b></div><div>최고 연쇄<b>${st.maxCombo}</b></div>
        <div>명중률<b>${Math.round(st.accuracy * 100)}%</b></div><div>생존<b>${fmt(st.time)}</b></div>
      </div>
      <div class="btns"><button id="btnShare">전적 공유</button><button id="btnPng" class="ghost">장면 저장</button><button id="btnRetry" class="ghost">다시</button></div>
      <div class="hint">화면 아무 곳이나 누르면 다시 밤으로</div></div>`;
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
