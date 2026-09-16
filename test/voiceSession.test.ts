import { describe, expect, it } from "vitest";
import { reduceVoiceSession } from "../helpers/voice/session";
import { downmixToMono, isTooShort } from "../helpers/voice/transcribe";
import { mapCaptureError } from "../helpers/voice/capture";

describe("voice session transitions", () => {
  it("starts recording from idle", () => {
    expect(reduceVoiceSession("idle", "start")).toEqual({
      ok: true,
      next: "recording",
      transcribe: false,
      discard: false,
    });
  });

  it("rejects start while already recording", () => {
    expect(reduceVoiceSession("recording", "start")).toEqual({
      ok: false,
      next: "recording",
      code: "MIC_ALREADY_ACTIVE",
    });
  });

  it("rejects start while transcription is in progress", () => {
    expect(reduceVoiceSession("processing", "start")).toEqual({
      ok: false,
      next: "processing",
      code: "MIC_ALREADY_ACTIVE",
    });
  });

  it("rejects stop while idle", () => {
    expect(reduceVoiceSession("idle", "stop")).toEqual({
      ok: false,
      next: "idle",
      code: "VOICE_NOT_RECORDING",
    });
  });

  it("moves stop into processing so transcription can run once", () => {
    expect(reduceVoiceSession("recording", "stop")).toEqual({
      ok: true,
      next: "processing",
      transcribe: true,
      discard: false,
    });
  });

  it("discards audio on cancel while recording", () => {
    expect(reduceVoiceSession("recording", "cancel")).toEqual({
      ok: true,
      next: "idle",
      transcribe: false,
      discard: true,
    });
  });

  it("treats cancel while idle as a no-op", () => {
    expect(reduceVoiceSession("idle", "cancel")).toEqual({
      ok: true,
      next: "idle",
      transcribe: false,
      discard: false,
    });
  });

  it("rejects stop while transcription is in progress", () => {
    expect(reduceVoiceSession("processing", "stop")).toEqual({
      ok: false,
      next: "processing",
      code: "VOICE_NOT_RECORDING",
    });
  });
});

describe("microphone error mapping", () => {
  it("maps permission and missing-device failures", () => {
    expect(
      mapCaptureError({ code: "PERMISSION_DENIED", message: "denied" })
    ).toMatchObject({ code: "MIC_PERMISSION_DENIED" });
    expect(
      mapCaptureError({ message: "No default input device." })
    ).toMatchObject({ code: "MIC_DEVICE_NOT_FOUND" });
    expect(mapCaptureError(new Error("stream exploded"))).toMatchObject({
      code: "MIC_STREAM_FAILED",
    });
    expect(
      mapCaptureError({
        code: "XRUN",
        message: "A buffer underrun or overrun occurred.",
      })
    ).toMatchObject({ code: "MIC_STREAM_FAILED" });
  });
});

describe("audio conversion helpers", () => {
  it("downmixes stereo frames to mono without changing duration", () => {
    const stereo = new Float32Array([1, -1, 0.5, 0.5]);
    expect(Array.from(downmixToMono(stereo, 2))).toEqual([0, 0.5]);
  });

  it("treats short 16 kHz buffers as too short", () => {
    expect(isTooShort(new Float32Array(100))).toBe(true);
    expect(isTooShort(new Float32Array(16000))).toBe(false);
  });
});
