/**
 * POS sound engine — tiny Web Audio beeps, zero audio assets.
 *
 * All effects are synthesised on the fly with an oscillator + gain envelope,
 * so there is nothing to download and nothing to 404. The AudioContext is
 * created lazily on the first play call (which always follows a user gesture
 * — a click, a scanner keystroke or a camera hit — satisfying browser
 * autoplay policies). Muted state persists in localStorage.
 */

export type PosSound = "scan" | "add" | "remove" | "error" | "success" | "click";

const STORAGE_KEY = "stellora_pos_sound";

interface ToneStep {
  freq: number;
  dur: number;
  delay: number;
  type: OscillatorType;
  gain: number;
}

const RECIPES: Record<PosSound, ToneStep[]> = {
  // classic scanner "beep"
  scan: [{ freq: 1250, dur: 0.09, delay: 0, type: "square", gain: 0.045 }],
  // soft blip when an item lands on the bill
  add: [{ freq: 740, dur: 0.06, delay: 0, type: "sine", gain: 0.06 }],
  // low blip when removing a line
  remove: [{ freq: 500, dur: 0.07, delay: 0, type: "sine", gain: 0.05 }],
  // dull buzz for stock / network errors
  error: [{ freq: 210, dur: 0.16, delay: 0, type: "sawtooth", gain: 0.055 }],
  // two-note chime when a sale completes
  success: [
    { freq: 523, dur: 0.1, delay: 0, type: "sine", gain: 0.06 },
    { freq: 784, dur: 0.16, delay: 0.11, type: "sine", gain: 0.06 },
  ],
  // subtle tick for UI clicks (payment method, hold, etc.)
  click: [{ freq: 880, dur: 0.03, delay: 0, type: "triangle", gain: 0.032 }],
};

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

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

export function playPosSound(name: PosSound): void {
  if (!posSoundEnabled()) return;
  const ac = ensureCtx();
  if (!ac) return;
  for (const step of RECIPES[name]) {
    try {
      const t0 = ac.currentTime + step.delay;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = step.type;
      osc.frequency.setValueAtTime(step.freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(step.gain, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + step.dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + step.dur + 0.03);
    } catch {
      /* audio must never break the billing flow */
    }
  }
}
