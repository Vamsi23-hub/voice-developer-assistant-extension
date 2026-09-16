import { CommandEngine } from "../core/commandEngine";
import { AliasStore, ResponseOutput } from "../ports/ports";
import {
  createVoiceFinalGate,
  handleVoiceStopResult,
} from "./executeRecognizedSpeech";
import {
  matchesVoiceSession,
  VoiceOutboundMessage,
} from "./pttProtocol";
import { VoiceClient } from "./voiceClient";

export const VOICE_BUSY_MESSAGE = "Voice command is still processing.";

export type PttControllerState =
  | "idle"
  | "recording"
  | "processingAudio"
  | "processingIntent";

export type PttController = {
  state(): PttControllerState;
  activeSessionId(): string | undefined;
  start(): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  handleUnsolicitedError(
    message: VoiceOutboundMessage & { type: "error" }
  ): void;
};

export function createPttController(options: {
  client: VoiceClient;
  output: ResponseOutput;
  engine: CommandEngine;
  aliases: AliasStore;
  onStateChange?: (state: PttControllerState) => void;
}): PttController {
  let state: PttControllerState = "idle";
  let activeSessionId: string | undefined;
  let nextSession = 1;
  let intentStarted = false;
  let sessionGate = createVoiceFinalGate();

  const setState = (next: PttControllerState): void => {
    if (state === next) {
      return;
    }
    state = next;
    options.onStateChange?.(state);
  };

  const enterIdle = (): void => {
    activeSessionId = undefined;
    intentStarted = false;
    setState("idle");
  };

  const isCurrent = (sessionId: string): boolean => activeSessionId === sessionId;

  return {
    state(): PttControllerState {
      return state;
    },
    activeSessionId(): string | undefined {
      return activeSessionId;
    },
    async start(): Promise<void> {
      if (state !== "idle") {
        await options.output.error(VOICE_BUSY_MESSAGE);
        return;
      }
      const sessionId = String(nextSession);
      nextSession += 1;
      activeSessionId = sessionId;
      sessionGate = createVoiceFinalGate();
      setState("recording");
      try {
        options.output.debug(`push-to-talk start session=${sessionId}`);
        await options.client.start(sessionId);
        if (!isCurrent(sessionId)) {
          return;
        }
      } catch (error) {
        if (!isCurrent(sessionId)) {
          return;
        }
        enterIdle();
        const message =
          error instanceof Error ? error.message : "Could not start recording.";
        await options.output.error(message);
      }
    },
    async stop(): Promise<void> {
      if (state !== "recording") {
        await options.output.error("Push-to-talk is not recording.");
        return;
      }
      const sessionId = activeSessionId;
      if (!sessionId) {
        enterIdle();
        return;
      }
      setState("processingAudio");
      try {
        const result = await options.client.stop(sessionId);
        if (!isCurrent(sessionId) || !matchesVoiceSession(result, sessionId)) {
          return;
        }
        if (result.type !== "final") {
          await handleVoiceStopResult({
            result,
            aliases: [],
            engine: options.engine,
            output: options.output,
            gate: sessionGate,
          });
          if (isCurrent(sessionId)) {
            enterIdle();
          }
          return;
        }
        setState("processingIntent");
        const stored = await options.aliases.getAll();
        if (!isCurrent(sessionId)) {
          enterIdle();
          return;
        }
        intentStarted = true;
        await handleVoiceStopResult({
          result,
          aliases: Object.keys(stored),
          engine: options.engine,
          output: options.output,
          gate: sessionGate,
        });
        if (isCurrent(sessionId)) {
          enterIdle();
        }
      } catch (error) {
        if (!isCurrent(sessionId)) {
          return;
        }
        enterIdle();
        const message =
          error instanceof Error ? error.message : "Could not stop recording.";
        await options.output.error(message);
      }
    },
    async cancel(): Promise<void> {
      if (state === "idle") {
        return;
      }
      if (state === "processingIntent" && intentStarted) {
        options.output.debug(
          "push-to-talk cancel ignored; command already running"
        );
        return;
      }
      const sessionId = activeSessionId;
      activeSessionId = undefined;
      try {
        if (state === "recording" || state === "processingAudio") {
          await options.client.cancel(sessionId);
        }
      } finally {
        enterIdle();
        options.output.debug("push-to-talk cancelled");
      }
    },
    handleUnsolicitedError(message): void {
      if (
        message.id !== undefined &&
        activeSessionId !== undefined &&
        message.id !== activeSessionId
      ) {
        return;
      }
      if (state === "idle" || intentStarted) {
        return;
      }
      enterIdle();
      void options.output.error(message.message);
    },
  };
}
