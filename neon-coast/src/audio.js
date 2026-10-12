export class AudioEngine {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.tick = 0;
  }
  start() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
      this.engine = this.ctx.createOscillator();
      this.engine.type = "sawtooth";
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 210;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.12;
      this.engine
        .connect(this.filter)
        .connect(this.engineGain)
        .connect(this.master);
      this.engine.start();
      this.timer = setInterval(() => this.music(), 190);
    }
    this.enabled = true;
    this.ctx.resume();
    this.master.gain.setTargetAtTime(0.18, this.ctx.currentTime, 0.12);
  }
  toggle() {
    if (!this.enabled) {
      this.start();
      return true;
    }
    this.enabled = false;
    if (this.ctx)
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    return false;
  }
  update(speed, driving) {
    if (!this.ctx) return;
    this.engine.frequency.setTargetAtTime(
      35 + Math.abs(speed) * 3,
      this.ctx.currentTime,
      0.06,
    );
    this.engineGain.gain.setTargetAtTime(
      driving ? 0.09 : 0,
      this.ctx.currentTime,
      0.2,
    );
  }
  tone(freq, duration = 0.12, gain = 0.16, type = "sine") {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration);
  }
  music() {
    if (!this.enabled) return;
    const bass = [110, 110, 130.81, 110, 98, 98, 130.81, 146.83];
    this.tone(bass[Math.floor(this.tick / 4) % 8], 0.3, 0.055, "triangle");
    if (this.tick % 2 === 0)
      this.tone(
        [440, 523.25, 659.25, 587.33, 523.25, 440, 392, 523.25][
          (this.tick / 2) % 8
        ],
        0.35,
        0.018,
      );
    this.tick++;
  }
  success() {
    [523.25, 659.25, 783.99].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.4, 0.24), i * 100),
    );
  }
}
