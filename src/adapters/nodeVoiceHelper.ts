import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import {
  encodeVoiceMessage,
  matchesVoiceSession,
  parseVoiceMessage,
  userFacingVoiceError,
  VoiceErrorCode,
  VoiceOutboundMessage,
} from "../speech/pttProtocol";
import { VoiceClient } from "../speech/voiceClient";
import { helperChildEnv, voiceHelperPath } from "./sttPaths";

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: {
    env?: NodeJS.ProcessEnv;
    stdio: readonly ["pipe", "pipe", "pipe"];
  }
) => ChildProcessWithoutNullStreams;

export type NodeVoiceHelperOptions = {
  extensionRoot: string;
  modelDir: string;
  nativeLibDir: string;
  nodeExecutable: string;
  spawnImpl?: SpawnFn;
  onDebug?: (message: string) => void;
  onProtocolError?: (
    message: VoiceOutboundMessage & { type: "error" }
  ) => void;
  env?: NodeJS.ProcessEnv;
};

function asError(
  code: VoiceErrorCode,
  detail?: string,
  id?: string
): VoiceOutboundMessage & { type: "error" } {
  return {
    type: "error",
    code,
    message: userFacingVoiceError(code, detail),
    ...(id ? { id } : {}),
  };
}

export function createNodeVoiceHelper(
  options: NodeVoiceHelperOptions
): VoiceClient {
  const helperPath = voiceHelperPath(options.extensionRoot);
  const spawnImpl: SpawnFn =
    options.spawnImpl ??
    ((command, args, spawnOptions) =>
      spawn(command, [...args], {
        env: spawnOptions.env,
        stdio: ["pipe", "pipe", "pipe"],
      }) as ChildProcessWithoutNullStreams);
  let child: ChildProcessWithoutNullStreams | undefined;
  let ready = false;
  let pending: ((message: VoiceOutboundMessage) => void) | undefined;
  let stdoutBuffer = "";
  let activeSessionId: string | undefined;

  const failPending = (message: VoiceOutboundMessage): void => {
    const waiter = pending;
    pending = undefined;
    if (waiter) {
      waiter(message);
      return;
    }
    if (message.type === "error") {
      if (
        message.id !== undefined &&
        activeSessionId !== undefined &&
        message.id !== activeSessionId
      ) {
        return;
      }
      options.onProtocolError?.(message);
    }
  };

  const handleStdoutLine = (line: string): void => {
    try {
      const parsed = parseVoiceMessage(line);
      if (
        parsed.type === "start" ||
        parsed.type === "stop" ||
        parsed.type === "cancel"
      ) {
        return;
      }
      if (parsed.type === "ready") {
        ready = true;
      }
      failPending(parsed);
    } catch (error) {
      failPending(
        asError(
          "INVALID_MESSAGE",
          error instanceof Error ? error.message : undefined
        )
      );
    }
  };

  const ensureProcess = (): ChildProcessWithoutNullStreams => {
    if (child && !child.killed && child.exitCode === null) {
      return child;
    }
    ready = false;
    if (!fs.existsSync(helperPath)) {
      throw new Error(
        `Voice helper not found at ${helperPath}. Run pnpm stt:build.`
      );
    }
    const env = helperChildEnv({
      modelDir: options.modelDir,
      nativeLibDir: options.nativeLibDir,
      env: options.env,
    });
    const next = spawnImpl(options.nodeExecutable, [helperPath], {
      env,
      stdio: ["pipe", "pipe", "pipe"] as const,
    });
    child = next;
    stdoutBuffer = "";
    next.stdout.setEncoding("utf8");
    next.stderr.setEncoding("utf8");
    next.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          handleStdoutLine(trimmed);
        }
      }
    });
    next.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (line.trim()) {
          options.onDebug?.(line);
        }
      }
    });
    next.on("exit", (code) => {
      if (child === next) {
        child = undefined;
        ready = false;
      }
      failPending(
        asError(
          "HELPER_CRASHED",
          code === null ? undefined : `exit ${code}`,
          activeSessionId
        )
      );
    });
    return next;
  };

  const send = (
    type: "start" | "stop" | "cancel",
    sessionId?: string
  ): void => {
    const proc = ensureProcess();
    proc.stdin.write(
      `${encodeVoiceMessage(
        sessionId ? { type, id: sessionId } : { type }
      )}\n`
    );
  };

  const waitFor = (
    timeoutMs: number,
    accept: (message: VoiceOutboundMessage) => boolean
  ): Promise<VoiceOutboundMessage> => {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (pending === onMessage) {
          pending = undefined;
          resolve(
            asError(
              "HELPER_START_FAILED",
              "Timed out waiting for the voice helper.",
              activeSessionId
            )
          );
        }
      }, timeoutMs);
      const onMessage = (message: VoiceOutboundMessage): void => {
        if (!accept(message)) {
          pending = onMessage;
          return;
        }
        clearTimeout(timer);
        resolve(message);
      };
      pending = onMessage;
    });
  };

  return {
    async ensureReady(): Promise<void> {
      try {
        ensureProcess();
      } catch (error) {
        throw new Error(
          userFacingVoiceError(
            "HELPER_START_FAILED",
            error instanceof Error ? error.message : undefined
          )
        );
      }
      if (ready) {
        return;
      }
      const message = await waitFor(
        60000,
        (entry) => entry.type === "ready" || entry.type === "error"
      );
      if (message.type === "error") {
        throw new Error(message.message);
      }
    },
    async start(sessionId: string): Promise<void> {
      await this.ensureReady();
      activeSessionId = sessionId;
      const pendingRecording = waitFor(10000, (entry) => {
        if (!matchesVoiceSession(entry, sessionId)) {
          return false;
        }
        return entry.type === "recording" || entry.type === "error";
      });
      send("start", sessionId);
      const message = await pendingRecording;
      if (message.type === "error") {
        if (activeSessionId === sessionId) {
          activeSessionId = undefined;
        }
        throw new Error(message.message);
      }
    },
    async stop(sessionId: string): Promise<VoiceOutboundMessage> {
      const pendingResult = waitFor(60000, (entry) => {
        if (!matchesVoiceSession(entry, sessionId)) {
          return false;
        }
        return entry.type === "final" || entry.type === "error";
      });
      send("stop", sessionId);
      const message = await pendingResult;
      if (activeSessionId === sessionId) {
        activeSessionId = undefined;
      }
      return message;
    },
    async cancel(sessionId?: string): Promise<void> {
      if (pending) {
        failPending(
          asError(
            "VOICE_NOT_RECORDING",
            undefined,
            sessionId ?? activeSessionId
          )
        );
      }
      if (!child) {
        return;
      }
      send("cancel", sessionId);
      if (sessionId && activeSessionId === sessionId) {
        activeSessionId = undefined;
      }
    },
    dispose(): void {
      pending = undefined;
      const proc = child;
      child = undefined;
      ready = false;
      if (proc?.exitCode === null) {
        proc.kill();
      }
    },
  };
}
