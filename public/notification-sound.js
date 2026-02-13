/*
  Notification sound (gentle) for new incoming messages.

  IMPORTANT (autoplay restrictions):
  Modern browsers block audio until a user gesture happens.
  To avoid console warnings (and to be correct), we DO NOT create
  an AudioContext until after the first user interaction.
*/

const LS_KEY = "sr_tool_sound_enabled";

let enabled = true;
try {
  // default: enabled, unless explicitly disabled
  enabled = localStorage.getItem(LS_KEY) !== "0";
} catch {}

let ctx = null;
let unlocked = false;
let lastPlayedAt = 0;

function canUseWebAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  return !!AC;
}

function createCtxAfterGesture() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    return ctx;
  } catch {
    ctx = null;
    return null;
  }
}

export function setSoundEnabled(v) {
  enabled = !!v;
  try {
    localStorage.setItem(LS_KEY, enabled ? "1" : "0");
  } catch {}
}

export function isSoundEnabled() {
  return enabled;
}

export async function unlockSound() {
  if (!enabled) return;
  if (!canUseWebAudio()) return;

  const c = createCtxAfterGesture();
  if (!c) return;

  try {
    if (c.state === "suspended") {
      await c.resume();
    }
  } catch {
    // ignore
  }

  unlocked = (c.state === "running");
}

// A very soft notification tone: short sine with fade-in/out
export async function playSoftNotification() {
  if (!enabled) return;
  if (!ctx || !unlocked) return; // do not create AudioContext before gesture

  // Cooldown: avoid spamming if multiple messages arrive quickly
  const nowMs = Date.now();
  if (nowMs - lastPlayedAt < 850) return;
  lastPlayedAt = nowMs;

  // If the context got suspended again, skip quietly.
  if (ctx.state !== "running") return;

  const t0 = ctx.currentTime;

  // Gain envelope (very gentle)
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
  gain.connect(ctx.destination);

  // Oscillator
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(740, t0);
  osc.frequency.exponentialRampToValueAtTime(980, t0 + 0.10);
  osc.connect(gain);

  try {
    osc.start(t0);
    osc.stop(t0 + 0.30);
  } catch {
    // ignore
  }
}

// Auto unlock on first user gesture (this is where we create the AudioContext)
(function armAutoUnlock() {
  const handler = () => {
    unlockSound();
  };
  try {
    window.addEventListener("pointerdown", handler, { once: true, capture: true });
    window.addEventListener("keydown", handler, { once: true, capture: true });
  } catch {
    // ignore
  }
})();
