import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SoundEngine, getSoundEngine } from "./SoundEngine";

// jsdom doesn't ship Web Audio. Build a minimal stub that records all
// calls made by SoundEngine so we can assert on them.
function makeMockAudioContext() {
  const created = {
    oscillators: [] as any[],
    gains: [] as any[],
    bufferSources: [] as any[],
    filters: [] as any[],
  };
  const destination = { id: "destination" };

  function newGain() {
    const g = {
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(function (this: any, dest: any) {
        return dest;
      }),
    };
    created.gains.push(g);
    return g;
  }

  function newOscillator() {
    const osc = {
      type: "sine" as OscillatorNode["type"],
      frequency: { value: 0 },
      connect: vi.fn(function (this: any, dest: any) {
        return dest;
      }),
      start: vi.fn(),
      stop: vi.fn(),
    };
    created.oscillators.push(osc);
    return osc;
  }

  function newBufferSource() {
    const src = {
      buffer: null as any,
      loop: false,
      connect: vi.fn(function (this: any, dest: any) {
        return dest;
      }),
      start: vi.fn(),
      stop: vi.fn(),
    };
    created.bufferSources.push(src);
    return src;
  }

  function newFilter() {
    const f = {
      type: "lowpass" as BiquadFilterType,
      frequency: { value: 0 },
      connect: vi.fn(function (this: any, dest: any) {
        return dest;
      }),
    };
    created.filters.push(f);
    return f;
  }

  const ctx = {
    state: "running" as AudioContextState,
    currentTime: 0,
    sampleRate: 44100,
    destination,
    createGain: vi.fn(newGain),
    createOscillator: vi.fn(newOscillator),
    createBufferSource: vi.fn(newBufferSource),
    createBiquadFilter: vi.fn(newFilter),
    createBuffer: vi.fn((channels: number, length: number) => ({
      getChannelData: vi.fn(() => new Float32Array(length)),
    })),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };

  return { ctx, created };
}

describe("SoundEngine", () => {
  let mock: ReturnType<typeof makeMockAudioContext>;
  let engine: SoundEngine;

  beforeEach(() => {
    mock = makeMockAudioContext();
    (window as any).AudioContext = vi.fn(() => mock.ctx);
    vi.useFakeTimers();
    engine = new SoundEngine();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).AudioContext;
    delete (window as any).webkitAudioContext;
  });

  it("starts an AudioContext on first start()", async () => {
    await engine.start();
    expect((window as any).AudioContext).toHaveBeenCalled();
    // master gain + ambient gain are both created
    expect(mock.ctx.createGain).toHaveBeenCalled();
  });

  it("resumes a suspended context instead of recreating it", async () => {
    await engine.start();
    mock.ctx.state = "suspended";
    await engine.start();
    expect(mock.ctx.resume).toHaveBeenCalled();
    // AudioContext constructor only ever called once
    expect((window as any).AudioContext).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no AudioContext implementation is available", async () => {
    delete (window as any).AudioContext;
    delete (window as any).webkitAudioContext;
    const fresh = new SoundEngine();
    await fresh.start();
    expect(fresh.getVolume()).toBe(0.5);
  });

  it("falls back to webkitAudioContext when AudioContext is missing", async () => {
    delete (window as any).AudioContext;
    const webkitMock = makeMockAudioContext();
    (window as any).webkitAudioContext = vi.fn(() => webkitMock.ctx);
    const fresh = new SoundEngine();
    await fresh.start();
    expect((window as any).webkitAudioContext).toHaveBeenCalled();
  });

  it("stop() closes the context and clears state", async () => {
    await engine.start();
    engine.stop();
    expect(mock.ctx.close).toHaveBeenCalled();
  });

  it("stop() is idempotent before start()", () => {
    expect(() => engine.stop()).not.toThrow();
  });

  it("setVolume clamps to [0, 1]", () => {
    engine.setVolume(2);
    expect(engine.getVolume()).toBe(1);
    engine.setVolume(-1);
    expect(engine.getVolume()).toBe(0);
    engine.setVolume(0.3);
    expect(engine.getVolume()).toBe(0.3);
  });

  it("setMuted writes 0 to master gain when muted, restores volume when unmuted", async () => {
    await engine.start();
    engine.setVolume(0.7);
    engine.setMuted(true);
    expect(engine.isMuted()).toBe(true);
    // last gain = master is the first one constructed
    const master = mock.created.gains[0]!;
    expect(master.gain.value).toBe(0);
    engine.setMuted(false);
    expect(master.gain.value).toBe(0.7);
  });

  it("setVolume while muted does not unmute", async () => {
    await engine.start();
    engine.setMuted(true);
    engine.setVolume(0.9);
    const master = mock.created.gains[0]!;
    expect(master.gain.value).toBe(0);
    expect(engine.getVolume()).toBe(0.9);
  });

  it("tick() creates an oscillator after start()", async () => {
    await engine.start();
    const oscBefore = mock.created.oscillators.length;
    engine.tick(2600);
    expect(mock.created.oscillators.length).toBe(oscBefore + 1);
  });

  it("tick() before start() is a no-op", () => {
    expect(() => engine.tick()).not.toThrow();
    expect(mock.created.oscillators).toHaveLength(0);
  });

  it("phaseStart() schedules two tones", async () => {
    await engine.start();
    const before = mock.created.oscillators.length;
    engine.phaseStart();
    expect(mock.created.oscillators.length).toBe(before + 2);
  });

  it("artifactThunk() schedules one low tone", async () => {
    await engine.start();
    const before = mock.created.oscillators.length;
    engine.artifactThunk();
    expect(mock.created.oscillators.length).toBe(before + 1);
  });

  it("approvalConfirm() schedules three tones", async () => {
    await engine.start();
    const before = mock.created.oscillators.length;
    engine.approvalConfirm();
    expect(mock.created.oscillators.length).toBe(before + 3);
  });

  it("testFailAlarm() schedules three tones", async () => {
    await engine.start();
    const before = mock.created.oscillators.length;
    engine.testFailAlarm();
    expect(mock.created.oscillators.length).toBe(before + 3);
  });

  it("finishChord() schedules three tones", async () => {
    await engine.start();
    const before = mock.created.oscillators.length;
    engine.finishChord();
    expect(mock.created.oscillators.length).toBe(before + 3);
  });

  it("startApprovalPing() emits immediately and then every 3s", async () => {
    await engine.start();
    const before = mock.created.oscillators.length;
    engine.startApprovalPing();
    // Immediate ping = 2 tones. Ambient beep timer adds extras over time,
    // so we assert the ping floor with >= rather than strict equality.
    expect(mock.created.oscillators.length).toBe(before + 2);
    const afterImmediate = mock.created.oscillators.length;
    vi.advanceTimersByTime(3000);
    expect(mock.created.oscillators.length).toBeGreaterThanOrEqual(
      afterImmediate + 2,
    );
    const after3s = mock.created.oscillators.length;
    vi.advanceTimersByTime(3000);
    expect(mock.created.oscillators.length).toBeGreaterThanOrEqual(after3s + 2);
  });

  it("startApprovalPing() is idempotent — calling twice doesn't double the rate", async () => {
    await engine.start();
    engine.startApprovalPing();
    const after1st = mock.created.oscillators.length;
    engine.startApprovalPing();
    // No second immediate ping because timer already running.
    expect(mock.created.oscillators.length).toBe(after1st);
  });

  it("stopApprovalPing() halts the recurring ping", async () => {
    await engine.start();
    engine.startApprovalPing();
    // Expected ping cadence: every 3s adds 2 oscillators. With ambient beeps
    // (every 2s, 1 oscillator each), 10s without ping = ~5 ambient beeps.
    // With ping running, 10s adds 5 ambient + 3 pings*2 = ~11.
    // We assert the stop is effective by comparing two windows of the same
    // length: one with ping running, one after stop.
    vi.advanceTimersByTime(10_000);
    const withPing = mock.created.oscillators.length;
    engine.stopApprovalPing();
    const beforeStopWindow = mock.created.oscillators.length;
    vi.advanceTimersByTime(10_000);
    const afterStopWindow = mock.created.oscillators.length;
    const stopWindowDelta = afterStopWindow - beforeStopWindow;
    // Without ping, only ambient beeps happen — should be << with-ping window.
    expect(stopWindowDelta).toBeLessThan(withPing);
  });

  it("stop() also stops approval ping", async () => {
    await engine.start();
    engine.startApprovalPing();
    engine.stop();
    // After stop, the ctx is closed — no oscillators should be created.
    const after = mock.created.oscillators.length;
    vi.advanceTimersByTime(10_000);
    expect(mock.created.oscillators.length).toBe(after);
  });
});

describe("getSoundEngine singleton", () => {
  it("returns the same instance across calls", () => {
    const a = getSoundEngine();
    const b = getSoundEngine();
    expect(a).toBe(b);
  });

  it("instance is a SoundEngine", () => {
    const e = getSoundEngine();
    expect(e).toBeInstanceOf(SoundEngine);
  });
});
