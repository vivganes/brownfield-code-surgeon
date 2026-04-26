let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function osc(
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  duration: number,
  volume: number,
  startAt = 0,
  endType: "exp" | "lin" = "exp",
): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + startAt;
  const o = c.createOscillator();
  const g = c.createGain();
  o.connect(g);
  g.connect(c.destination);
  o.type = type;
  o.frequency.setValueAtTime(freqStart, t0);
  if (freqEnd !== freqStart) {
    if (endType === "exp") o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
    else o.frequency.linearRampToValueAtTime(freqEnd, t0 + duration);
  }
  g.gain.setValueAtTime(volume, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.start(t0);
  o.stop(t0 + duration + 0.01);
}

/** Modal slides open — ascending 4-note arpeggio */
export function playOpen(): void {
  [440, 554, 659, 880].forEach((f, i) => osc("sine", f, f, 0.18, 0.055, i * 0.065));
}

/** Modal closed / Cancel pressed — descending sweep */
export function playClose(): void {
  osc("sine", 660, 300, 0.2, 0.065);
}

/** Mode card selected — crisp digital tick with a small upward chirp */
export function playSelect(): void {
  osc("square", 700, 1100, 0.09, 0.05);
  osc("sine",   900, 1300, 0.07, 0.03, 0.04);
}

/** Segmented toggle (thinking depth) — short blip */
export function playToggle(): void {
  osc("sine", 520, 780, 0.07, 0.05);
}

/** Checkbox tick — soft click */
export function playCheck(): void {
  osc("triangle", 400, 600, 0.06, 0.04);
}

/** Plan.md ready — three ascending chime tones, low-to-high, purple feel */
export function playPlanReady(): void {
  osc("sine", 329.63, 329.63, 0.40, 0.07);                 // E4 — warm low note
  osc("sine", 523.25, 523.25, 0.35, 0.06, 0.13);           // C5
  osc("sine", 783.99, 783.99, 0.40, 0.08, 0.26);           // G5 — chime peak
  osc("sine", 1046.5, 700,    0.30, 0.025, 0.38);          // shimmer tail, falls away
}

/** Seams ready — two crisp staccato pings, bright + connected */
export function playSeamsReady(): void {
  osc("triangle", 1108.73, 1108.73, 0.13, 0.08);           // C#6 — sharp first ping
  osc("triangle", 1318.51, 1318.51, 0.11, 0.07, 0.10);    // E6 — second ping
  osc("sine",     1567.98, 1567.98, 0.25, 0.04, 0.18);    // G6 — bright resonant tail
}

/** ⚡ INITIATE SURGERY — power-up sweep + triad chord hit */
export function playLaunch(): void {
  // rising sawtooth sweep
  osc("sawtooth", 160, 1800, 0.32, 0.04);
  // chord stab after the sweep peaks
  const chord = [523, 659, 784];
  chord.forEach((f, i) => osc(i === 0 ? "sine" : "triangle", f, f, 0.55, 0.055, 0.28));
  // high shimmer on top
  osc("sine", 1760, 2200, 0.4, 0.025, 0.30);
}
