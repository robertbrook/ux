const ADVANCES = [0x80000, 0x879c8, 0x8facd, 0x9837f, 0xa1451, 0xaadc1, 0xb504f, 0xbfc88, 0xcb2ff, 0xd7450, 0xe411f, 0xf1a1c];
export function voiceParameters({ sample, pitch, adsr, detune = 0 }) {
  const note = pitch & 127;
  const advance = Math.floor(ADVANCES[note % 12] * 2 ** (detune / (256 * 12))) >>> (8 - Math.floor(note / 12));
  const period = sample.length <= 256 ? Math.floor(65536 * 337 / 2 / sample.length) : 65536;
  const rate = advance / period;
  const stages = [adsr >> 12, adsr >> 8 & 15, adsr >> 4 & 15, adsr & 15].map(n => n / 15);
  const loop = !(pitch & 128);
  const duration = Math.min(adsr ? stages.reduce((a, b) => a + b, 0) : Infinity, loop ? Infinity : sample.length / (44100 * rate));
  return { rate, stages, loop, duration };
}
function levelAt(time, stages, adsr) {
  if (!adsr) return 1;
  const [a, d, s, r] = stages;
  if (time < a) return time / a;
  if (time < a + d) return 1 - .5 * (time - a) / d;
  if (time < a + d + s) return .5;
  return r ? Math.max(0, .5 * (1 - (time - a - d - s) / r)) : 0;
}
export class AudioEngine {
  constructor(send) { this.send = send; this.voices = new Map(); this.enabled = false; }
  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain(); this.master.connect(this.context.destination);
    }
    await this.context.resume(); this.master.gain.value = 1; this.enabled = true;
  }
  disable() { this.enabled = false; if (this.master) this.master.gain.value = 0; }
  stopVoice(voice) {
    clearInterval(voice.timer); clearTimeout(voice.endTimer);
    if (voice.source) { voice.source.onended = null; voice.source.stop(); }
  }
  stop() { for (const voice of this.voices.values()) this.stopVoice(voice); this.voices.clear(); }
  play(event) {
    const old = this.voices.get(event.channel);
    if (old) { this.stopVoice(old); this.voices.delete(event.channel); }
    const { sample, pitch, volume, adsr, channel } = event;
    this.send({ type: 'audio-state', channel, state: { position: 0, level: 0 } });
    if (!sample.length || (pitch & 127) >= 108) return;
    const { rate, stages, loop, duration } = voiceParameters(event);
    const voice = { source: null, timer: null, endTimer: null, start: performance.now() };
    const finish = () => {
      if (this.voices.get(channel) !== voice) return;
      this.stopVoice(voice); this.voices.delete(channel);
      this.send({ type: 'audio-state', channel, state: { position: 0, level: 0 } });
      this.send({ type: 'audio-end', channel });
    };
    if (this.enabled && this.context) {
      const ctx = this.context, buffer = ctx.createBuffer(1, sample.length, 44100);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < sample.length; i++) output[i] = (sample[i] - 128) / 128;
      const source = ctx.createBufferSource(), envelope = ctx.createGain(), merger = ctx.createChannelMerger(2);
      const left = ctx.createGain(), right = ctx.createGain();
      source.buffer = buffer; source.loop = loop; source.playbackRate.value = rate;
      left.gain.value = (volume >> 4) / 15 * .3; right.gain.value = (volume & 15) / 15 * .3;
      source.connect(envelope); envelope.connect(left); envelope.connect(right);
      left.connect(merger, 0, 0); right.connect(merger, 0, 1); merger.connect(this.master);
      const now = ctx.currentTime, [a, d, s, r] = stages;
      if (adsr) {
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.linearRampToValueAtTime(1, now + a);
        envelope.gain.linearRampToValueAtTime(.5, now + a + d);
        envelope.gain.setValueAtTime(.5, now + a + d + s);
        envelope.gain.linearRampToValueAtTime(0, now + a + d + s + r);
      } else envelope.gain.value = 1;
      voice.source = source; source.onended = finish; source.start();
      if (Number.isFinite(duration)) source.stop(now + duration);
    }
    // Keep device clocks and completion vectors alive even when output is muted.
    voice.timer = setInterval(() => {
      const elapsed = (performance.now() - voice.start) / 1000;
      const level = levelAt(elapsed, stages, adsr);
      const vu = Math.min(15, Math.ceil((volume >> 4) * level)) << 4 | Math.min(15, Math.ceil((volume & 15) * level));
      this.send({ type: 'audio-state', channel, state: { position: Math.floor(elapsed * 44100 * rate) % sample.length, level: vu } });
    }, 40);
    if (Number.isFinite(duration)) voice.endTimer = setTimeout(finish, duration * 1000 + 1);
    this.voices.set(channel, voice);
  }
}
