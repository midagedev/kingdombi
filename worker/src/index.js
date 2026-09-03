// 킹덤비 순위표 — Cloudflare Worker + KV. 일간(day) 보드와 전체(all) 보드.
// 키 = `s:<day>:<4000000-score 7자리>:<rand>` → KV list 는 키 오름차순이라 점수 내림차순으로 나온다. 값은 metadata 에만(list 한 번으로 끝).
// 부정 방지는 없다(클라이언트 점수). 상한·이름 정제·IP 분당 횟수만 자른다 — 아케이드 순위표는 원래 그 정도였다.
const MAX_SCORE = 4_000_000;
const ORIGINS = ['https://kingdombi.midagedev.com', 'https://midagedev.github.io', 'http://localhost:4400', 'http://127.0.0.1:4400'];
const TOP = 20;

function cors(req) {
  const o = req.headers.get('Origin') || '';
  const ok = ORIGINS.includes(o) || /^http:\/\/(localhost|192\.168\.\d+\.\d+):\d+$/.test(o);
  return { 'Access-Control-Allow-Origin': ok ? o : ORIGINS[0], 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' };
}
const json = (data, req, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });
const dayOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Math.abs(Date.now() - Date.parse(d)) < 2 * 86400e3;   // 시간대 차이 허용: ±2일
const cleanName = (n) => String(n ?? '').replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 3).toUpperCase() || 'AAA';
const inv = (s) => String(MAX_SCORE - s).padStart(7, '0');

async function top(env, board, day) {
  const prefix = board === 'all' ? 'a:' : `s:${day}:`;
  const list = await env.KB_SCORES.list({ prefix, limit: TOP });
  return list.keys.map((k, i) => ({ rank: i + 1, ...k.metadata }));
}
async function rankOf(env, board, day, score) {
  // 내 점수보다 높은 키 수 + 1. 1000 개까지만 훑는다(그 밖이면 '1000+').
  const prefix = board === 'all' ? 'a:' : `s:${day}:`;
  let n = 0, cursor;
  do {
    const l = await env.KB_SCORES.list({ prefix, limit: 1000, cursor });
    for (const k of l.keys) { if (k.metadata?.s > score) n++; else return n + 1; }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor && n < 1000);
  return n >= 1000 ? 1000 : n + 1;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const day = url.searchParams.get('day') || new Date().toISOString().slice(0, 10);
    if (req.method === 'GET' && url.pathname === '/top') {
      if (!dayOk(day)) return json({ error: 'bad day' }, req, 400);
      const [today, all] = await Promise.all([top(env, 'day', day), top(env, 'all')]);
      return json({ day, today, all }, req);
    }
    if (req.method === 'POST' && url.pathname === '/score') {
      let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, req, 400); }
      const score = Math.floor(+b.score);
      if (!(score >= 0 && score <= MAX_SCORE)) return json({ error: 'bad score' }, req, 400);
      const d = String(b.day || day); if (!dayOk(d)) return json({ error: 'bad day' }, req, 400);
      // IP 분당 6회
      const ip = req.headers.get('CF-Connecting-IP') || '0';
      const rlKey = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
      const n = +((await env.KB_SCORES.get(rlKey)) || 0);
      if (n >= 6) return json({ error: 'slow down' }, req, 429);
      await env.KB_SCORES.put(rlKey, String(n + 1), { expirationTtl: 120 });
      const meta = { n: cleanName(b.name), s: score, k: Math.min(99999, Math.max(0, Math.floor(+b.kills || 0))), w: !!b.win, c: Math.min(9, Math.max(1, Math.floor(+b.credits || 1))), d, t: Date.now() };
      const rand = Math.random().toString(36).slice(2, 8);
      await Promise.all([
        env.KB_SCORES.put(`s:${d}:${inv(score)}:${rand}`, '1', { metadata: meta, expirationTtl: 45 * 86400 }),   // 일간 보드는 45일 보존
        env.KB_SCORES.put(`a:${inv(score)}:${rand}`, '1', { metadata: meta }),
      ]);
      const [rankDay, rankAll, today, all] = await Promise.all([rankOf(env, 'day', d, score), rankOf(env, 'all', d, score), top(env, 'day', d), top(env, 'all')]);
      return json({ day: d, rankDay, rankAll, today, all }, req);
    }
    return json({ ok: true, hint: 'GET /top?day=YYYY-MM-DD · POST /score {name,score,kills,win,credits,day}' }, req);
  },
};
