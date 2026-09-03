// 스킬(2026-09-03): 뱀서류 카드 선택 + 자동 보조공격. 아케이드 리듬 안에서만 — 선택은 정차 전환 3번, 자동공격은 巨人 뒤부터.
// 카드: 수치 5(관통·연사·雷·자가 수리·수리 강화) + 자동 4(신기전·옆 포수·벼락·가시 강화).
// 자동공격 처치는 배율 없이 절반 점수(cause 'auto') — 직접 쏘는 게 늘 유리하다.
// 신기전 궤적 문법은 i-circus(이타노 서커스) 미사일 sim 에서 가져왔다: 지상 발사 → 직진 상승(고도차 65%) → 정점 헤어핀(0.05초 정지 뒤 3배 스냅, 0.32초 채움)
//   → 유도(순추격 6 : 리드 3 : 코르크스크류 1, 회전율 상한) → 근접 신관. 트레일은 히스토리 링버퍼 + 단일 드로우 리본.
import * as THREE from 'three';
import { LAYER_SPOT } from './look.js';
import { S } from './i18n.js';

const IRON = new THREE.MeshStandardMaterial({ color: 0x23252b, metalness: 0.65, roughness: 0.45 });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x3a2a16, roughness: 0.9 });
const box = (w, h, d, m) => { const x = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); x.castShadow = true; return x; };

export function createSkills(scene, { horde, gun, vehicle, fx, audio, look, juice, game, hud, camera, pickups, bosses, path, onScore, isDemo = false }) {
  const st = { regen: 0, singijeon: false, gunners: false, thunder: false, spikes: false, taken: new Set(), picks: 0 };

  // ── 카드 ──
  const CARDS = {
    pierce: { glyph: '貫', apply: () => { gun.state.pierce++; } },
    rate: { glyph: '速', apply: () => { gun.state.rateMul *= 1.25; } },
    bomb: { glyph: '雷', apply: () => { gun.state.bombsMax++; gun.state.bombs++; } },
    regen: { glyph: '癒', apply: () => { st.regen += 0.7; } },
    repair: { glyph: '修', apply: () => { pickups.healMul *= 2; } },
    singijeon: { glyph: '箭', auto: true, apply: () => { st.singijeon = true; rack.visible = true; } },
    gunners: { glyph: '銃', auto: true, apply: () => { st.gunners = true; for (const g of gunners) g.root.visible = true; } },
    thunder: { glyph: '霆', auto: true, apply: () => { st.thunder = true; } },
    spikes: { glyph: '棘', auto: true, apply: () => { st.spikes = true; horde.impaleMul = 0.45; } },
  };
  const STAT = ['pierce', 'rate', 'bomb', 'regen', 'repair'], AUTO = ['singijeon', 'gunners', 'thunder', 'spikes'];

  // 선택 화면(DOM). kind: 'stat' | 'auto' | 'any'. 고르면 onDone.
  const el = document.createElement('div'); el.id = 'pick'; hud.appendChild(el);
  const style = document.createElement('style'); style.textContent = `
    #pick { position:absolute; inset:0; display:none; flex-direction:column; align-items:center; justify-content:center; background: rgba(0,0,0,.55); pointer-events:auto; }
    #pick.on { display:flex; }
    #pick .mark { font: 300 11px/1 var(--mono); letter-spacing:.55em; opacity:.6; margin-bottom: 18px; }
    #pick .cards { display:flex; gap: 12px; padding: 0 12px; max-width: 96vw; }
    #pick .card { flex: 1 1 0; min-width: 0; max-width: 220px; border: 1px solid rgba(233,230,223,.35); background: rgba(0,0,0,.5); padding: 18px 12px 16px; text-align:center; cursor:pointer; transition: transform .1s, border-color .2s; }
    #pick .card:active { transform: scale(.96); } #pick .card.auto { border-color: #e6c87a; }
    #pick .card .g { font: 200 46px/1 var(--serif); color: var(--ink); } #pick .card.auto .g { color:#e6c87a; }
    #pick .card .n { margin-top: 10px; font: 300 13px/1.3 var(--serif); letter-spacing:.2em; color: var(--ink); }
    #pick .card .d { margin-top: 8px; font: 300 11px/1.6 var(--serif); opacity:.7; word-break: keep-all; }
    #pick .card .k { margin-top: 10px; font: 300 10px/1 var(--mono); opacity:.4; }
    @media (max-width: 600px) { #pick .card { padding: 14px 8px 12px; } #pick .card .g { font-size: 38px; } #pick .card .n { font-size: 12px; } #pick .card .d { font-size: 10.5px; } }
  `; document.head.appendChild(style);
  let onDone = null, offered = [];
  function offer(kind, done) {
    const pool = (kind === 'stat' ? STAT : kind === 'auto' ? AUTO.filter((k) => !st.taken.has(k)) : [...AUTO.filter((k) => !st.taken.has(k)), ...STAT]);
    if (kind === 'auto' && pool.length < 3) pool.push(...STAT.filter((k) => !pool.includes(k)));
    offered = []; const src = [...pool]; while (offered.length < 3 && src.length) offered.push(src.splice(Math.floor(Math.random() * src.length), 1)[0]);
    el.innerHTML = `<div class="mark">${S.pickTitle}</div><div class="cards">${offered.map((k, i) => `<div class="card ${CARDS[k].auto ? 'auto' : ''}" data-k="${k}"><div class="g">${CARDS[k].glyph}</div><div class="n">${S.cards[k][0]}</div><div class="d">${S.cards[k][1]}</div><div class="k">${i + 1}</div></div>`).join('')}</div>`;
    el.classList.add('on'); game.paused = true; onDone = done || (() => {}); audio.coin?.();
    if (isDemo) setTimeout(() => choose(offered[Math.floor(Math.random() * offered.length)]), 1200);
  }
  function choose(k) {
    if (!onDone || !offered.includes(k)) return;
    CARDS[k].apply(); if (CARDS[k].auto) st.taken.add(k); st.picks++;
    el.classList.remove('on'); game.paused = false;
    juice.stamp(CARDS[k].glyph); juice.banner(S.cards[k][0], 1800);
    const d = onDone; onDone = null; d();
  }
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); const c = e.target.closest('.card'); if (c) choose(c.dataset.k); });
  addEventListener('keydown', (e) => { if (!onDone) return; const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i >= 0 && offered[i]) choose(offered[i]); });

  // ── 공용: 자동공격 처치는 cause 'auto' ──
  const auto = (fn) => { horde.causeOverride = 'auto'; try { return fn(); } finally { horde.causeOverride = null; } };
  const vpos = vehicle.pos;
  // 포탑이 보는 쪽 기준 앞거리(+ 앞 / − 뒤). 추격(horde.chase)은 뒤(+z)가 사냥터다 — 이게 없으면 箭·銃·霆 이 추격 내내 표적 0 (2026-09-03 실측: 270 마리 중 후보 0).
  const ahead = (dz) => (horde.chase ? dz : -dz);
  // 레일 좌표(2026-09-03): 옛 dz = pz − vpos.z ≡ −(s_i − s_v), 옛 dx = px − vpos.x ≡ lat. 표적 후보 판정만 이걸 쓰고, 데미지 방향·이펙트는 월드 그대로.
  const _al = { s: 0, lat: 0, k: 0 };
  const relZ = (x, z) => { path.along(x, z, _al); return -(_al.s - vehicle.state.s); };   // relZ 뒤엔 _al.lat 이 그 점의 dx
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _z = new THREE.Vector3(0, 0, 1);

  // ── 옆 포수: 마차 양옆 소총 2정. 0.22초마다 16 m 안 가장 가까운 좀비를 쏜다 ──
  const gunners = [];
  for (const sx of [-1, 1]) {
    const root = new THREE.Group(); root.position.set(sx * 1.25, 2.05, 1.5); root.visible = false; vehicle.body.add(root);
    const post = box(0.08, 0.5, 0.08, IRON); post.position.y = 0.2; root.add(post);
    const pivot = new THREE.Group(); pivot.position.y = 0.48; root.add(pivot);
    const barrel = box(0.06, 0.06, 0.9, IRON); barrel.position.z = -0.35; pivot.add(barrel);
    const stock = box(0.09, 0.12, 0.3, WOOD); stock.position.set(0, -0.03, 0.2); pivot.add(stock);
    gunners.push({ root, pivot, sx, cd: Math.random() * 0.2 });
  }
  const TR = 16;
  const trGeo = new THREE.BoxGeometry(0.05, 0.05, 1); { const pa = trGeo.attributes.position, col = new Float32Array(pa.count * 3); for (let i = 0; i < pa.count; i++) { const t = pa.getZ(i) + 0.5; col[i * 3] = 0.4 + 0.6 * t; col[i * 3 + 1] = 0.2 + 0.7 * t; col[i * 3 + 2] = 0.05 + 0.5 * t; } trGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const tracers = new THREE.InstancedMesh(trGeo, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), TR);
  tracers.layers.set(LAYER_SPOT); tracers.frustumCulled = false; tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(tracers);
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < TR; i++) tracers.setMatrixAt(i, z); }   // three r185 인스턴스 기본값은 항등행렬 — 쓰지 않는 슬롯이 원점에 그려진다
  const trBorn = new Float32Array(TR).fill(-1e9); let trCur = 0;
  function tracerLine(ax, ay, az, bx, by, bz, time) {
    const i = trCur; trCur = (trCur + 1) % TR; trBorn[i] = time;
    _v.set(bx - ax, by - ay, bz - az); const L = _v.length(); _v.normalize(); _q.setFromUnitVectors(_z, _v);
    _w.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); _s.set(1, 1, L); _m.compose(_w, _q, _s); tracers.setMatrixAt(i, _m); _s.set(1, 1, 1);
    tracers.instanceMatrix.needsUpdate = true;
  }
  function updateTracers(time) {
    let dirty = false;
    for (let i = 0; i < TR; i++) { const age = time - trBorn[i]; if (age > 0.07 && age < 0.5) { _m.makeScale(0, 0, 0); tracers.setMatrixAt(i, _m); trBorn[i] = -1e9; dirty = true; } }
    if (dirty) tracers.instanceMatrix.needsUpdate = true;
  }
  function updateGunners(dt, time) {
    for (const g of gunners) {
      g.cd -= dt; if (g.cd > 0) continue;
      let best = -1, bd = 16 * 16;
      for (let i = 0; i < horde.N; i++) {
        if (!horde.alive[i]) continue;
        const dz = relZ(horde.px[i], horde.pz[i]), dx = _al.lat;
        if (dx * g.sx < -1.5 || ahead(dz) < -5) continue;   // 자기 쪽 절반, 등 뒤는 제외
        const d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; }
      }
      g.cd = 0.22;
      if (best < 0) continue;
      g.pivot.getWorldPosition(_w);
      const tx = horde.px[best], tz = horde.pz[best], ty = 1.1 * horde.scale[best];
      g.pivot.lookAt(tx, ty, tz); g.pivot.rotateY(Math.PI);   // Group forward 는 +z, 총열은 -z
      const dx = tx - _w.x, dz = tz - _w.z, d = Math.hypot(dx, dz) || 1;
      const killed = auto(() => horde.damage(best, 5, dx / d, dz / d, time, 3));
      tracerLine(_w.x, _w.y, _w.z, tx, ty, tz, time);
      gun.spark?.(tx, ty, tz, time);
      fx.blood.burst(tx, ty, tz, killed ? 6 : 2, { dirX: dx / d * 0.6, dirY: 0.3, dirZ: dz / d * 0.6, spread: 0.6, power: 4, scale: 0.9, time });
      if (killed) fx.decals.add(tx, tz, 1.2, time);
      audio.shot?.();
    }
  }

  // ── 벼락: 6.5초마다 거대 좀비(없으면 가장 빽빽한 곳)에 낙뢰 ──
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xffffff })); bolt.layers.set(LAYER_SPOT); bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);
  let thunderCd = 4, boltUntil = -1;
  function updateThunder(dt, time) {
    if (boltUntil > 0 && time > boltUntil) { bolt.visible = false; boltUntil = -1; }
    thunderCd -= dt; if (thunderCd > 0) return;
    let best = -1, bs = -1;
    for (let i = 0; i < horde.N; i++) {
      if (!horde.alive[i]) continue;
      const dz = relZ(horde.px[i], horde.pz[i]), dx = _al.lat; const a = ahead(dz); if (a < -4 || a > 45 || Math.abs(dx) > 30) continue;
      const score = (horde.type[i] === 1 ? 100 : 0) + Math.random() * 10 - Math.hypot(dx, dz) * 0.2;
      if (score > bs) { bs = score; best = i; }
    }
    if (best < 0) return;
    thunderCd = 6.5;
    const x = horde.px[best], z = horde.pz[best];
    const pa = boltGeo.attributes.position; let px = x + (Math.random() - 0.5) * 10, pz = z + (Math.random() - 0.5) * 10;
    for (let k = 0; k < 9; k++) { const t = k / 8; const jx = (Math.random() - 0.5) * 2.2 * (1 - t), jz = (Math.random() - 0.5) * 2.2 * (1 - t); pa.setXYZ(k, px + (x - px) * t + jx, 42 * (1 - t), pz + (z - pz) * t + jz); }
    pa.needsUpdate = true; bolt.visible = true; boltUntil = time + 0.13;
    auto(() => horde.crushNear(x, z, 2.8, time));
    fx.shards.burst(x, 0.4, z, 24, { dirY: 1.0, spread: 1.4, power: 9, scale: 0.9, time }); fx.blood.burst(x, 1.0, z, 18, { dirY: 0.8, spread: 1.4, power: 9, scale: 1.2, time }); fx.decals.add(x, z, 2.2, time);
    look.state.flash = Math.max(look.state.flash, 0.45); game.shake = Math.max(game.shake, 0.5);
    audio.thunder?.(); juice.stamp('霆');
  }

  // ── 가시 강화: 4.5 m 안 좀비가 초당 3 씩 긁힌다(피격 플래시 없음) ──
  function updateSpikes(dt, time) { auto(() => horde.aura(vpos.x, vpos.z, 4.5, 3 * dt, time)); }

  // ── 신기전: 뒤 갑판의 발사대에서 7초마다 6발. i-circus 미사일 문법(BOOST → HOOK → HOME → 근접 신관) ──
  const rack = new THREE.Group(); rack.position.set(0, 1.95, 2.0); rack.rotation.x = -0.95; rack.visible = false; vehicle.body.add(rack);
  { const frame = box(1.1, 0.16, 0.5, WOOD); rack.add(frame); const tubeGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.9, 7); for (let k = 0; k < 6; k++) { const t = new THREE.Mesh(tubeGeo, IRON); t.rotation.x = Math.PI / 2; t.position.set(-0.4 + (k % 3) * 0.4, 0.14 + Math.floor(k / 3) * 0.14, 0); t.castShadow = true; rack.add(t); } }
  const MAXM = 24, H = 14;
  const mPos = new Float32Array(MAXM * 3), mVel = new Float32Array(MAXM * 3), mPhase = new Uint8Array(MAXM), mT = new Float32Array(MAXM), mType = new Uint8Array(MAXM), mTgt = new Int32Array(MAXM).fill(-1), mBoss = new Uint8Array(MAXM), mApexY = new Float32Array(MAXM), mOrgY = new Float32Array(MAXM), mHook = new Float32Array(MAXM), mLife = new Float32Array(MAXM), mIgn = new Float32Array(MAXM), mCork = new Float32Array(MAXM);
  const PH = { OFF: 0, WAIT: 1, BOOST: 2, HOOK: 3, HOME: 4 };
  const CRUISE = 30, BOOST_SPD = 22;
  // 몸체(세계 레이어, 잉크) + 꼬리 불(스팟 레이어)
  const bodyGeo = new THREE.CylinderGeometry(0.0, 0.11, 1.0, 6); bodyGeo.rotateX(Math.PI / 2);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.8 }), MAXM); bodies.frustumCulled = false; bodies.castShadow = true; bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(bodies);
  const flames = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), MAXM); flames.layers.set(LAYER_SPOT); flames.frustumCulled = false; flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(flames);
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MAXM; i++) { bodies.setMatrixAt(i, z); flames.setMatrixAt(i, z); } }   // 인스턴스 기본 항등행렬 → 미사용 슬롯 0-스케일
  // 연기 리본: 미사일당 H 점 히스토리 링버퍼 → 단일 지오메트리(MAXM × H × 2 정점). 폭은 머리 좁게 → 몸통 부풀고 → 꼬리에서 흩어진다.
  const hist = new Float32Array(MAXM * H * 3), histN = new Uint8Array(MAXM), histHead = new Uint8Array(MAXM), histT = new Float32Array(MAXM);
  const ribGeo = new THREE.BufferGeometry();
  const ribPos = new Float32Array(MAXM * H * 2 * 3), ribA = new Float32Array(MAXM * H * 2);
  ribGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3).setUsage(THREE.DynamicDrawUsage)); ribGeo.setAttribute('aAlpha', new THREE.BufferAttribute(ribA, 1).setUsage(THREE.DynamicDrawUsage));
  { const idx = []; for (let m = 0; m < MAXM; m++) for (let k = 0; k < H - 1; k++) { const b = (m * H + k) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } ribGeo.setIndex(idx); }
  const ribbon = new THREE.Mesh(ribGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // 잉크 연기(어둡고 옅게). 밝은 흰 리본은 6발이 겹치면 조준선 위에 종이 장막을 쳐서 떼가 안 보였다 —
    // 추격전에선 발사대가 바로 시선 방향이라 더 심하다.
    fragmentShader: 'varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(vec3(0.30, 0.29, 0.27), vA * 0.42); }',
  })); ribbon.frustumCulled = false; scene.add(ribbon);
  // 정점 링("팡"): 헤어핀 순간 스팟 레이어 링 스프라이트
  const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 26, 0, 6.2832); g.stroke(); return new THREE.CanvasTexture(c); })();
  const RINGS = 8; const rings = []; const ringBorn = new Float32Array(RINGS).fill(-1e9); let ringCur = 0;
  for (let i = 0; i < RINGS; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: 0xffd08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.layers.set(LAYER_SPOT); s.visible = false; scene.add(s); rings.push(s); }
  function apexRing(x, y, z, time) { const i = ringCur; ringCur = (ringCur + 1) % RINGS; rings[i].position.set(x, y, z); rings[i].visible = true; ringBorn[i] = time; }
  function updateRings(time) { for (let i = 0; i < RINGS; i++) { if (!rings[i].visible) continue; const a = (time - ringBorn[i]) / 0.22; if (a > 1) { rings[i].visible = false; continue; } rings[i].scale.setScalar(0.4 + a * 2.6); rings[i].material.opacity = 1 - a; } }

  let volleyCd = 5;
  function pickTargets(n) {
    // 앞쪽 60 m 안 좀비 중 거리순 40명에서 무작위 n 명(같은 놈 중복 없이). 보스가 있으면 둘은 보스.
    const cand = [];
    for (let i = 0; i < horde.N; i++) { if (!horde.alive[i]) continue; const a = ahead(relZ(horde.px[i], horde.pz[i])); if (a < -2 || a > 60 || Math.abs(_al.lat) > 30) continue; cand.push(i); }
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    return cand.slice(0, n);
  }
  function launchVolley(time) {
    const boss = bosses.active && bosses.active.alive ? bosses.active : null;
    const tg = pickTargets(6);
    if (!tg.length && !boss) return false;
    rack.getWorldPosition(_w);
    let n = 0;
    for (let k = 0; k < 6; k++) {
      let slot = -1; for (let i = 0; i < MAXM; i++) if (mPhase[i] === PH.OFF) { slot = i; break; }
      if (slot < 0) break;
      const useBoss = boss && (k < 2 || !tg.length);
      if (!useBoss && !tg.length) break;
      mBoss[slot] = useBoss ? 1 : 0; mTgt[slot] = useBoss ? -1 : tg[k % tg.length];
      // 관 좌우 간격도 마차 기준 — 로컬 x 오프셋을 θ 로 회전
      const off = (k % 3 - 1) * 0.4, cth0 = Math.cos(vehicle.state.heading), sth0 = Math.sin(vehicle.state.heading);
      mPos[slot * 3] = _w.x + off * cth0; mPos[slot * 3 + 1] = _w.y + 0.3; mPos[slot * 3 + 2] = _w.z - off * sth0;
      // 발사 방향: 위쪽 앞(고각 68°), 좌우 살짝 벌어짐
      const yaw = (k % 3 - 1) * 0.22 + (Math.random() - 0.5) * 0.1, el = 1.19 + (Math.random() - 0.5) * 0.12;
      // 로컬(마차 기준) 방향 → 헤딩 θ 로 y 축 회전해서 월드로. 로컬 (0,0,−1) 이 (−sinθ, 0, −cosθ) 가 된다.
      const lvx = Math.sin(yaw) * Math.cos(el) * BOOST_SPD, lvz = -Math.cos(yaw) * Math.cos(el) * BOOST_SPD * (horde.chase ? -1 : 1);
      const cth = Math.cos(vehicle.state.heading), sth = Math.sin(vehicle.state.heading);
      mVel[slot * 3] = lvx * cth + lvz * sth; mVel[slot * 3 + 1] = Math.sin(el) * BOOST_SPD; mVel[slot * 3 + 2] = -lvx * sth + lvz * cth;
      mOrgY[slot] = mPos[slot * 3 + 1]; mApexY[slot] = mOrgY[slot] + 9 + Math.random() * 5;
      mPhase[slot] = PH.WAIT; mIgn[slot] = time + k * 0.09;   // 점화 스태거
      mT[slot] = 0; mLife[slot] = 0; mHook[slot] = -1;
      const r = Math.random(); mType[slot] = r < 0.6 ? 0 : r < 0.9 ? 1 : 2; mCork[slot] = Math.random() * 6.28;
      histN[slot] = 0; histHead[slot] = 0; histT[slot] = 0;
      n++;
    }
    if (n) { audio.hitStone?.(); look.state.flash = Math.max(look.state.flash, 0.12); juice.stamp('箭'); }
    return n > 0;
  }
  function explode(i, time) {
    const x = mPos[i * 3], y = mPos[i * 3 + 1], z = mPos[i * 3 + 2];
    mPhase[i] = PH.OFF;
    auto(() => horde.crushNear(x, z, 3.2, time));
    fx.shards.burst(x, Math.max(0.4, y), z, 16, { dirY: 0.9, spread: 1.3, power: 8, scale: 0.8, time });
    fx.blood.burst(x, Math.max(0.8, y), z, 14, { dirY: 0.7, spread: 1.3, power: 8, scale: 1.1, time });
    fx.decals.add(x, z, 2.4, time);
    gun.spark?.(x, y + 0.2, z, time); apexRing(x, y + 0.3, z, time);
    look.state.flash = Math.max(look.state.flash, 0.18); game.shake = Math.max(game.shake, 0.25);
    audio.collapse?.(0.35);
    const b = bosses.active;
    if (b && b.alive) {
      const c = new THREE.Vector3(); let hitP = null, hd = 4.5;
      for (const p of b.parts) { if (p.destroyed || p.kind === 'body' || p.kind === 'core') continue; p.box.getCenter(c); const d = Math.hypot(c.x - x, c.y - y, c.z - z); if (d < hd) { hd = d; hitP = p; } }
      if (hitP) { hitP.box.getCenter(c); b.hit(hitP, 22, c.x, c.y, c.z, (c.x - x) / (hd || 1), (c.z - z) / (hd || 1), time); }
      else { const bp = b.root.position; if (Math.hypot(bp.x - x, bp.z - z) < 7) { b.hp -= 30; b.flash = 1; } }
    }
    onScore?.(150, null);
  }
  const tgtPos = (i, out) => {
    if (mBoss[i]) { const b = bosses.active; if (b && b.alive) { out.set(b.root.position.x, 3.5, b.root.position.z); return true; } return false; }
    const t = mTgt[i]; if (t >= 0 && horde.alive[t]) { out.set(horde.px[t], 1.0 * horde.scale[t], horde.pz[t]); return true; }
    return false;
  };
  const _tp = new THREE.Vector3(), _d = new THREE.Vector3(), _side = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function steer(i, desired, maxRate, dt, speedTarget) {
    _v.set(mVel[i * 3], mVel[i * 3 + 1], mVel[i * 3 + 2]); const sp = _v.length() || 1; _v.multiplyScalar(1 / sp);
    const ang = Math.acos(THREE.MathUtils.clamp(_v.dot(desired), -1, 1));
    if (ang > 1e-4) { const f = Math.min(1, (maxRate * dt) / ang); _v.lerp(desired, f).normalize(); }
    const ns = sp + (speedTarget - sp) * Math.min(1, dt * 6);
    mVel[i * 3] = _v.x * ns; mVel[i * 3 + 1] = _v.y * ns; mVel[i * 3 + 2] = _v.z * ns;
  }
  function updateMissiles(dt, time) {
    let any = false;
    for (let i = 0; i < MAXM; i++) {
      if (mPhase[i] === PH.OFF) continue;
      any = true;
      if (mPhase[i] === PH.WAIT) { if (time < mIgn[i]) { writeInstance(i, false); continue; } mPhase[i] = PH.BOOST; }
      mLife[i] += dt;
      const has = tgtPos(i, _tp);
      if (!has) {
        // 표적이 죽었으면 미사일 근처 좀비로 재표적(20 m). 없으면 마지막 방향으로 날아가 땅에 박힌다.
        let best = -1, bd = 400; for (let j = 0; j < horde.N; j++) { if (!horde.alive[j]) continue; const dx = horde.px[j] - mPos[i * 3], dz = horde.pz[j] - mPos[i * 3 + 2]; const d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = j; } }
        if (best >= 0) { mTgt[i] = best; mBoss[i] = 0; tgtPos(i, _tp); } else _tp.set(mPos[i * 3] + mVel[i * 3], 0, mPos[i * 3 + 2] + mVel[i * 3 + 2]);
      }
      _d.set(_tp.x - mPos[i * 3], _tp.y - mPos[i * 3 + 1], _tp.z - mPos[i * 3 + 2]); const dist = _d.length() || 1; _d.multiplyScalar(1 / dist);
      if (mPhase[i] === PH.BOOST) {
        // 직진 상승. 고도차의 65% 를 채우면 헤어핀.
        if (mPos[i * 3 + 1] >= mOrgY[i] + 0.65 * (mApexY[i] - mOrgY[i])) { mPhase[i] = PH.HOOK; mHook[i] = time; apexRing(mPos[i * 3], mPos[i * 3 + 1], mPos[i * 3 + 2], time); }
        else steer(i, _v.set(mVel[i * 3], mVel[i * 3 + 1], mVel[i * 3 + 2]).normalize(), 0, dt, BOOST_SPD);
      }
      if (mPhase[i] === PH.HOOK) {
        // 정점: 0.05초 정지(8%) → 3배 스냅 → 0.32초 동안 순항으로 채움. 회전율 3배.
        const ta = time - mHook[i];
        const prof = ta < 0.05 ? 0.08 : 1 + 2 * Math.pow(Math.max(0, 1 - (ta - 0.05) / 0.32), 1);
        steer(i, _d, 9.0, dt, CRUISE * prof);
        if (ta > 0.37) mPhase[i] = PH.HOME;
      } else if (mPhase[i] === PH.HOME) {
        // 유도: 순추격 / 리드(표적 속도 × t_go × 0.75) / 코르크스크류(옆으로 감기)
        if (mType[i] === 1 && mTgt[i] >= 0) { const t = mTgt[i]; const tgo = Math.min(1.2, dist / CRUISE); _tp.x += horde.vx[t] * tgo * 0.75; _tp.z += horde.vz[t] * tgo * 0.75; _d.set(_tp.x - mPos[i * 3], _tp.y - mPos[i * 3 + 1], _tp.z - mPos[i * 3 + 2]).normalize(); }
        if (mType[i] === 2 && dist > 5) { _side.crossVectors(_d, _up).normalize(); const a = Math.sin(mLife[i] * 9 + mCork[i]) * 0.55 * Math.min(1, dist / 15); _d.addScaledVector(_side, a).addScaledVector(_up, Math.cos(mLife[i] * 9 + mCork[i]) * 0.3).normalize(); }
        steer(i, _d, 4.6, dt, CRUISE);
      }
      // 적분 + 종말
      mPos[i * 3] += mVel[i * 3] * dt; mPos[i * 3 + 1] += mVel[i * 3 + 1] * dt; mPos[i * 3 + 2] += mVel[i * 3 + 2] * dt;
      const near = Math.hypot(_tp.x - mPos[i * 3], _tp.y - mPos[i * 3 + 1], _tp.z - mPos[i * 3 + 2]);
      if ((mPhase[i] === PH.HOME && near < 1.4) || mPos[i * 3 + 1] < 0.25 || mLife[i] > 6) { explode(i, time); writeInstance(i, false); continue; }
      // 히스토리 푸시(0.03초)
      if (time - histT[i] > 0.03) { histT[i] = time; const h = histHead[i]; hist[(i * H + h) * 3] = mPos[i * 3]; hist[(i * H + h) * 3 + 1] = mPos[i * 3 + 1]; hist[(i * H + h) * 3 + 2] = mPos[i * 3 + 2]; histHead[i] = (h + 1) % H; if (histN[i] < H) histN[i]++; }
      writeInstance(i, true);
    }
    if (any) { bodies.instanceMatrix.needsUpdate = true; flames.instanceMatrix.needsUpdate = true; }
    updateRibbon(time);
  }
  function writeInstance(i, on) {
    if (!on) { _m.makeScale(0, 0, 0); bodies.setMatrixAt(i, _m); flames.setMatrixAt(i, _m); bodies.instanceMatrix.needsUpdate = true; flames.instanceMatrix.needsUpdate = true; return; }
    _v.set(mVel[i * 3], mVel[i * 3 + 1], mVel[i * 3 + 2]).normalize(); _q.setFromUnitVectors(_z, _v);
    _w.set(mPos[i * 3], mPos[i * 3 + 1], mPos[i * 3 + 2]); _m.compose(_w, _q, _s); bodies.setMatrixAt(i, _m);
    _w.addScaledVector(_v, -0.55); const fs = 0.7 + Math.random() * 0.5; _m.makeScale(fs, fs, fs); _m.setPosition(_w); flames.setMatrixAt(i, _m);
  }
  function updateRibbon(time) {
    // 리본: 각 미사일의 히스토리 점을 카메라 방향과 수직으로 벌린다. 폭: 머리 0.12 → 몸통 0.5(30%) → 꼬리 0. 알파는 끝 25% 에서 사라진다.
    for (let i = 0; i < MAXM; i++) {
      const n = histN[i];
      for (let k = 0; k < H; k++) {
        const vb = (i * H + k) * 2;
        if (n < 2 || k >= n || (mPhase[i] === PH.OFF && time - histT[i] > 1.2)) { ribA[vb] = ribA[vb + 1] = 0; continue; }
        // k=0 이 최신(머리), k=n-1 이 가장 오래된 점
        const h = (histHead[i] - 1 - k + H * 2) % H, hp = (histHead[i] - 2 - k + H * 2) % H;
        const x = hist[(i * H + h) * 3], y = hist[(i * H + h) * 3 + 1], z = hist[(i * H + h) * 3 + 2];
        const px = hist[(i * H + hp) * 3], py = hist[(i * H + hp) * 3 + 1], pz = hist[(i * H + hp) * 3 + 2];
        _d.set(x - px, y - py, z - pz); if (_d.lengthSq() < 1e-6) _d.set(0, 1, 0); _d.normalize();
        _v.set(camera.position.x - x, camera.position.y - y, camera.position.z - z).normalize();
        _side.crossVectors(_d, _v).normalize();
        const a01 = k / Math.max(1, n - 1);
        const width = a01 < 0.3 ? 0.12 + (0.5 - 0.12) * (a01 / 0.3) : 0.5 * (1 - Math.max(0, (a01 - 0.75) / 0.25));
        const billow = 1 + 0.2 * Math.sin(x * 1.7 + z * 2.3 + k * 1.1);
        const fade = (mPhase[i] === PH.OFF ? Math.max(0, 1 - (time - histT[i]) / 1.2) : 1) * (1 - Math.max(0, (a01 - 0.75) / 0.25)) * 0.85;
        ribPos[vb * 3] = x + _side.x * width * billow; ribPos[vb * 3 + 1] = y + _side.y * width * billow; ribPos[vb * 3 + 2] = z + _side.z * width * billow;
        ribPos[vb * 3 + 3] = x - _side.x * width; ribPos[vb * 3 + 4] = y - _side.y * width; ribPos[vb * 3 + 5] = z - _side.z * width;
        ribA[vb] = ribA[vb + 1] = fade;
      }
    }
    ribGeo.attributes.position.needsUpdate = true; ribGeo.attributes.aAlpha.needsUpdate = true;
  }

  function update(dt, time) {
    rack.rotation.y = horde.chase ? Math.PI : 0;   // 발사대도 보는 쪽으로
    if (st.gunners) updateGunners(dt, time);
    if (st.thunder) updateThunder(dt, time);
    if (st.spikes && dt > 0) updateSpikes(dt, time);
    if (st.singijeon) { volleyCd -= dt; if (volleyCd <= 0 && launchVolley(time)) volleyCd = 7; else if (volleyCd <= 0) volleyCd = 1.5; }
    updateMissiles(dt, time); updateTracers(time); updateRings(time);
    if (st.regen > 0 && game.pendingDamage <= 0 && !game.over) game.hp = Math.min(100, game.hp + st.regen * dt);
  }
  return { st, offer, choose, update, CARDS, get picking() { return !!onDone; }, dbg: { mPhase, mPos, mVel, mTgt, mLife, PH } };
}
