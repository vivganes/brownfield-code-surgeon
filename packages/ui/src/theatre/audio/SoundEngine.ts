type OscType = OscillatorNode["type"];

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: { stop: () => void } | null = null;
  private approvalTimer: number | null = null;
  private muted = false;
  private volume = 0.5;

  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.startAmbient();
  }

  stop(): void {
    this.stopApprovalPing();
    this.ambient?.stop();
    this.ambient = null;
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && !this.muted) this.master.gain.value = this.volume;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  isMuted(): boolean {
    return this.muted;
  }

  getVolume(): number {
    return this.volume;
  }

  tick(freq = 2600): void {
    this.tone({ freq, type: "triangle", dur: 0.045, gain: 0.09 });
  }

  phaseStart(): void {
    this.tone({ freq: 523.25, type: "sine", dur: 0.18, delay: 0 });
    this.tone({ freq: 783.99, type: "sine", dur: 0.22, delay: 0.12 });
  }

  artifactThunk(): void {
    this.tone({ freq: 110, type: "sine", dur: 0.14, gain: 0.7 });
  }

  startApprovalPing(): void {
    if (this.approvalTimer != null) return;
    const ping = () => {
      this.tone({ freq: 880, type: "triangle", dur: 0.1, gain: 0.5 });
      this.tone({ freq: 1320, type: "triangle", dur: 0.1, gain: 0.3, delay: 0.12 });
    };
    ping();
    this.approvalTimer = window.setInterval(ping, 3000);
  }

  stopApprovalPing(): void {
    if (this.approvalTimer != null) {
      window.clearInterval(this.approvalTimer);
      this.approvalTimer = null;
    }
  }

  approvalConfirm(): void {
    this.tone({ freq: 523.25, type: "sine", dur: 0.12 });
    this.tone({ freq: 659.25, type: "sine", dur: 0.14, delay: 0.08 });
    this.tone({ freq: 783.99, type: "sine", dur: 0.2, delay: 0.18 });
  }

  testFailAlarm(): void {
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: 880, type: "sawtooth", dur: 0.15, gain: 0.6, delay: i * 0.2 });
    }
  }

  finishChord(): void {
    this.tone({ freq: 659.25, type: "sine", dur: 0.8 });
    this.tone({ freq: 523.25, type: "sine", dur: 0.8 });
    this.tone({ freq: 392.0, type: "sine", dur: 0.9 });
  }

  private tone({
    freq,
    type,
    dur,
    gain = 0.4,
    delay = 0,
  }: {
    freq: number;
    type: OscType;
    dur: number;
    gain?: number;
    delay?: number;
  }): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private startAmbient(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    // Pink-ish noise via filtered white noise buffer.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.25;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 180;
    const ng = ctx.createGain();
    ng.gain.value = 0.18;
    src.connect(filt).connect(ng).connect(master);
    src.start();

    // Slow resting beep ~every 2s.
    const beep = () => this.tone({ freq: 660, type: "sine", dur: 0.05, gain: 0.08 });
    const beepTimer = window.setInterval(beep, 2000);

    this.ambient = {
      stop: () => {
        try {
          src.stop();
        } catch {
          /* noop */
        }
        window.clearInterval(beepTimer);
      },
    };
  }
}

let singleton: SoundEngine | null = null;
export function getSoundEngine(): SoundEngine {
  if (!singleton) singleton = new SoundEngine();
  return singleton;
}
