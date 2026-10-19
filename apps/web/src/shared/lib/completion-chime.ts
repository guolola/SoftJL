// Synthesizes a short, quiet two-note chime with Web Audio so completion feedback needs no audio assets.
import { loadUserSettings } from "./user-settings";

type AudioContextConstructor = new () => AudioContext;

// Autoplay policies may keep a context suspended; never wait long enough to chime late.
const RESUME_TIMEOUT_MS = 250;
const NOTES = [
  { frequency: 659.25, offset: 0 },
  { frequency: 987.77, offset: 0.11 },
] as const;

let sharedContext: AudioContext | null = null;
let audioUnavailable = false;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const audioWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return (window.AudioContext as AudioContextConstructor | undefined) ?? audioWindow.webkitAudioContext ?? null;
}

function ensureAudioContext() {
  if (sharedContext || audioUnavailable) return sharedContext;
  const AudioContextClass = audioContextConstructor();
  if (!AudioContextClass) {
    audioUnavailable = true;
    return null;
  }
  try {
    sharedContext = new AudioContextClass();
  } catch {
    audioUnavailable = true;
  }
  return sharedContext;
}

/**
 * Creates or resumes the shared context during the user's generation gesture, which is what
 * browser autoplay rules require for the later, asynchronous completion chime.
 */
export function primeCompletionChime() {
  if (!loadUserSettings().completionSound) return;
  const context = ensureAudioContext();
  if (context?.state === "suspended") void context.resume().catch(() => {});
}

/** Plays the chime once; resolves false when muted, unsupported, or blocked by the browser. */
export async function playCompletionChime(): Promise<boolean> {
  if (!loadUserSettings().completionSound) return false;
  const context = ensureAudioContext();
  if (!context) return false;
  try {
    if (context.state === "suspended") {
      await Promise.race([
        context.resume(),
        new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS)),
      ]);
    }
    if (context.state !== "running") return false;
    scheduleChime(context);
    return true;
  } catch {
    return false;
  }
}

function scheduleChime(context: AudioContext) {
  const start = context.currentTime + 0.02;
  const output = context.createGain();
  output.gain.value = 0.12;
  output.connect(context.destination);
  let remaining = NOTES.length;
  for (const { frequency, offset } of NOTES) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const noteStart = start + offset;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    // Soft attack and exponential decay keep the chime short and unobtrusive.
    envelope.gain.setValueAtTime(0.0001, noteStart);
    envelope.gain.exponentialRampToValueAtTime(1, noteStart + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.55);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.onended = () => {
      envelope.disconnect();
      remaining -= 1;
      if (remaining === 0) output.disconnect();
    };
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.6);
  }
}

export function resetCompletionChimeForTests() {
  sharedContext = null;
  audioUnavailable = false;
}
