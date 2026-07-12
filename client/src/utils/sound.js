// Tiny synthesized sound effects via WebAudio -- no audio assets to load,
// and each effect is a couple of short-lived oscillator/noise nodes, so the
// performance cost is negligible.

let ctx = null;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Browsers suspend audio until a user gesture; shooting/clicking counts,
  // so resuming here just works.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, endFreq = null, duration = 0.1, type = 'square', volume = 0.08, delay = 0 }) {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise({ duration = 0.15, volume = 0.1, lowpass = 1200 }) {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const length = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t0);
}

export const sound = {
  shootPistol() {
    noise({ duration: 0.08, volume: 0.12, lowpass: 2500 });
    tone({ freq: 900, endFreq: 250, duration: 0.07, type: 'square', volume: 0.05 });
  },

  shootShotgun() {
    noise({ duration: 0.25, volume: 0.2, lowpass: 900 });
    tone({ freq: 220, endFreq: 60, duration: 0.2, type: 'sawtooth', volume: 0.08 });
  },

  hit() {
    tone({ freq: 200, endFreq: 90, duration: 0.12, type: 'triangle', volume: 0.12 });
  },

  pickup() {
    tone({ freq: 880, duration: 0.07, type: 'sine', volume: 0.09 });
    tone({ freq: 1320, duration: 0.09, type: 'sine', volume: 0.09, delay: 0.07 });
  },

  buy() {
    tone({ freq: 660, duration: 0.08, type: 'sine', volume: 0.09 });
    tone({ freq: 880, duration: 0.08, type: 'sine', volume: 0.09, delay: 0.08 });
    tone({ freq: 1100, duration: 0.12, type: 'sine', volume: 0.09, delay: 0.16 });
  },

  death() {
    tone({ freq: 320, endFreq: 55, duration: 0.7, type: 'sawtooth', volume: 0.1 });
  }
};
