// 합성 사운드(외부 에셋 0): 개틀링 스핀업·발사·북 타격·붕괴 굉음·좀비 울음·빗소리.
export function createAudio() {
  let ctx = null, master, comp, noiseBuf, spinOsc, spinGain, spinFilter, rainGain, groanGain, groanFilter, fireBase, fireLfoGain, thumpOsc, thumpGain;
  let shotCount = 0;
  const started = () => !!ctx;

  function makeNoise(c) {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = (w * 0.6 + last * 3.5) * 0.5; } // 살짝 핑크
    return b;
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = makeNoise(ctx);

    // 스핀: 두 톱니파 + 로우패스, 회전수에 따라 피치·볼륨
    spinGain = ctx.createGain(); spinGain.gain.value = 0;
    spinFilter = ctx.createBiquadFilter(); spinFilter.type = 'lowpass'; spinFilter.frequency.value = 400; spinFilter.Q.value = 2;
    spinOsc = [ctx.createOscillator(), ctx.createOscillator()];
    spinOsc[0].type = 'sawtooth'; spinOsc[1].type = 'square';
    spinOsc[0].frequency.value = 40; spinOsc[1].frequency.value = 40.7;
    for (const o of spinOsc) { o.connect(spinFilter); o.start(); }
    spinFilter.connect(spinGain).connect(master);

    // 발사음: 노이즈 루프 하나를 42Hz 사각파로 게이트(iOS 에서 초당 수십 노드 생성은 크래클/CPU 스파이크)
    const fire = ctx.createBufferSource(); fire.buffer = noiseBuf; fire.loop = true; fire.playbackRate.value = 1.3;
    const ff = ctx.createBiquadFilter(); ff.type = 'bandpass'; ff.frequency.value = 1100; ff.Q.value = 0.6;
    fireBase = ctx.createGain(); fireBase.gain.value = 0;           // 0(정지) / 0.5(발사 중, LFO 가 ±0.5 로 흔든다)
    const fireLfo = ctx.createOscillator(); fireLfo.type = 'square'; fireLfo.frequency.value = 42;
    fireLfoGain = ctx.createGain(); fireLfoGain.gain.value = 0;
    fireLfo.connect(fireLfoGain).connect(fireBase.gain); fireLfo.start();
    const fireOut = ctx.createGain(); fireOut.gain.value = 0.28;
    fire.connect(ff).connect(fireBase).connect(fireOut).connect(master); fire.start();
    // 저음 펀치: 같은 LFO 로 게이트되는 60Hz 사인
    thumpOsc = ctx.createOscillator(); thumpOsc.frequency.value = 62;
    thumpGain = ctx.createGain(); thumpGain.gain.value = 0;
    thumpOsc.connect(thumpGain).connect(fireBase).connect(master); thumpOsc.start();

    // 빗소리: 노이즈 하이패스 루프
    const rain = ctx.createBufferSource(); rain.buffer = noiseBuf; rain.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1800;
    rainGain = ctx.createGain(); rainGain.gain.value = 0.045;
    rain.connect(rf).connect(rainGain).connect(master); rain.start();

    // 좀비 울음: 노이즈 밴드패스(저역) + LFO 로 밀도 표현
    const groan = ctx.createBufferSource(); groan.buffer = noiseBuf; groan.loop = true; groan.playbackRate.value = 0.35;
    groanFilter = ctx.createBiquadFilter(); groanFilter.type = 'bandpass'; groanFilter.frequency.value = 180; groanFilter.Q.value = 1.2;
    groanGain = ctx.createGain(); groanGain.gain.value = 0;
    groan.connect(groanFilter).connect(groanGain).connect(master); groan.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7; const lfoG = ctx.createGain(); lfoG.gain.value = 90;
    lfo.connect(lfoG).connect(groanFilter.frequency); lfo.start();
  }

  function setSpin(level) { // 0..1
    if (!ctx) return;
    const f = 40 + level * 170;
    spinOsc[0].frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
    spinOsc[1].frequency.setTargetAtTime(f * 1.007, ctx.currentTime, 0.05);
    spinFilter.frequency.setTargetAtTime(300 + level * 1400, ctx.currentTime, 0.05);
    spinGain.gain.setTargetAtTime(level * 0.12, ctx.currentTime, 0.04);
  }
  function setGroan(level) { if (ctx) groanGain.gain.setTargetAtTime(Math.min(0.35, level), ctx.currentTime, 0.3); }

  function noiseBurst({ freq = 1200, q = 0.8, gain = 0.3, dur = 0.06, type = 'bandpass', rate = 1 }) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rate; src.loop = true;
    src.loopStart = Math.random() * 1.5;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master); src.start(t, src.loopStart); src.stop(t + dur + 0.02);
  }
  function tone({ freq = 60, to = 30, gain = 0.4, dur = 0.12, type = 'sine' }) {
    const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  function setFiring(on) {
    if (!ctx) return;
    const t = ctx.currentTime;
    fireBase.gain.setTargetAtTime(on ? 0.5 : 0, t, 0.02);
    fireLfoGain.gain.setTargetAtTime(on ? 0.5 : 0, t, 0.02);
    thumpGain.gain.setTargetAtTime(on ? 0.35 : 0, t, 0.02);
  }
  function shot() {
    if (!ctx) return;
    shotCount++;
    // 북: 여덟 발마다 한 번, 발사 리듬 위에 얹히는 국악 타격
    if (shotCount % 8 === 0) { tone({ freq: 70, to: 32, gain: 0.55, dur: 0.28 }); noiseBurst({ freq: 140, q: 1.5, gain: 0.35, dur: 0.18, type: 'lowpass' }); }
  }
  let lastFlesh = 0, lastStone = 0;
  function hitFlesh() { if (ctx && ctx.currentTime - lastFlesh > 0.07) { lastFlesh = ctx.currentTime; noiseBurst({ freq: 400 + Math.random() * 300, q: 1.0, gain: 0.12, dur: 0.07, type: 'lowpass' }); } }
  function hitStone() { if (ctx && ctx.currentTime - lastStone > 0.07) { lastStone = ctx.currentTime; noiseBurst({ freq: 2500 + Math.random() * 2000, q: 2.5, gain: 0.08, dur: 0.04 }); } }
  function collapse(big = 1) { if (!ctx) return; noiseBurst({ freq: 120, q: 0.8, gain: 0.5 * big, dur: 0.9 * big, type: 'lowpass', rate: 0.6 }); tone({ freq: 50, to: 25, gain: 0.5 * big, dur: 0.7 }); }
  function thunder() { if (!ctx) return; noiseBurst({ freq: 200, q: 0.5, gain: 0.35, dur: 1.6, type: 'lowpass', rate: 0.5 }); }
  function overheat() { if (!ctx) return; noiseBurst({ freq: 3000, q: 1.2, gain: 0.25, dur: 1.4, type: 'highpass' }); }

  return { start, started, setSpin, setGroan, setFiring, shot, hitFlesh, hitStone, collapse, thunder, overheat };
}
