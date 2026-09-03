// 타격감·바이럴 루프(DOM/CSS, GPU 비용 0): 낙관 스탬프, 연쇄 등급(=점수 배율), 배너, 점수 팝, 전적 카드(점수·등급·명예의 전당) + 공유.
const CSS = `
  #stamp { position:absolute; left:50%; top:36%; transform:translate(-50%,-50%); font: 200 min(30vw, 190px)/1 var(--serif); color: var(--ink); opacity:0; pointer-events:none; }
  #stamp.slam { animation: slam .7s cubic-bezier(.16,.9,.2,1) forwards; }
  @keyframes slam { 0% { opacity:0; transform:translate(-50%,-50%) scale(1.25);} 20% { opacity:.92; transform:translate(-50%,-50%) scale(1);} 100% { opacity:0; transform:translate(-50%,-50%) scale(.97);} }
  #combo { position:absolute; right:16px; top: calc(max(env(safe-area-inset-top), 14px) + 78px); text-align:right; opacity:0; transition: opacity .3s; }
  #combo b { display:block; font: 300 22px/1 var(--mono); font-variant-numeric: tabular-nums; color: var(--violet); }
  #combo span { display:block; margin-top:3px; font: 300 10px/1 var(--serif); letter-spacing:.5em; opacity:.6; }
  #combo.gold b { color:#e6c87a; }
  #combo.on { opacity:1; }
  #combo.pop b { animation: pop .25s ease-out; }
  @keyframes pop { 0% { transform: scale(1.35);} 100% { transform: scale(1);} }
  #banner { position:absolute; left:50%; top:20%; transform:translateX(-50%); font: 300 12px/1 var(--serif); letter-spacing:.45em; color: var(--ink); opacity:0; transition: opacity .5s; white-space:nowrap; border-bottom: 1px solid var(--red); padding-bottom: 8px; }
  #banner.on { opacity:.9; }
  #pops { position:absolute; right:16px; top: calc(max(env(safe-area-inset-top), 14px) + 120px); text-align:right; pointer-events:none; }
  #pops div { font: 300 14px/1.3 var(--mono); color:#e6c87a; animation: rise .9s ease-out forwards; }
  #pops div span { font-family: var(--serif); margin-left: 6px; opacity:.8; }
  @keyframes rise { 0% { opacity:0; transform: translateY(8px);} 15% { opacity:1;} 100% { opacity:0; transform: translateY(-22px);} }
  #end .card { text-align:center; max-width: 86vw; }
  #end .card h2 { margin:0 0 10px; font: 200 40px/1.15 var(--serif); color: var(--ink); letter-spacing:.02em; }
  #end .card .score { font: 300 52px/1 var(--mono); font-variant-numeric: tabular-nums; letter-spacing:.02em; color: var(--ink); }
  #end .card .score b { font: 200 44px/1 var(--serif); color: var(--red); margin-left: 14px; vertical-align: 6px; }
  #end .card .rec { font: 300 10px/1 var(--mono); letter-spacing:.5em; color:#e6c87a; margin: 14px 0 22px; }
  #end .card .rec.muted { color: rgba(233,230,223,.4); }
  #end .stats { display:grid; grid-template-columns: repeat(4, auto); gap: 0 20px; margin: 0 0 22px; justify-content:center; }
  #end .stats div { font: 300 9px/1 var(--serif); letter-spacing:.4em; opacity:.55; }
  #end .stats div b { display:block; margin-bottom:8px; font: 300 22px/1 var(--mono); font-variant-numeric: tabular-nums; color: var(--ink); letter-spacing:0; opacity:1; }
  #end .stats div.red b { color: var(--red); }
  #end .hs { margin: 0 auto 22px; font: 300 11px/1.9 var(--mono); letter-spacing:.12em; opacity:.8; text-align:left; display:inline-block; white-space:pre; }
  #end .hs div.me { color:#e6c87a; }
  #end .hs .hd { opacity:.5; letter-spacing:.4em; font-family: var(--serif); margin-bottom:2px; }
  #end .hs .rk { color:#e6c87a; margin-top:6px; }
  #end .hs input { width: 3.2em; background:transparent; border:0; border-bottom:1px solid var(--red); color:#e6c87a; font: inherit; text-transform: uppercase; text-align:center; outline:0; pointer-events:auto; }
  #end .btns { display:flex; gap:26px; justify-content:center; pointer-events:auto; }
  #end button { font: 300 12px/1 var(--serif); letter-spacing:.3em; padding: 10px 2px; background:transparent; color: var(--ink); border:0; border-bottom: 1px solid rgba(233,230,223,.35); cursor:pointer; }
  #end button:first-child { border-bottom-color: var(--red); }
  #end .hint { margin-top: 26px; font: 300 10px/1.8 var(--serif); letter-spacing:.2em; opacity:.4; }
  #end .credits { margin-top: 22px; font: 300 10px/2 var(--mono); letter-spacing:.14em; opacity:.55; pointer-events:auto; }
  #end .credits a { color: #e6c87a; text-decoration:none; border-bottom: 1px solid rgba(230,200,122,.4); }
  #end .credits .roll { font-family: var(--serif); letter-spacing:.3em; opacity:.8; margin-bottom: 4px; }
  #credit { position:absolute; left:50%; bottom: max(env(safe-area-inset-bottom), 16px); transform:translateX(-50%); font: 300 10px/1 var(--mono); letter-spacing:.3em; opacity:.45; white-space:nowrap; pointer-events:auto; }
  #credit a { color: inherit; text-decoration:none; }
  #best { position:absolute; left:50%; bottom: 13%; transform:translateX(-50%); font: 300 10px/1 var(--mono); letter-spacing:.3em; opacity:.45; white-space:nowrap; }
`;

import { S } from './i18n.js';
const COMBO_TIERS = [[5, S.comboTiers[0], 2], [12, S.comboTiers[1], 3], [22, S.comboTiers[2], 4], [40, S.comboTiers[3], 5]];
const MILESTONES = [100, 300, 500, 1000, 2000].map((n, i) => [n, S.milestones[i]]);
// 등급 기준(데모 자동조준 완주 점수를 상한으로 보정한다)
export const RANKS = [['S', 1200000], ['A', 750000], ['B', 400000], ['C', 150000], ['D', 0]];   // 추격 개편 뒤 데모 자동조준 완주 1.58M 기준(2026-09-03) — 옛 비율(S 78%·A 49%·B 26%·C 10%) 유지
export function rankOf(score) { return RANKS.find(([, min]) => score >= min)[0]; }

export function createJuice(hud) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  for (const id of ['stamp', 'combo', 'banner', 'pops', 'best']) { const d = document.createElement('div'); d.id = id; hud.appendChild(d); }
  // 타이틀 하단 크레딧(첫 터치 전에만 보인다 — 시작하면 main 이 숨긴다)
  const credit = document.createElement('div'); credit.id = 'credit'; credit.innerHTML = '<a href="https://x.com/midagedev" target="_blank" rel="noopener">@midagedev</a> · <a href="https://github.com/midagedev/kingdombi" target="_blank" rel="noopener">github</a>'; hud.appendChild(credit);
  credit.addEventListener('pointerdown', (e) => e.stopPropagation());
  const $ = (id) => document.getElementById(id);
  const stampEl = $('stamp'), comboEl = $('combo'), bannerEl = $('banner'), popsEl = $('pops'), bestEl = $('best');

  const hs = JSON.parse(localStorage.getItem('kb.hs') || '[]');   // [{name, score, kills, win}]
  const best = { runs: +(localStorage.getItem('kb.runs') || 0) };
  if (hs.length) bestEl.textContent = `HI-SCORE ${String(hs[0].score).padStart(7, '0')} ${hs[0].name}`;

  let stampT = 0, comboCount = 0, comboLast = -1e9, maxCombo = 0, tier = -1, bannerT = 0, milestoneIdx = 0;

  function stamp(ch) {
    if (performance.now() - stampT < 350) return;
    stampT = performance.now();
    stampEl.textContent = ch; stampEl.classList.remove('slam'); void stampEl.offsetWidth; stampEl.classList.add('slam');
  }
  function banner(text, ms = 2200) { bannerEl.textContent = text; bannerEl.classList.add('on'); bannerT = performance.now() + ms; }
  // 점수 팝: 큰 사건만(쇠판·격추·집·보스·수리). 초당 14킬을 하나하나 띄우면 소음이다.
  let popT = 0;
  function pop(n, glyph) {
    if (performance.now() - popT < 120 || popsEl.childElementCount > 5) return;
    popT = performance.now();
    const d = document.createElement('div'); d.innerHTML = `+${n.toLocaleString()}${glyph ? `<span>${glyph}</span>` : ''}`; popsEl.appendChild(d);
    setTimeout(() => d.remove(), 950);
  }

  function onKill(time, kills) {
    if (time - comboLast > 2.5) { comboCount = 0; tier = -1; }
    comboLast = time; comboCount++; maxCombo = Math.max(maxCombo, comboCount);
    let t = -1; for (let i = 0; i < COMBO_TIERS.length; i++) if (comboCount >= COMBO_TIERS[i][0]) t = i;
    if (t >= 0) {
      comboEl.innerHTML = `<b>${comboCount}</b><span>${COMBO_TIERS[t][1]} ×${COMBO_TIERS[t][2]}</span>`; comboEl.classList.add('on'); comboEl.classList.toggle('gold', t === 3);
      if (t !== tier) { comboEl.classList.remove('pop'); void comboEl.offsetWidth; comboEl.classList.add('pop'); }
      tier = t;
    }
    if (milestoneIdx < MILESTONES.length && kills >= MILESTONES[milestoneIdx][0]) { banner(`${MILESTONES[milestoneIdx][0]} — ${MILESTONES[milestoneIdx][1]}`); stamp('鬼'); milestoneIdx++; }
  }
  function update(time) {
    if (time - comboLast > 2.5 && comboEl.classList.contains('on')) { comboEl.classList.remove('on'); tier = -1; }
    if (bannerT && performance.now() > bannerT) { bannerEl.classList.remove('on'); bannerT = 0; }
  }
  const mult = () => (tier >= 0 ? COMBO_TIERS[tier][2] : 1);

  function fmt(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

  function shareText(st) {
    const pips = Math.min(10, Math.floor(st.kills / 150));
    return S.share(st, fmt(st.time), Math.round(st.accuracy * 100), pips).join('\n');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try { const a = document.createElement('textarea'); a.value = text; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); return ok; } catch { return false; }
  }
  async function share(st) {
    const text = shareText(st);
    if (navigator.share) { try { await navigator.share({ text }); return S.shared; } catch (e) { if (e?.name === 'AbortError') return S.cancelled; } }
    return (await copy(text)) ? S.copied : S.copyFail;
  }
  // 장면 저장: 게임 프레임 + 타이포 스트립 → PNG.
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
    g.fillText(S.pngTitle, px(0.06), c.height - H + px(0.085));
    g.fillStyle = '#e6c87a'; g.font = `300 ${px(0.05)}px "IBM Plex Mono", ui-monospace, monospace`;
    g.fillText(`${String(st.score).padStart(7, '0')}  ${st.rank}`, px(0.42), c.height - H + px(0.095));
    g.fillStyle = 'rgba(233,230,223,.7)'; g.font = `300 ${px(0.03)}px "IBM Plex Mono", ui-monospace, monospace`;
    g.fillText(S.pngStats(st, Math.round(st.accuracy * 100), fmt(st.time)), px(0.06), c.height - H + px(0.19));
    g.fillStyle = 'rgba(233,230,223,.4)';
    g.fillText('kingdombi.midagedev.com', px(0.06), c.height - H + px(0.235));
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = new File([blob], 'kingdombi.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text: S.pngTitle }); return S.shared; } catch (e) { if (e?.name === 'AbortError') return S.cancelled; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kingdombi.png'; a.click(); return S.saved;
  }

  function endCard(endEl, st, frameBlob, onRestart, online = null) {
    st.maxCombo = maxCombo; st.rank = rankOf(st.score);
    best.runs++; localStorage.setItem('kb.runs', best.runs);
    // 명예의 전당: 5위 안이면 이름 석 자
    const lastName = localStorage.getItem('kb.name') || '';
    const entry = { name: lastName || '???', score: st.score, kills: st.kills, win: st.win };
    const placed = hs.filter((e) => e.score > st.score).length;
    st.isRecord = placed === 0 && st.score > 0;
    const qualifies = placed < 5 && st.score > 0;
    const table = [...hs]; if (qualifies) table.splice(placed, 0, entry); table.length = Math.min(5, table.length);
    const rows = table.map((e, i) => `<div class="${e === entry ? 'me' : ''}">${i + 1}. ${e === entry ? '<input id="hsName" maxlength="3" placeholder="AAA" autocomplete="off" value="${lastName}">' : e.name.padEnd(3, ' ')}  ${String(e.score).padStart(7, '0')}  ${e.win ? S.dawnMark : '　　'}</div>`).join('');
    endEl.innerHTML = `<div class="card">
      <h2>${st.win ? S.win : S.lose}</h2>
      <div class="score">${String(st.score).padStart(7, '0')}<b>${st.rank}</b></div>
      ${st.isRecord ? '<div class="rec">NEW HI-SCORE</div>' : `<div class="rec muted">${st.credits > 1 ? `CREDITS ${st.credits}` : `RANK ${placed + 1}`}</div>`}
      <div class="stats">
        <div class="red">${S.stKills}<b>${st.kills}</b></div><div>${S.stCombo}<b>${st.maxCombo}</b></div>
        <div>${S.stAcc}<b>${Math.round(st.accuracy * 100)}%</b></div><div>${st.win ? S.stTime : S.stReach}<b>${st.win ? fmt(st.time) : `${st.reachedM}m`}</b></div>
      </div>
      <div class="hs" id="hsBox">${rows}</div>
      <div class="btns"><button id="btnShare">${S.btnShare}</button><button id="btnPng">${S.btnPng}</button><button id="btnRetry">${S.btnRetry}</button></div>
      <div class="hint">${S.hint(qualifies)}</div>
      <div class="credits">${st.win ? `<div class="roll">${S.roll}</div>` : ''}<a href="https://x.com/midagedev" target="_blank" rel="noopener">@midagedev</a> · <a href="https://github.com/midagedev/kingdombi" target="_blank" rel="noopener">github.com/midagedev/kingdombi</a></div></div>`;
    endEl.style.opacity = 1; endEl.style.pointerEvents = 'auto';
    const stop = (e) => e.stopPropagation();
    for (const id of ['btnShare', 'btnPng', 'btnRetry']) endEl.querySelector('#' + id).addEventListener('pointerdown', stop);
    for (const a of endEl.querySelectorAll('.credits a')) a.addEventListener('pointerdown', stop);
    const nameNow = () => { const inp = endEl.querySelector('#hsName'); const v = (inp?.value || lastName || 'AAA').toUpperCase().replace(/[^0-9A-Z가-힣]/g, ''); return (v || 'AAA').padEnd(3, 'A').slice(0, 3); };
    const saveHs = () => { const nm = nameNow(); localStorage.setItem('kb.name', nm); if (!qualifies) return; entry.name = nm; localStorage.setItem('kb.hs', JSON.stringify(table)); };
    // ── 온라인 순위표(Cloudflare Worker): 카드가 열리면 오늘 TOP5 + 역대 1위를 보여주고, 이름이 정해지면 한 번 올린다 ──
    const hsBox = endEl.querySelector('#hsBox');
    let submitted = false, board = null;
    const fmtRow = (e, mine) => `<div class="${mine ? 'me' : ''}">${String(e.rank).padStart(2, ' ')}. ${e.n.padEnd(3, ' ')}  ${String(e.s).padStart(7, '0')}  ${e.w ? S.dawnMark : '　　'}</div>`;
    const renderBoard = (mine) => {
      if (!board) return;
      const top = board.today.slice(0, 5).map((e) => fmtRow(e, mine && e.s === st.score && e.n === nameNow())).join('');
      const all = board.all[0] ? `<div class="hd">${S.boardAll(board.all[0].n, String(board.all[0].s).padStart(7, '0'))}</div>` : '';
      const me = mine ? `<div class="rk">${S.myRank(mine.rankDay, mine.rankAll, st.credits)}</div>` : (qualifies || !online?.demo ? `<div class="me">${S.you}  <input id="hsName" maxlength="3" placeholder="AAA" autocomplete="off" value="${lastName}">  ${String(st.score).padStart(7, '0')}</div>` : '');
      hsBox.innerHTML = `<div class="hd">${S.boardToday(board.day)}</div>${top || `<div>${S.boardEmpty}</div>`}${me}${all}`;
      wireInput();
    };
    const submit = async (keepalive = false) => {
      if (!online || submitted || online.demo || st.score <= 0) return;
      submitted = true;
      try {
        const r = await fetch(`${online.url}/score`, { method: 'POST', keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nameNow(), score: st.score, kills: st.kills, win: st.win, credits: st.credits, day: online.day }) });
        if (r.ok) {
          const d = await r.json(); board = { day: d.day, today: d.today, all: d.all };
          // KV list 는 60초쯤 뒤에 반영되니 내 줄은 직접 끼워 넣는다
          const mine = { n: nameNow(), s: st.score, w: st.win };
          if (!board.today.some((e) => e.s === mine.s && e.n === mine.n)) { board.today.splice(d.rankDay - 1, 0, mine); board.today.forEach((e, i) => { e.rank = i + 1; }); }
          if (!board.all.some((e) => e.s === mine.s && e.n === mine.n)) { board.all.splice(d.rankAll - 1, 0, mine); board.all.forEach((e, i) => { e.rank = i + 1; }); }
          renderBoard({ rankDay: d.rankDay, rankAll: d.rankAll });
        }
      } catch {}
    };
    function wireInput() {
      const inp = endEl.querySelector('#hsName'); if (!inp) return;
      inp.addEventListener('pointerdown', stop);
      inp.addEventListener('input', () => { saveHs(); if (inp.value.length >= 3) setTimeout(() => submit(), 500); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { saveHs(); submit(); inp.blur(); } });
      inp.addEventListener('blur', () => { saveHs(); if (inp.value.length >= 1) submit(); });
    }
    if (online) fetch(`${online.url}/top?day=${online.day}`).then((r) => r.json()).then((d) => { board = d; renderBoard(null); if (lastName) submit(); }).catch(() => {});
    wireInput();
    const restart = () => { saveHs(); submit(true); onRestart(); };
    endEl.querySelector('#btnShare').addEventListener('click', async (e) => { e.stopPropagation(); saveHs(); submit(); e.target.textContent = await share(st); });
    endEl.querySelector('#btnPng').addEventListener('click', async (e) => { e.stopPropagation(); saveHs(); submit(); e.target.textContent = frameBlob ? await savePng(st, frameBlob) : S.noFrame; });
    endEl.querySelector('#btnRetry').addEventListener('click', restart);
    endEl.addEventListener('pointerdown', (e) => { if (!['BUTTON', 'INPUT', 'A'].includes(e.target.tagName)) restart(); });
  }

  return { stamp, banner, pop, onKill, update, endCard, mult, get maxCombo() { return maxCombo; } };
}
