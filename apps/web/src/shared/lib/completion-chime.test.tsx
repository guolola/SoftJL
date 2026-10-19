// Covers the synthesized completion chime: gesture priming, mute preference, blocked autoplay, and missing audio.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelingGenerationButton } from "../ui/modeling-generation-button";
import { playCompletionChime, primeCompletionChime, resetCompletionChimeForTests } from "./completion-chime";
import { patchUserSettings } from "./user-settings";

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

const contexts: FakeAudioContext[] = [];

class FakeAudioContext {
  static allowResume = true;
  state: AudioContextState = "suspended";
  currentTime = 0;
  destination = {};
  oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  constructor() {
    contexts.push(this);
  }
  resume = vi.fn(() => {
    if (!FakeAudioContext.allowResume) return new Promise<void>(() => {});
    this.state = "running";
    return Promise.resolve();
  });
  createGain = vi.fn(() => ({ gain: new FakeParam(), connect: vi.fn(), disconnect: vi.fn() }));
  createOscillator = vi.fn(() => {
    const oscillator = { type: "", frequency: new FakeParam(), connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    this.oscillators.push(oscillator);
    return oscillator;
  });
}

describe("completion chime", () => {
  beforeEach(() => {
    localStorage.clear();
    contexts.length = 0;
    FakeAudioContext.allowResume = true;
    resetCompletionChimeForTests();
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("unlocks audio from the generation button click and plays a short two-note chime", async () => {
    const onClick = vi.fn();
    render(<ModelingGenerationButton label="生成" onClick={onClick} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "生成" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resume).toHaveBeenCalled();

    await expect(playCompletionChime()).resolves.toBe(true);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].oscillators).toHaveLength(2);
    expect(contexts[0].oscillators.every((oscillator) => oscillator.start.mock.calls.length === 1)).toBe(true);
  });

  it("stays silent and creates no audio context when the preference is off", async () => {
    patchUserSettings({ completionSound: false });
    primeCompletionChime();
    await expect(playCompletionChime()).resolves.toBe(false);
    expect(contexts).toHaveLength(0);
  });

  it("gives up quickly instead of chiming late when autoplay keeps audio suspended", async () => {
    vi.useFakeTimers();
    FakeAudioContext.allowResume = false;
    const played = playCompletionChime();
    await vi.advanceTimersByTimeAsync(300);
    await expect(played).resolves.toBe(false);
    expect(contexts[0].oscillators).toHaveLength(0);
  });

  it("handles browsers without Web Audio or with a failing audio context", async () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => primeCompletionChime()).not.toThrow();
    await expect(playCompletionChime()).resolves.toBe(false);

    resetCompletionChimeForTests();
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("NotAllowedError"); } });
    await expect(playCompletionChime()).resolves.toBe(false);
  });
});
