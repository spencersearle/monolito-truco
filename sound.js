/* ============================================================
   MONOLITO · sound.js
   Tiny WebAudio synth for game sounds — no audio files, so the
   PWA/app payload stays lean and everything works offline.
   The context is created/resumed on the first user gesture
   (required on iOS), and the mute choice persists.
   ============================================================ */

(() => {
  let ctx = null;
  let master = null;
  let muted = localStorage.getItem("monolito-muted") === "1";

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  // iOS/Safari only lets audio start inside a user gesture — keep priming
  // on taps so the context also recovers after the app is backgrounded
  window.addEventListener("pointerdown", () => { if (!muted) ensure(); },
    { passive: true, capture: true });

  function tone(freq, { type = "sine", dur = 0.15, vol = 0.18, delay = 0, slide = 0 } = {}) {
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /* a short burst of band-passed noise: card flicks and shuffles */
  function swish({ dur = 0.07, vol = 0.3, delay = 0, freq = 2400 } = {}) {
    const t0 = ctx.currentTime + delay;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t0);
  }

  const FX = {
    deal:  () => { for (let i = 0; i < 3; i++) swish({ dur: 0.06, vol: 0.22, freq: 2100, delay: i * 0.09 }); },
    card:  () => { swish({ dur: 0.055, vol: 0.4, freq: 2600 }); tone(170, { type: "triangle", dur: 0.07, vol: 0.12 }); },
    call:  () => { tone(392, { type: "square", dur: 0.11, vol: 0.09 }); tone(523, { type: "square", dur: 0.17, vol: 0.09, delay: 0.09 }); },
    trick: () => { tone(523, { dur: 0.09, vol: 0.13 }); tone(784, { dur: 0.13, vol: 0.13, delay: 0.07 }); },
    chat:  () => tone(880, { dur: 0.07, vol: 0.08 }),
    win:   () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.16, vol: 0.14, delay: i * 0.11 })),
    lose:  () => [392, 330, 262, 196].forEach((f, i) => tone(f, { type: "triangle", dur: 0.18, vol: 0.12, delay: i * 0.12 })),
  };

  window.Sound = {
    muted: () => muted,
    toggle() {
      muted = !muted;
      localStorage.setItem("monolito-muted", muted ? "1" : "0");
      if (!muted) ensure();
      return muted;
    },
    play(name) {
      if (muted || !FX[name] || !ensure()) return;
      try { FX[name](); } catch (e) { /* audio is never worth crashing over */ }
    },
  };
})();
