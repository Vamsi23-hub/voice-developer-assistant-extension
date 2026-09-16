export const VOICE_ERROR_CODES = [
  "MIC_PERMISSION_DENIED",
  "MIC_DEVICE_NOT_FOUND",
  "MIC_STREAM_FAILED",
  "MIC_ALREADY_ACTIVE",
  "VOICE_NOT_RECORDING",
  "AUDIO_TOO_SHORT",
  "AUDIO_CONVERSION_FAILED",
  "MODEL_NOT_FOUND",
  "STT_FAILED",
  "HELPER_START_FAILED",
  "HELPER_CRASHED",
  "INVALID_MESSAGE",
] as const;

export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[number];

export type VoiceInboundMessage =
  | { type: "start"; id?: string }
  | { type: "stop"; id?: string }
  | { type: "cancel"; id?: string };

export type VoiceOutboundMessage =
  | { type: "ready" }
  | { type: "recording"; id?: string }
  | { type: "final"; text: string; id?: string }
  | { type: "error"; code: VoiceErrorCode; message: string; id?: string };

function optionalId(record: Record<string, unknown>): string | undefined {
  if (record.id === undefined) {
    return undefined;
  }
  if (typeof record.id !== "string" || record.id.length === 0) {
    throw new Error("Voice protocol message is missing a valid type.");
  }
  return record.id;
}

function withId<T extends object>(
  message: T,
  id: string | undefined
): T & { id?: string } {
  if (id === undefined) {
    return message;
  }
  return { ...message, id };
}

export function encodeVoiceMessage(
  message: VoiceInboundMessage | VoiceOutboundMessage
): string {
  return JSON.stringify(message);
}

export function parseVoiceMessage(
  line: string
): VoiceInboundMessage | VoiceOutboundMessage {
  const parsed: unknown = JSON.parse(line);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Voice protocol message must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  const id = optionalId(record);
  if (
    record.type === "start" ||
    record.type === "stop" ||
    record.type === "cancel"
  ) {
    return withId({ type: record.type }, id);
  }
  if (record.type === "ready") {
    return { type: "ready" };
  }
  if (record.type === "recording") {
    return withId({ type: "recording" }, id);
  }
  if (record.type === "final" && typeof record.text === "string") {
    return withId({ type: "final", text: record.text }, id);
  }
  if (
    record.type === "error" &&
    typeof record.code === "string" &&
    isVoiceErrorCode(record.code) &&
    typeof record.message === "string"
  ) {
    return withId(
      {
        type: "error" as const,
        code: record.code,
        message: record.message,
      },
      id
    );
  }
  throw new Error("Voice protocol message is missing a valid type.");
}

export function isVoiceErrorCode(value: string): value is VoiceErrorCode {
  return (VOICE_ERROR_CODES as readonly string[]).includes(value);
}

export function matchesVoiceSession(
  message: VoiceOutboundMessage,
  sessionId: string
): boolean {
  if (message.type === "ready") {
    return true;
  }
  if (message.id === undefined) {
    return true;
  }
  return message.id === sessionId;
}

export function userFacingVoiceError(
  code: VoiceErrorCode,
  detail?: string
): string {
  switch (code) {
    case "MIC_PERMISSION_DENIED":
      return "Microphone permission was denied. Enable the microphone for this editor in System Settings → Privacy & Security → Microphone.";
    case "MIC_DEVICE_NOT_FOUND":
      return "No microphone was found.";
    case "MIC_STREAM_FAILED":
      if (detail) {
        return `Could not capture from the microphone: ${detail}`;
      }
      return "Could not capture from the microphone.";
    case "MIC_ALREADY_ACTIVE":
      return "Push-to-talk is already recording.";
    case "VOICE_NOT_RECORDING":
      return "Push-to-talk is not recording.";
    case "AUDIO_TOO_SHORT":
      return "The recording was too short. Hold Start a little longer, then Stop.";
    case "AUDIO_CONVERSION_FAILED":
      if (detail) {
        return `Could not convert microphone audio: ${detail}`;
      }
      return "Could not convert microphone audio to 16 kHz mono.";
    case "MODEL_NOT_FOUND":
      return (
        detail ??
        "Speech model was not found. Set VDA_STT_MODEL_DIR or voiceDeveloperAssistant.sttModelDir."
      );
    case "STT_FAILED":
      if (detail) {
        return `Speech recognition failed: ${detail}`;
      }
      return "Speech recognition failed.";
    case "HELPER_START_FAILED":
      if (detail) {
        return `Voice helper failed to start: ${detail}`;
      }
      return "Voice helper failed to start.";
    case "HELPER_CRASHED":
      return "The voice helper process crashed. Try Start Push-to-Talk again.";
    case "INVALID_MESSAGE":
      return detail ?? "The voice helper sent an invalid message.";
  }
}
