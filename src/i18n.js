// 로케일(2026-09-03): 한/영. 우선순위 ?lang= → localStorage kb.lang → 브라우저 언어(ko 면 ko, 나머지 en).
// 문자열은 여기 한 곳. 한자 스탬프(鐵·滅·雷…)는 양쪽 공통 — 그래픽이다.
const q = new URLSearchParams(location.search);
let stored = null; try { stored = localStorage.getItem('kb.lang'); } catch {}
const pick = q.get('lang') || stored || (navigator.language || 'en');
export const LANG = /^ko/i.test(pick) ? 'ko' : 'en';
export function setLang(l) { try { localStorage.setItem('kb.lang', l); } catch {} const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString(); }

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const PLACES_EN = {
  '시전 거리': 'MARKET STREET', '장이 서던 곳': 'where the market once stood',
  '절 문 앞': 'TEMPLE GATE', '종이 울리지 않는다': 'the bell does not ring',
  '궁궐 광장': 'PALACE SQUARE', '문이 열려 있다': 'the gate stands open',
  '초가 마을': 'THATCHED VILLAGE', '기와 골목': 'TILED-ROOF ALLEY', '육조 거리': 'SIX MINISTRIES AVENUE',
};

const KO = {
  docTitle: 'KINGDOMBI 킹덤비 — 조선 느와르 좀비 개틀링 레일 슈터',
  docDesc: '철갑 마차 위에서 개틀링을 돌려 조선의 밤을 뚫는 무료 웹 아케이드 슈터. 좀비 떼, 거대 보스, 그리고 궁궐 앞의 恐龍. 설치 없이 폰·PC 브라우저에서 바로 플레이. 매일 바뀌는 길, 온라인 순위표.',
  calm: '저자극',
  kills: '처치', armor: '장갑', toPalace: '궁궐까지', dawn: '새벽',
  titleHint: (mobile) => mobile ? '누른 자리가 스틱 · 누른 동안 발사 · 雷 버튼' : '클릭해 조준 · 누른 동안 발사 · Space 雷',
  contHint: '누르면 계속', contEnd: '그만',
  pickTitle: '보 강 — 하 나 를 고 르 라',
  cards: {
    pierce: ['관통탄', '총알이 몸 하나를 더 꿰뚫는다'],
    rate: ['연사 강화', '개틀링이 25% 빨리 돈다'],
    bomb: ['雷 보충', '로켓 일제사격을 한 번 더 담는다'],
    regen: ['자가 수리', '장갑이 저절로 아문다'],
    repair: ['수리 강화', '수리 상자 효과가 두 배'],
    singijeon: ['신기전', '7초마다 화살 폭설이 떼에 쏟아진다'],
    gunners: ['옆 포수', '마차 양옆 소총이 알아서 쏜다'],
    thunder: ['벼락', '하늘이 가장 큰 놈을 벤다'],
    spikes: ['가시 강화', '붙은 놈이 두 배 빨리 꿰린다'],
  },
  place: (s) => s,
  stage: (n, stop) => `STAGE ${n} · ${stop.name} · ${stop.sub}`,
  roadOpen: '길이 열렸다', dawnComing: '새벽이 온다', bloodNight: '마차가 불탄다 — 붉은 밤',
  bossGiant: '절 문의 巨人', bossRex: '궁궐의 恐龍', chestOpen: '가슴이 열렸다', heartExposed: '심장이 드러났다', shootDown: '격추하라',
  repair: (n) => `수리 +${n}`,
  comboTiers: ['격살', '학살', '지옥', '신화'],
  milestones: ['백귀토벌', '삼백', '오백귀', '천귀참', '살아 있는 흉기'],
  // 전적 카드
  win: '새벽이 왔다', lose: 'GAME OVER',
  statLine: (st) => `처치 ${st.kills} · 연쇄 ${st.maxCombo} · 명중 ${Math.round(st.accuracy * 100)}% · ${st.win ? fmt(st.time) : `궁궐까지 ${st.reachedM} m`}`,
  btnShare: '공유', btnPng: '저장', btnRetry: '다시', noFrame: '프레임 없음',
  dawnMark: '새벽', you: '당신', boardToday: (d) => `오늘의 순위 ${d}`, boardEmpty: '아직 아무도 없다', boardAll: (n, s) => `역대 1위 ${n} ${s}`,
  myRank: (d, a, c) => `오늘 ${d}위 · 역대 ${a}위${c > 1 ? ` · 코인 ${c}` : ''}`,
  shared: '공유했다', cancelled: '취소', copied: '클립보드에 복사했다', copyFail: '복사 실패', saved: '저장했다',
  pngTitle: '킹덤비', pngStats: (st, acc, time) => `처치 ${st.kills}   연쇄 ${st.maxCombo}   명중 ${acc}%   ${time}`,
  share: (st, fmtTime, acc, pips) => [
    '🌑 킹덤비 · 조선 느와르 좀비 개틀링',
    `${String(st.score).padStart(7, '0')} 점 · 등급 ${st.rank}${st.credits > 1 ? ` · 코인 ${st.credits}개` : ''}`,
    st.win ? '恐龍을 쓰러뜨리고 새벽을 보았다' : `${fmtTime} 만에 마차가 멈췄다 · 궁궐까지 ${st.reachedM} m`,
    `처치 ${st.kills} · 최고 연쇄 ${st.maxCombo} · 명중률 ${acc}% · 집 ${st.razed}채 붕괴`,
    pips ? '🩸'.repeat(pips) : '🌑 흑백의 밤',
    '',
    '너는 궁궐까지 갈 수 있나 → https://kingdombi.midagedev.com/  by @midagedev',
  ],
};

const EN = {
  docTitle: 'KINGDOMBI — Joseon-noir zombie gatling rail shooter',
  docDesc: 'Free browser arcade shooter: crank a gatling gun from an armored wagon through a Joseon night of zombies, giant bosses, and a Tyrannosaur at the palace gate. No install, phone or PC. A new road every day, online leaderboard.',
  calm: 'CALM',
  kills: 'KILLS', armor: 'ARMOR', toPalace: 'TO THE PALACE', dawn: 'DAWN',
  titleHint: (mobile) => mobile ? 'touch = joystick · hold to fire · 雷 button' : 'click to aim · hold to fire · Space = 雷',
  contHint: 'TAP TO CONTINUE', contEnd: 'QUIT',
  pickTitle: 'C H O O S E   O N E',
  cards: {
    pierce: ['PIERCING', 'bullets punch through one more body'],
    rate: ['RAPID FIRE', 'the gatling spins 25% faster'],
    bomb: ['EXTRA 雷', 'carry one more rocket salvo'],
    regen: ['SELF-REPAIR', 'armor slowly mends itself'],
    repair: ['FIELD KIT', 'repair crates heal twice as much'],
    singijeon: ['SINGIJEON', 'rocket arrows rain on the pack every 7 s'],
    gunners: ['SIDE GUNNERS', 'rifles on both rails fire on their own'],
    thunder: ['LIGHTNING', 'the sky cleaves the biggest one'],
    spikes: ['IRON SPIKES', 'latched zombies impale twice as fast'],
  },
  place: (s) => PLACES_EN[s] || s,
  stage: (n, stop) => `STAGE ${n} · ${PLACES_EN[stop.name] || stop.name} · ${PLACES_EN[stop.sub] || stop.sub}`,
  roadOpen: 'THE ROAD IS OPEN', dawnComing: 'DAWN IS COMING', bloodNight: 'THE WAGON BURNS — BLOOD NIGHT',
  bossGiant: 'GIANT OF THE TEMPLE GATE', bossRex: 'TYRANT OF THE PALACE', chestOpen: 'THE CHEST IS OPEN', heartExposed: 'THE HEART IS EXPOSED', shootDown: 'SHOOT IT DOWN',
  repair: (n) => `REPAIR +${n}`,
  comboTiers: ['SLAUGHTER', 'MASSACRE', 'INFERNO', 'MYTH'],
  milestones: ['HUNDRED DEMONS', 'THREE HUNDRED', 'FIVE HUNDRED', 'THOUSAND CUT', 'LIVING WEAPON'],
  win: 'DAWN', lose: 'GAME OVER',
  statLine: (st) => `KILLS ${st.kills} · CHAIN ${st.maxCombo} · ACC ${Math.round(st.accuracy * 100)}% · ${st.win ? fmt(st.time) : `${st.reachedM} m TO PALACE`}`,
  btnShare: 'SHARE', btnPng: 'SAVE', btnRetry: 'AGAIN', noFrame: 'NO FRAME',
  dawnMark: 'DAWN', you: 'YOU', boardToday: (d) => `TODAY'S BOARD ${d}`, boardEmpty: 'nobody yet', boardAll: (n, s) => `ALL-TIME #1 ${n} ${s}`,
  myRank: (d, a, c) => `today #${d} · all-time #${a}${c > 1 ? ` · coins ${c}` : ''}`,
  shared: 'SHARED', cancelled: 'CANCELLED', copied: 'COPIED', copyFail: 'COPY FAILED', saved: 'SAVED',
  pngTitle: 'KINGDOMBI', pngStats: (st, acc, time) => `KILLS ${st.kills}   CHAIN ${st.maxCombo}   ACC ${acc}%   ${time}`,
  share: (st, fmtTime, acc, pips) => [
    '🌑 KINGDOMBI · Joseon-noir zombie gatling',
    `${String(st.score).padStart(7, '0')} pts · rank ${st.rank}${st.credits > 1 ? ` · ${st.credits} coins` : ''}`,
    st.win ? 'Felled the Tyrant and saw the dawn' : `The wagon stopped after ${fmtTime} · ${st.reachedM} m from the palace`,
    `${st.kills} kills · best chain ${st.maxCombo} · accuracy ${acc}% · ${st.razed} houses razed`,
    pips ? '🩸'.repeat(pips) : '🌑 a night in ink',
    '',
    'Can you reach the palace? → https://kingdombi.midagedev.com/?lang=en  by @midagedev',
  ],
};

export const S = LANG === 'ko' ? KO : EN;
