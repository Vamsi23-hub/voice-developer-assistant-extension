import * as readline from "node:readline";
import { readModelDirFromEnv } from "../stt/resolveModel";
import {
  parseVoiceMessage,
  userFacingVoiceError,
  VoiceErrorCode,
  VoiceInboundMessage,
} from "../../src/speech/pttProtocol";
import { startCapture, mapCaptureError, CaptureSession } from "./capture";
import { writeVoiceDebug, writeVoiceProtocol } from "./protocol";
import { reduceVoiceSession, VoiceSessionState } from "./session";
import {
  downmixToMono,
  durationSeconds,
  isTooShort,
  loadRecognizer,
  LoadedRecognizer,
  resampleTo16k,
  TARGET_SAMPLE_RATE,
  transcribeMono16k,
} from "./transcribe";

let currentSessionId: string | undefined;

function fail(code: VoiceErrorCode, detail?: string): void {
  writeVoiceProtocol({
    type: "error",
    code,
    message: userFacingVoiceError(code, detail),
    ...(currentSessionId ? { id: currentSessionId } : {}),
  });
}

function parseInboundCommand(line: string): VoiceInboundMessage | undefined {
  try {
    const parsed = parseVoiceMessage(line);
    if (
      parsed.type !== "start" &&
      parsed.type !== "stop" &&
      parsed.type !== "cancel"
    ) {
      fail(
        "INVALID_MESSAGE",
        "Helper stdin only accepts start, stop, or cancel."
      );
      return undefined;
    }
    return parsed;
  } catch (error) {
    fail(
      "INVALID_MESSAGE",
      error instanceof Error
        ? error.message
        : "Invalid voice protocol message."
    );
    return undefined;
  }
}

async function discardCapture(
  capture: CaptureSession | undefined
): Promise<void> {
  try {
    await capture?.stop();
  } catch {
    // Discard is best-effort; return to idle either way.
  }
  writeVoiceDebug("cancelled; buffer discarded");
}

async function transcribeCaptured(
  loaded: LoadedRecognizer,
  session: CaptureSession | undefined
): Promise<void> {
  let native: Float32Array;
  try {
    native = session ? await session.stop() : new Float32Array();
  } catch (error) {
    const mapped = mapCaptureError(error);
    fail(mapped.code, mapped.message);
    return;
  }

  try {
    const nativeRate = session?.nativeSampleRate ?? TARGET_SAMPLE_RATE;
    const nativeChannels = session?.nativeChannels ?? 1;
    const recordedSeconds = durationSeconds(
      native,
      nativeRate,
      nativeChannels
    );
    writeVoiceDebug(`recordingDurationSec=${recordedSeconds.toFixed(3)}`);
    const mono = downmixToMono(native, nativeChannels);
    const normalized = resampleTo16k(loaded.sherpa, mono, nativeRate);
    writeVoiceDebug(`normalizedSampleRate=${TARGET_SAMPLE_RATE}`);
    writeVoiceDebug(`normalizedChannels=1`);
    if (isTooShort(normalized)) {
      fail("AUDIO_TOO_SHORT", "Recording was too short to transcribe.");
      return;
    }
    const result = transcribeMono16k(loaded, normalized);
    writeVoiceDebug(`transcriptionMs=${result.decodeMs}`);
    writeVoiceProtocol({
      type: "final",
      text: result.text,
      ...(currentSessionId ? { id: currentSessionId } : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speech recognition failed.";
    const conversion = /resampl/i.test(message);
    fail(conversion ? "AUDIO_CONVERSION_FAILED" : "STT_FAILED", message);
  }
}

async function main(): Promise<void> {
  let loaded: LoadedRecognizer;
  try {
    const modelDir = readModelDirFromEnv();
    loaded = loadRecognizer(modelDir);
    writeVoiceDebug(`modelDir=${modelDir}`);
    writeVoiceDebug(`encoder=${loaded.encoder}`);
    writeVoiceDebug(`decoder=${loaded.decoder}`);
    writeVoiceDebug(`tokens=${loaded.tokens}`);
    writeVoiceDebug(`modelLoadMs=${loaded.loadMs}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speech model was not found.";
    fail("MODEL_NOT_FOUND", message);
    process.exit(1);
  }

  let state: VoiceSessionState = "idle";
  let capture: CaptureSession | undefined;
  const rl = readline.createInterface({ input: process.stdin });

  writeVoiceProtocol({ type: "ready" });
  writeVoiceDebug("helper ready");

  const handleLine = async (line: string): Promise<void> => {
    const command = parseInboundCommand(line);
    if (!command) {
      return;
    }

    const transition = reduceVoiceSession(state, command.type);
    if (!transition.ok) {
      fail(transition.code);
      return;
    }

    if (command.type === "start") {
      currentSessionId = command.id;
      state = transition.next;
      const holder: { session?: CaptureSession } = {};
      try {
        holder.session = await startCapture({
          onStreamFailed(error) {
            if (capture !== undefined && capture !== holder.session) {
              return;
            }
            capture = undefined;
            state = "idle";
            const mapped = mapCaptureError(error);
            fail(mapped.code, mapped.message);
            currentSessionId = undefined;
          },
        });
        if (state !== "recording") {
          await discardCapture(holder.session);
          return;
        }
        capture = holder.session;
        writeVoiceProtocol({
          type: "recording",
          ...(currentSessionId ? { id: currentSessionId } : {}),
        });
      } catch (error) {
        capture = undefined;
        state = "idle";
        const mapped = mapCaptureError(error);
        fail(mapped.code, mapped.message);
        currentSessionId = undefined;
      }
      return;
    }

    if (command.type === "cancel") {
      const session = capture;
      capture = undefined;
      state = transition.next;
      await discardCapture(session);
      currentSessionId = undefined;
      return;
    }

    const session = capture;
    capture = undefined;
    await transcribeCaptured(loaded, session);
    state = "idle";
    currentSessionId = undefined;
  };

  let queue = Promise.resolve();
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    queue = queue
      .then(() => handleLine(trimmed))
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Voice helper failed.";
        fail("HELPER_START_FAILED", message);
        state = "idle";
        capture = undefined;
      });
  });
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Voice helper failed.";
  fail("HELPER_START_FAILED", message);
  process.exit(1);
});
