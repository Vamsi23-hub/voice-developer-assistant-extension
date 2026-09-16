export type VoiceSessionState = "idle" | "recording" | "processing";

export type VoiceSessionCommand = "start" | "stop" | "cancel";

export type VoiceSessionResult =
  | { ok: true; next: VoiceSessionState; transcribe: boolean; discard: boolean }
  | {
      ok: false;
      next: VoiceSessionState;
      code: "MIC_ALREADY_ACTIVE" | "VOICE_NOT_RECORDING";
    };

export function reduceVoiceSession(
  state: VoiceSessionState,
  command: VoiceSessionCommand
): VoiceSessionResult {
  if (command === "start") {
    if (state !== "idle") {
      return { ok: false, next: state, code: "MIC_ALREADY_ACTIVE" };
    }
    return { ok: true, next: "recording", transcribe: false, discard: false };
  }
  if (command === "stop") {
    if (state !== "recording") {
      return { ok: false, next: state, code: "VOICE_NOT_RECORDING" };
    }
    return { ok: true, next: "processing", transcribe: true, discard: false };
  }
  if (state === "idle") {
    return { ok: true, next: "idle", transcribe: false, discard: false };
  }
  if (state !== "recording") {
    return { ok: false, next: state, code: "VOICE_NOT_RECORDING" };
  }
  return { ok: true, next: "idle", transcribe: false, discard: true };
}
