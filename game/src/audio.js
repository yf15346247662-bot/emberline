// All sound is synthesised with WebAudio: no audio files, no network, nothing to
// download. Each effect is a short burst of filtered noise or an oscillator sweep.
export function createAudio() {
  let ctx = null;
  let master = null;
  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }
  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  function burst({ duration = 0.12, freq = 1800, type = 'lowpass', gain = 0.9, slideTo = null }) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(amp).connect(master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }
  function tone({ freq = 440, to = null, duration = 0.12, type = 'sine', gain = 0.5 }) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }
  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(kind) {
      if (kind === 'sniper') { burst({ duration: 0.28, freq: 900, slideTo: 120, gain: 1 }); tone({ freq: 160, to: 50, duration: 0.22, type: 'triangle', gain: 0.7 }); }
      else if (kind === 'smg') burst({ duration: 0.07, freq: 2600, slideTo: 500, gain: 0.6 });
      else if (kind === 'pistol') burst({ duration: 0.09, freq: 2200, slideTo: 400, gain: 0.7 });
      else burst({ duration: 0.13, freq: 1500, slideTo: 220, gain: 0.9 });
    },
    enemyShot() { burst({ duration: 0.1, freq: 1100, slideTo: 200, gain: 0.35 }); },
    dry() { tone({ freq: 1400, duration: 0.03, type: 'square', gain: 0.25 }); },
    reload() { tone({ freq: 900, duration: 0.05, type: 'square', gain: 0.25 }); setTimeout(() => tone({ freq: 600, duration: 0.05, type: 'square', gain: 0.25 }), 140); },
    hit() { tone({ freq: 1900, duration: 0.05, type: 'square', gain: 0.35 }); },
    kill() { tone({ freq: 660, duration: 0.09, type: 'sine', gain: 0.5 }); setTimeout(() => tone({ freq: 990, duration: 0.14, type: 'sine', gain: 0.5 }), 90); },
    hurt() { tone({ freq: 220, to: 110, duration: 0.18, type: 'sawtooth', gain: 0.4 }); },
    plantTick() { tone({ freq: 1200, duration: 0.06, type: 'square', gain: 0.3 }); },
    planted() { tone({ freq: 880, duration: 0.12, type: 'sine', gain: 0.5 }); setTimeout(() => tone({ freq: 1170, duration: 0.18, type: 'sine', gain: 0.5 }), 130); },
    defuseTick() { tone({ freq: 1500, duration: 0.05, type: 'square', gain: 0.3 }); },
    explosion() {
      burst({ duration: 0.7, freq: 500, slideTo: 60, gain: 1 });
      tone({ freq: 90, to: 28, duration: 0.65, type: 'sine', gain: 0.9 });
    },
    buy() { tone({ freq: 740, duration: 0.07, type: 'sine', gain: 0.4 }); setTimeout(() => tone({ freq: 1108, duration: 0.1, type: 'sine', gain: 0.4 }), 80); },
    denied() { tone({ freq: 220, duration: 0.12, type: 'square', gain: 0.3 }); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone({ freq: f, duration: 0.16, type: 'sine', gain: 0.45 }), i * 120)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone({ freq: f, duration: 0.18, type: 'sine', gain: 0.4 }), i * 130)); },
    step() { burst({ duration: 0.04, freq: 500, gain: 0.12 }); },
  };
}
