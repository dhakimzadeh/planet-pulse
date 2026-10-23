/**
 * First pass at the generative score, all Web Audio, no samples.
 *
 *  - Flight density  -> a slow, filtered pad that drifts through four voicings
 *  - Quakes ≥ M2.5   -> sub-bass hits scaled by magnitude, panned by longitude
 *  - Small quakes    -> soft pentatonic bells, pitched by latitude
 *  - Event cinema    -> a long low swell
 *
 * Browsers only allow audio after a user gesture, so `enable()` must be
 * called from a click or key handler.
 */

const note = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Am9 → Fmaj7 → Cmaj9 → Gadd9: open, unresolved, easy to leave on all day.
const VOICINGS = [
  [45, 52, 55, 59, 60],
  [41, 48, 52, 55, 57],
  [48, 55, 59, 62, 64],
  [43, 50, 57, 59, 62],
].map((v) => v.map(note));
const CHORD_MS = 42_000;

// A minor pentatonic, A4 to A6.
const BELLS = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93].map(note);

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private padGain!: GainNode;
  private padFilter!: BiquadFilterNode;
  private padOscs: OscillatorNode[][] = [];
  private noise!: AudioBuffer;
  private chord = 0;
  private chordTimer = 0;
  private lastSmall = 0;
  private lastBig = 0;
  enabled = false;

  async enable() {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    await ctx.resume();
    this.enabled = true;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2);
  }

  disable() {
    if (!this.ctx) return;
    this.enabled = false;
    const ctx = this.ctx;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => !this.enabled && ctx.suspend(), 2500);
  }

  /** Airborne aircraft in view: opens the pad's filter and lifts its level. */
  setFlightDensity(airborne: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = Math.min(1, Math.log10(airborne + 1) / 3); // ~1000 aircraft = full
    this.padGain.gain.setTargetAtTime(0.035 + 0.075 * k, t, 6);
    this.padFilter.frequency.setTargetAtTime(320 + 1100 * k, t, 6);
  }

  /** pan: -1 (left) .. 1 (right); lat picks the bell pitch for small quakes. */
  quake(mag: number, pan: number, lat: number) {
    if (!this.ctx || !this.enabled) return;
    const now = performance.now();
    if (mag < 2.5) {
      if (now - this.lastSmall < 180) return; // keep the intro replay from turning into rain
      this.lastSmall = now;
      const i = Math.round(((lat + 90) / 180) * (BELLS.length - 1));
      this.bell(BELLS[Math.max(0, Math.min(BELLS.length - 1, i))], 0.025 + mag * 0.008, pan);
    } else {
      if (now - this.lastBig < 120) return;
      this.lastBig = now;
      this.sub(mag, pan, 1);
    }
  }

  /** The cinema swell: a long, low bloom under the camera dive. */
  cinema(mag: number) {
    if (!this.ctx || !this.enabled) return;
    this.sub(mag + 0.8, 0, 3.2);
    const t = this.ctx.currentTime;
    // Open the pad briefly, like a breath in.
    this.padFilter.frequency.setTargetAtTime(1900, t, 1.5);
    this.padFilter.frequency.setTargetAtTime(700, t + 6, 4);
  }

  // ---------- voices ----------
  private sub(mag: number, pan: number, length: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const m = Math.max(0, Math.min(1, (mag - 2.5) / 5)); // M2.5 → 0, M7.5 → 1
    const dur = (1.4 + m * 2.6) * length;

    const p = new StereoPannerNode(ctx, { pan: pan * 0.7 });
    p.connect(this.master);

    const osc = new OscillatorNode(ctx, { type: 'sine', frequency: 62 - m * 14 });
    osc.frequency.setValueAtTime(62 - m * 14, t);
    osc.frequency.exponentialRampToValueAtTime(30 + (1 - m) * 6, t + Math.min(dur, 1.6 * length));
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 + m * 0.42, t + 0.012 * length + 0.008);
    g.gain.setTargetAtTime(0, t + 0.05 * length, dur / 4);
    osc.connect(g).connect(p);
    osc.start(t);
    osc.stop(t + dur + 1);

    // A soft felt-mallet thump on top so small speakers still hear it.
    const n = new AudioBufferSourceNode(ctx, { buffer: this.noise });
    const f = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 140 + m * 120, Q: 0.7 });
    const ng = new GainNode(ctx, { gain: 0.05 + m * 0.18 });
    ng.gain.setTargetAtTime(0, t + 0.02, 0.12 * length);
    n.connect(f).connect(ng).connect(p);
    const send = new GainNode(ctx, { gain: 0.25 });
    ng.connect(send).connect(this.reverb);
    n.start(t);
    n.stop(t + 1.5 * length);
  }

  private bell(freq: number, level: number, pan: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const p = new StereoPannerNode(ctx, { pan: pan * 0.8 });
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.006);
    g.gain.setTargetAtTime(0, t + 0.01, 0.35);
    for (const [ratio, amp] of [[1, 1], [2.76, 0.22], [5.4, 0.06]] as const) {
      const o = new OscillatorNode(ctx, { type: 'sine', frequency: freq * ratio });
      const og = new GainNode(ctx, { gain: amp });
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 2.5);
    }
    g.connect(p);
    p.connect(this.master);
    const send = new GainNode(ctx, { gain: 1.3 });
    p.connect(send).connect(this.reverb); // bells live mostly in the room
  }

  // ---------- graph ----------
  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;

    const comp = new DynamicsCompressorNode(ctx, { threshold: -18, ratio: 3, attack: 0.02, release: 0.4 });
    comp.connect(ctx.destination);
    this.master = new GainNode(ctx, { gain: 0 });
    this.master.connect(comp);

    this.reverb = new ConvolverNode(ctx, { buffer: impulse(ctx, 5.5, 2.6) });
    const wet = new GainNode(ctx, { gain: 0.5 });
    this.reverb.connect(wet).connect(comp);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // Pad: two slightly detuned oscillators per chord tone into one slow filter.
    this.padFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 500, Q: 0.9 });
    this.padGain = new GainNode(ctx, { gain: 0.035 });
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.master);
    const padSend = new GainNode(ctx, { gain: 0.6 });
    this.padGain.connect(padSend).connect(this.reverb);

    const lfo = new OscillatorNode(ctx, { type: 'sine', frequency: 0.045 });
    const lfoDepth = new GainNode(ctx, { gain: 160 });
    lfo.connect(lfoDepth).connect(this.padFilter.frequency);
    lfo.start();

    VOICINGS[0].forEach((f, i) => {
      const voice = new GainNode(ctx, { gain: i === 0 ? 0.32 : 0.2 });
      voice.connect(this.padFilter);
      const pair = (['triangle', 'sawtooth'] as OscillatorType[]).map((type, j) => {
        const o = new OscillatorNode(ctx, { type, frequency: f, detune: j ? 7 : -5 });
        const og = new GainNode(ctx, { gain: type === 'sawtooth' ? 0.35 : 1 });
        o.connect(og).connect(voice);
        o.start();
        return o;
      });
      this.padOscs.push(pair);
    });

    this.chordTimer = window.setInterval(() => this.nextChord(), CHORD_MS);
  }

  private nextChord() {
    if (!this.ctx || !this.enabled) return;
    this.chord = (this.chord + 1) % VOICINGS.length;
    const t = this.ctx.currentTime;
    VOICINGS[this.chord].forEach((f, i) => {
      // Stagger the voices so the change blooms rather than steps.
      for (const o of this.padOscs[i]) o.frequency.setTargetAtTime(f, t + i * 0.9, 2.5);
    });
  }
}

/** Stereo decaying-noise impulse: a big, soft, dark room. */
function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp = lp * 0.82 + (Math.random() * 2 - 1) * 0.18; // darken the tail
      d[i] = lp * Math.pow(1 - i / len, decay) * 2.2;
    }
  }
  return buf;
}
