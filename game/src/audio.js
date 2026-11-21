// Every sound in the game, made with WebAudio — no audio files, nothing to
// download. Footsteps (yours and the guards'), the rising sting when a guard
// spots you, the chime of a stolen ledger, the ring of a thrown coin, and the
// win and lose phrases. Sound starts on the first key or click, as browsers
// require, and M mutes it.

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    noiseBuffer: null,
    muted: false,
  };

  /** Create the audio context on the first user gesture; browsers insist. */
  function ensure() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') void audio.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctor();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
      const length = Math.floor(audio.ctx.sampleRate * 0.2);
      audio.noiseBuffer = audio.ctx.createBuffer(1, length, audio.ctx.sampleRate);
      const data = audio.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      audio.ctx = null;
    }
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = null, pan = 0) {
    if (!audio.ctx || audio.muted) return;
    const t0 = audio.ctx.currentTime + when;
    const osc = audio.ctx.createOscillator();
    const amp = audio.ctx.createGain();
    const panner = audio.ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    osc.connect(amp);
    amp.connect(panner);
    panner.connect(audio.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, gain, filterFreq, pan = 0) {
    if (!audio.ctx || audio.muted) return;
    const t0 = audio.ctx.currentTime;
    const source = audio.ctx.createBufferSource();
    source.buffer = audio.noiseBuffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const amp = audio.ctx.createGain();
    const panner = audio.ctx.createStereoPanner();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter);
    filter.connect(amp);
    amp.connect(panner);
    panner.connect(audio.master);
    source.start(t0);
    source.stop(t0 + dur + 0.02);
  }

  return {
    ensure,
    get muted() {
      return audio.muted;
    },
    toggleMute() {
      audio.muted = !audio.muted;
      return audio.muted;
    },

    /** Your own step: a soft tap when walking, a heavier one sprinting. */
    footstep(mode, foot) {
      ensure();
      const freq = mode === 'sprint' ? 150 : 110;
      tone(freq + foot * 25, 0.07, 'triangle', mode === 'sprint' ? 0.22 : 0.12);
      noiseBurst(0.05, mode === 'sprint' ? 0.1 : 0.04, 500);
    },

    /** A guard's step, panned by which side of you it is on and quieter far away. */
    guardStep(guard, distanceToPlayer, pan) {
      ensure();
      const closeness = Math.max(0, 1 - distanceToPlayer / 340);
      if (closeness <= 0.02) return;
      tone(95, 0.08, 'triangle', 0.16 * closeness, 0, null, pan);
    },

    /** A guard noticed something: one short, questioning note. */
    suspicious() {
      ensure();
      tone(660, 0.12, 'sine', 0.16);
    },

    /** A guard spotted you: two rising notes, the alarm going up. */
    alerted() {
      ensure();
      tone(220, 0.14, 'sawtooth', 0.2);
      tone(330, 0.22, 'sawtooth', 0.2, 0.13);
    },

    /** A ledger stolen: a bright two-note chime, higher with each one. */
    pickup(count) {
      ensure();
      tone(880, 0.12, 'sine', 0.18);
      tone(880 + count * 160, 0.2, 'sine', 0.18, 0.1);
    },

    /** The coin leaving your hand. */
    throwCoin() {
      ensure();
      tone(1400, 0.06, 'triangle', 0.1, 0, 900);
    },

    /** The coin ringing on the gallery floor. */
    coinLand() {
      ensure();
      tone(2400, 0.3, 'triangle', 0.14, 0, 1800);
      tone(3200, 0.18, 'sine', 0.08, 0.02);
    },

    /** The getaway: a short rising arpeggio. */
    win() {
      ensure();
      [523, 659, 784, 1047].forEach((freq, i) => tone(freq, 0.25, 'sine', 0.18, i * 0.11));
    },

    /** Caught: a low falling drone. */
    lose() {
      ensure();
      tone(180, 0.7, 'sawtooth', 0.2, 0, 60);
    },
  };
}
