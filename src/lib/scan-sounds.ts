/**
 * Audible feedback for the admin attendance scanner.
 *
 * Tones are synthesized with the Web Audio API — no audio files, no
 * dependency, works offline. Three distinct patterns so the admin can tell
 * the outcome without looking at the screen:
 *   success   — one short high chirp (the "supermarket scanner" beep)
 *   duplicate — two soft mid blips (already scanned)
 *   error     — one low buzz (rejected / not found)
 *
 * Browsers only allow audio after a user gesture, so call unlockScanAudio()
 * from a click (e.g. the "start camera" button) — it creates/resumes the
 * shared AudioContext so the very first scan can already beep. Everything is
 * best-effort: on any failure it stays silent and never throws.
 */

export type ScanSound = 'success' | 'duplicate' | 'error';

const MUTE_KEY = 'attendance-scan-muted';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Create/resume the audio context. Call from a user gesture. */
export function unlockScanAudio(): void {
  const c = getContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function isScanSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setScanSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* private mode etc. — preference just isn't remembered */
  }
}

function tone(c: AudioContext, freq: number, startAt: number, duration: number, type: OscillatorType = 'sine', gain = 0.25) {
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // quick fade in/out avoids clicks
  vol.gain.setValueAtTime(0, startAt);
  vol.gain.linearRampToValueAtTime(gain, startAt + 0.01);
  vol.gain.setValueAtTime(gain, startAt + duration - 0.02);
  vol.gain.linearRampToValueAtTime(0, startAt + duration);
  osc.connect(vol).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.01);
}

/** Play the tone for a scan outcome (no-op when muted or unsupported). */
export function playScanSound(kind: ScanSound): void {
  if (isScanSoundMuted()) return;
  const c = getContext();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t = c.currentTime;
    switch (kind) {
      case 'success':
        tone(c, 880, t, 0.12);
        break;
      case 'duplicate':
        tone(c, 587, t, 0.09, 'sine', 0.18);
        tone(c, 587, t + 0.14, 0.09, 'sine', 0.18);
        break;
      case 'error':
        tone(c, 220, t, 0.25, 'square', 0.12);
        break;
    }
  } catch {
    /* silent on any audio failure */
  }
}
