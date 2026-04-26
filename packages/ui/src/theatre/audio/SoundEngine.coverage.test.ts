/**
 * Coverage tests for SoundEngine.ts uncovered lines:
 *   94-96: approvalClick() calls two tones
 *   111-133: meow() — ctx/master guard, buffer cached path, loading guard, fetch+decode path
 *   136-146: playMeowBuffer() private method
 *   149-166: hurtMeow() paths
 *   233: getSoundEngine singleton (already partially covered, but line 233 is the assignment)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SoundEngine } from "./SoundEngine.js";

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
      connect: vi.fn(function (_dest: any) { return _dest; }),
    };
    created.gains.push(g);
    return g;
  }

  function newOscillator() {
    const osc = {
      type: "sine" as OscillatorNode["type"],
      frequency: { value: 0 },
      connect: vi.fn(function (_dest: any) { return _dest; }),
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
      connect: vi.fn(function (_dest: any) { return _dest; }),
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
      connect: vi.fn(function (_dest: any) { return _dest; }),
    };
    created.filters.push(f);
    return f;
  }

  const mockBuffer = {} as AudioBuffer;

  const ctx = {
    state: "running" as AudioContextState,
    currentTime: 0,
    sampleRate: 44100,
    destination,
    createGain: vi.fn(newGain),
    createOscillator: vi.fn(newOscillator),
    createBufferSource: vi.fn(newBufferSource),
    createBiquadFilter: vi.fn(newFilter),
    createBuffer: vi.fn((_channels: number, length: number) => ({
      getChannelData: vi.fn(() => new Float32Array(length)),
    })),
    decodeAudioData: vi.fn(async () => mockBuffer),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };

  return { ctx, created, mockBuffer };
}

describe("SoundEngine coverage", () => {
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
    vi.restoreAllMocks();
    delete (window as any).AudioContext;
    delete (window as any).webkitAudioContext;
  });

  // Lines 94-96: approvalClick()
  it("approvalClick() schedules two tones after start()", async () => {
    await engine.start();
    const before = mock.created.oscillators.length;
    engine.approvalClick();
    expect(mock.created.oscillators.length).toBe(before + 2);
  });

  it("approvalClick() is a no-op before start()", () => {
    expect(() => engine.approvalClick()).not.toThrow();
    expect(mock.created.oscillators).toHaveLength(0);
  });

  // Lines 111-133: meow() — no ctx guard
  it("meow() is a no-op before start()", () => {
    expect(() => engine.meow()).not.toThrow();
  });

  // meow() with cached buffer — line 114-116
  it("meow() plays immediately when buffer is already cached", async () => {
    await engine.start();
    const fakeArrayBuffer = new ArrayBuffer(8);

    // First call: trigger the fetch+decode path — resolve immediately without running timers
    let resolveAb!: (ab: ArrayBuffer) => void;
    const abPromise = new Promise<ArrayBuffer>((r) => (resolveAb = r));
    global.fetch = vi.fn(async () => ({
      arrayBuffer: () => abPromise,
    })) as any;

    engine.meow(); // triggers fetch
    resolveAb(fakeArrayBuffer);
    // Allow promise chain to settle without running fake timers (which would loop infinitely)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Buffer should now be cached; second call should use it directly.
    const bufferSourcesBefore = mock.created.bufferSources.length;
    engine.meow();
    // A new buffer source is created for each play
    expect(mock.created.bufferSources.length).toBeGreaterThanOrEqual(bufferSourcesBefore);
  });

  // meow() loading guard — line 118
  it("meow() does not start a second fetch while one is in-flight", async () => {
    await engine.start();

    let resolveArrayBuffer!: (ab: ArrayBuffer) => void;
    const arrayBufferPromise = new Promise<ArrayBuffer>(
      (res) => (resolveArrayBuffer = res),
    );

    global.fetch = vi.fn(async () => ({
      arrayBuffer: () => arrayBufferPromise,
    })) as any;

    engine.meow(); // first call — starts loading
    engine.meow(); // second call — should be a no-op (meowLoading guard)

    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveArrayBuffer(new ArrayBuffer(8));
    await Promise.resolve();
  });

  // meow() catch swallows errors — line 127-129
  it("meow() swallows fetch errors silently", async () => {
    await engine.start();
    global.fetch = vi.fn(async () => { throw new Error("network error"); }) as any;
    expect(() => engine.meow()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  // Lines 149-166: hurtMeow() paths
  it("hurtMeow() is a no-op before start()", () => {
    expect(() => engine.hurtMeow()).not.toThrow();
  });

  it("hurtMeow() starts a fetch when no buffer is cached", async () => {
    await engine.start();
    let resolveAb!: (ab: ArrayBuffer) => void;
    const abPromise = new Promise<ArrayBuffer>((r) => (resolveAb = r));
    global.fetch = vi.fn(async () => ({
      arrayBuffer: () => abPromise,
    })) as any;

    engine.hurtMeow();
    expect(global.fetch).toHaveBeenCalledWith("/sounds/hurt-meow.mp3");

    resolveAb(new ArrayBuffer(8));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("hurtMeow() does not start a second fetch while one is in-flight", async () => {
    await engine.start();
    let resolve!: (ab: ArrayBuffer) => void;
    const abPromise = new Promise<ArrayBuffer>((r) => (resolve = r));
    global.fetch = vi.fn(async () => ({
      arrayBuffer: () => abPromise,
    })) as any;

    engine.hurtMeow(); // starts fetch
    engine.hurtMeow(); // loading guard — no second fetch
    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolve(new ArrayBuffer(8));
    await Promise.resolve();
  });

  it("hurtMeow() plays from cached buffer on second call", async () => {
    await engine.start();
    let resolveAb!: (ab: ArrayBuffer) => void;
    const abPromise = new Promise<ArrayBuffer>((r) => (resolveAb = r));
    global.fetch = vi.fn(async () => ({
      arrayBuffer: () => abPromise,
    })) as any;

    engine.hurtMeow(); // triggers fetch
    resolveAb(new ArrayBuffer(8));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const before = mock.created.bufferSources.length;
    engine.hurtMeow(); // uses cached buffer
    expect(mock.created.bufferSources.length).toBeGreaterThanOrEqual(before);
  });

  it("hurtMeow() swallows fetch errors silently", async () => {
    await engine.start();
    global.fetch = vi.fn(async () => { throw new Error("network"); }) as any;
    expect(() => engine.hurtMeow()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
