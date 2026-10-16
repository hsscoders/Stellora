/**
 * POS sound engine v2 — loud, reliable, zero audio assets.
 *
 * Why v1 felt silent on real hardware:
 *  1. gains of 0.03–0.06 are near-inaudible on laptop speakers,
 *  2. the AudioContext could be created while "suspended" (autoplay policy)
 *     and v1 scheduled tones into the frozen context without awaiting
 *     resume() — the tones never fired,
 *  3. there was no fallback when Web Audio is blocked entirely.
 *
 * v2 fixes all three:
 *  - unlockAudio() installs capture-phase pointerdown/keydown listeners that
 *    create + resume the context inside a REAL user gesture and pre-warm it
 *    with a silent buffer (the classic unlock trick),
 *  - every play awaits resume() and verifies the context is running before
 *    scheduling anything,
 *  - if Web Audio still is not running, a synthesised WAV played through
 *    HTMLAudioElement takes over (no network, no files),
 *  - a persisted master volume (default 0.9) feeds a GainNode, and the tone
 *    recipes themselves are ~4× louder than v1,
 *  - testPosSound() plays a bright three-note chime for the Test button.
 */

export type PosSound = "scan" | "add" | "remove" | "error" | "success" | "click" | "test";

const STORAGE_KEY = "stellora_pos_sound";
const VOLUME_KEY = "stellora_pos_volume";
const DEFAULT_VOLUME = 0.9;

interface ToneStep {
  freq: number;
  dur: number;
  delay: number;
  type: OscillatorType;
  gain: number;
}

const RECIPES: Record<PosSound, ToneStep[]> = {
  // classic scanner "beep" — loud and unmistakable
  scan: [{ freq: 1250, dur: 0.1, delay: 0, type: "square", gain: 0.2 }],
  // soft blip when an item lands on the bill
  add: [{ freq: 740, dur: 0.07, delay: 0, type: "sine", gain: 0.24 }],
  // low blip when removing a line
  remove: [{ freq: 500, dur: 0.08, delay: 0, type: "sine", gain: 0.18 }],
  // dull buzz for stock / network errors
  error: [{ freq: 210, dur: 0.2, delay: 0, type: "sawtooth", gain: 0.22 }],
  // two-note chime when a sale completes
  success: [
    { freq: 523, dur: 0.1, delay: 0, type: "sine", gain: 0.24 },
    { freq: 784, dur: 0.18, delay: 0.11, type: "sine", gain: 0.24 },
  ],
  // subtle tick for UI clicks (payment method, hold, etc.)
  click: [{ freq: 880, dur: 0.035, delay: 0, type: "triangle", gain: 0.12 }],
  // bright three-note chime for the sound-test button
  test: [
    { freq: 880, dur: 0.09, delay: 0, type: "sine", gain: 0.26 },
    { freq: 1175, dur: 0.09, delay: 0.1, type: "sine", gain: 0.26 },
    { freq: 1568, dur: 0.16, delay: 0.2, type: "sine", gain: 0.28 },
  ],
};

/* ------------------------------ settings ------------------------------ */

export function posSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setPosSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* private mode — mute toggle just won't persist */
  }
}

export function getPosVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    // NB: Number(null) === 0 — an absent key must fall back to the default
    if (raw === null || raw === "") return DEFAULT_VOLUME;
    const num = Number(raw);
    if (!Number.isFinite(num)) return DEFAULT_VOLUME;
    return Math.min(Math.max(num, 0), 1);
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function setPosVolume(v: number): void {
  try {
    window.localStorage.setItem(VOLUME_KEY, String(Math.min(Math.max(v, 0), 1)));
  } catch {
    /* ignore */
  }
  if (master) master.gain.value = Math.min(Math.max(v, 0), 1);
}

/* ------------------------------ web audio ------------------------------ */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function createCtx(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = getPosVolume();
    master.connect(ctx.destination);
    return ctx;
  } catch {
    ctx = null;
    master = null;
    return null;
  }
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  return ctx ?? createCtx();
}

let unlocked = false;

/**
 * Call once on mount. The first real pointer/key gesture creates the context,
 * resumes it, and pushes a silent buffer through — after that, every later
 * play call runs while the context is already live.
 */
export function unlockAudio(): void {
  if (typeof window === "undefined" || unlocked) return;
  unlocked = true;

  const handler = () => {
    const ac = ensureCtx();
    if (!ac) return;
    if (ac.state === "suspended") void ac.resume().catch(() => {});
    // silent-buffer pre-warm: some browsers only arm the output pipeline
    // after a buffer has been played from inside a gesture
    try {
      const warm = ac.createBufferSource();
      warm.buffer = ac.createBuffer(1, 1, 22050);
      warm.connect(ac.destination);
      warm.start(0);
    } catch {
      /* ignore */
    }
  };

  window.addEventListener("pointerdown", handler, true);
  window.addEventListener("keydown", handler, true);
}

async function runningCtx(): Promise<AudioContext | null> {
  const ac = ensureCtx();
  if (!ac) return null;
  if (ac.state !== "running") {
    try {
      await ac.resume();
    } catch {
      /* resume may reject before any gesture */
    }
  }
  return ac.state === "running" ? ac : null;
}

function scheduleSteps(ac: AudioContext, steps: ToneStep[]) {
  for (const step of steps) {
    try {
      const t0 = ac.currentTime + step.delay;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = step.type;
      osc.frequency.setValueAtTime(step.freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(step.gain, 0.0002), t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + step.dur);
      osc.connect(gain);
      gain.connect(master ?? ac.destination);
      osc.start(t0);
      osc.stop(t0 + step.dur + 0.03);
    } catch {
      /* audio must never break the billing flow */
    }
  }
}

/* ------------------------------ WAV fallback ------------------------------ */

/** Render the recipe into a 16-bit mono PCM WAV data URI (22050 Hz). */
function synthWav(steps: ToneStep[], volume: number): string | null {
  try {
    const rate = 22050;
    const total = steps.reduce((mx, s) => Math.max(mx, s.delay + s.dur + 0.05), 0);
    const n = Math.ceil(total * rate);
    const data = new Float32Array(n);
    for (const step of steps) {
      const start = Math.floor(step.delay * rate);
      const len = Math.floor(step.dur * rate);
      for (let i = 0; i < len && start + i < n; i += 1) {
        const t = i / rate;
        const ph = (t * step.freq) % 1;
        let v: number;
        if (step.type === "square") v = ph < 0.5 ? 1 : -1;
        else if (step.type === "sawtooth") v = 2 * ph - 1;
        else if (step.type === "triangle") v = 4 * Math.abs(ph - 0.5) - 1;
        else v = Math.sin(2 * Math.PI * step.freq * t);
        // quick attack + exponential decay keeps the beep punchy
        const env = Math.min(1, i / (rate * 0.004)) * Math.exp(-3 * t);
        data[start + i] += v * step.gain * env;
      }
    }
    const bytes = new DataView(new ArrayBuffer(44 + n * 2));
    const wr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i += 1) bytes.setUint8(off + i, s.charCodeAt(i));
    };
    wr(0, "RIFF");
    bytes.setUint32(4, 36 + n * 2, true);
    wr(8, "WAVEfmt ");
    bytes.setUint32(16, 16, true);
    bytes.setUint16(20, 1, true);
    bytes.setUint16(22, 1, true);
    bytes.setUint32(24, rate, true);
    bytes.setUint32(28, rate * 2, true);
    bytes.setUint16(32, 2, true);
    bytes.setUint16(34, 16, true);
    wr(36, "data");
    bytes.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i += 1) {
      bytes.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i] * 3)) * 32767 * volume, true);
    }
    // base64 in chunks — btoa chokes on huge single calls on old engines
    const raw = new Uint8Array(bytes.buffer);
    let bin = "";
    const chunk = 8192;
    for (let i = 0; i < raw.length; i += chunk) {
      bin += String.fromCharCode(...raw.subarray(i, i + chunk));
    }
    return `data:audio/wav;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

const wavCache = new Map<string, string>();

function playFallback(name: PosSound) {
  const vol = getPosVolume();
  let uri = wavCache.get(name);
  if (!uri) {
    uri = synthWav(RECIPES[name], vol) ?? "";
    if (uri) wavCache.set(name, uri);
  }
  if (!uri) return;
  try {
    const audio = new Audio(uri);
    audio.volume = vol;
    void audio.play().catch(() => {});
  } catch {
    /* never break the flow over a beep */
  }
}

/* ------------------------------ public api ------------------------------ */

export function playPosSound(name: PosSound): void {
  if (!posSoundEnabled()) return;
  void (async () => {
    const ac = await runningCtx();
    if (ac && master) {
      master.gain.value = getPosVolume();
      scheduleSteps(ac, RECIPES[name]);
    } else {
      playFallback(name);
    }
  })();
}

export function testPosSound(): void {
  playPosSound("test");
}
