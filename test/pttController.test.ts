import { describe, expect, it, vi } from "vitest";
import { CommandEngine } from "../src/core/commandEngine";
import {
  AliasStore,
  GitRunner,
  IdeAdapter,
  ResponseOutput,
} from "../src/ports/ports";
import {
  createPttController,
  PttControllerState,
  VOICE_BUSY_MESSAGE,
} from "../src/speech/pttController";
import { VoiceClient } from "../src/speech/voiceClient";
import { VoiceOutboundMessage } from "../src/speech/pttProtocol";

function createOutput(): ResponseOutput & {
  errors: string[];
  infos: string[];
  debugs: string[];
} {
  const errors: string[] = [];
  const infos: string[] = [];
  const debugs: string[] = [];
  return {
    errors,
    infos,
    debugs,
    debug(message: string) {
      debugs.push(message);
    },
    async info(message: string) {
      infos.push(message);
    },
    async error(message: string) {
      errors.push(message);
    },
    async gitOutput() {},
  };
}

function createEngine(
  output: ResponseOutput,
  options?: {
    runTrustedTerminalCommand?: IdeAdapter["runTrustedTerminalCommand"];
    aliasMap?: Record<string, string>;
  }
) {
  const ide: IdeAdapter = {
    openTerminal: vi.fn(),
    runTrustedTerminalCommand: options?.runTrustedTerminalCommand ?? vi.fn(),
    openFile: vi.fn(),
    openFolder: vi.fn(),
    getWorkspaceRoot: vi.fn(() => "/workspace/repo"),
  };
  const git: GitRunner = {
    status: vi.fn(async () => ({
      stdout: "# branch.head main\n",
      stderr: "",
      code: 0,
    })),
  };
  const aliases: AliasStore = {
    getAll: vi.fn(async () => options?.aliasMap ?? {}),
    set: vi.fn(),
  };
  return {
    engine: new CommandEngine({ ide, git, aliases, output }),
    ide,
    git,
    aliases,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createFakeClient(options?: {
  onStart?: (sessionId: string) => Promise<void> | void;
  onStop?: (sessionId: string) => Promise<VoiceOutboundMessage>;
  onCancel?: (sessionId?: string) => Promise<void> | void;
}): VoiceClient & {
  started: string[];
  stopped: string[];
  cancelled: Array<string | undefined>;
  pendingStop?: ReturnType<typeof createDeferred<VoiceOutboundMessage>>;
} {
  const started: string[] = [];
  const stopped: string[] = [];
  const cancelled: Array<string | undefined> = [];
  const client = {
    started,
    stopped,
    cancelled,
    pendingStop: undefined as
      | ReturnType<typeof createDeferred<VoiceOutboundMessage>>
      | undefined,
    async ensureReady() {},
    async start(sessionId: string) {
      started.push(sessionId);
      await options?.onStart?.(sessionId);
    },
    async stop(sessionId: string) {
      stopped.push(sessionId);
      if (options?.onStop) {
        return options.onStop(sessionId);
      }
      const pending = createDeferred<VoiceOutboundMessage>();
      client.pendingStop = pending;
      return pending.promise;
    },
    async cancel(sessionId?: string) {
      cancelled.push(sessionId);
      await options?.onCancel?.(sessionId);
    },
    dispose() {},
  };
  return client;
}

describe("pttController serialization", () => {
  it("rejects Start while RECORDING", async () => {
    const output = createOutput();
    const { engine, aliases, ide } = createEngine(output);
    const startGate = createDeferred<void>();
    const client = createFakeClient({
      onStart: () => startGate.promise,
    });
    const states: PttControllerState[] = [];
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
      onStateChange: (state) => states.push(state),
    });

    const starting = controller.start();
    await expect.poll(() => controller.state()).toBe("recording");
    await controller.start();
    expect(output.errors).toEqual([VOICE_BUSY_MESSAGE]);
    expect(client.started).toEqual(["1"]);
    expect(controller.state()).toBe("recording");
    startGate.resolve();
    await starting;
    expect(controller.state()).toBe("recording");
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(states).toEqual(["recording"]);
  });

  it("rejects Start while PROCESSING_AUDIO", async () => {
    const output = createOutput();
    const { engine, aliases, ide } = createEngine(output);
    const client = createFakeClient();
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
    });

    await controller.start();
    const stopping = controller.stop();
    await expect.poll(() => controller.state()).toBe("processingAudio");
    await controller.start();
    expect(output.errors).toEqual([VOICE_BUSY_MESSAGE]);
    expect(client.started).toEqual(["1"]);
    expect(controller.state()).toBe("processingAudio");
    client.pendingStop?.resolve({
      type: "final",
      text: "git status",
      id: "1",
    });
    await stopping;
    expect(controller.state()).toBe("idle");
    expect(ide.runTrustedTerminalCommand).toHaveBeenCalledOnce();
    expect(ide.runTrustedTerminalCommand).toHaveBeenCalledWith(
      "git status",
      "/workspace/repo"
    );
  });

  it("rejects Start while PROCESSING_INTENT", async () => {
    const output = createOutput();
    const runGate = createDeferred<void>();
    const { engine, aliases, ide } = createEngine(output, {
      runTrustedTerminalCommand: vi.fn(() => runGate.promise),
    });
    const client = createFakeClient({
      onStop: async (sessionId) => ({
        type: "final",
        text: "git status",
        id: sessionId,
      }),
    });
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
    });

    await controller.start();
    const stopping = controller.stop();
    await expect.poll(() => controller.state()).toBe("processingIntent");
    await controller.start();
    expect(output.errors).toEqual([VOICE_BUSY_MESSAGE]);
    expect(client.started).toEqual(["1"]);
    expect(controller.state()).toBe("processingIntent");
    runGate.resolve();
    await stopping;
    expect(controller.state()).toBe("idle");
    expect(ide.runTrustedTerminalCommand).toHaveBeenCalledOnce();
  });

  it("awaits command execution before returning to IDLE", async () => {
    const output = createOutput();
    const runGate = createDeferred<void>();
    const { engine, aliases } = createEngine(output, {
      runTrustedTerminalCommand: vi.fn(() => runGate.promise),
    });
    const client = createFakeClient({
      onStop: async (sessionId) => ({
        type: "final",
        text: "git status",
        id: sessionId,
      }),
    });
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
    });

    await controller.start();
    const stopping = controller.stop();
    await expect.poll(() => controller.state()).toBe("processingIntent");
    expect(controller.state()).not.toBe("idle");
    runGate.resolve();
    await stopping;
    expect(controller.state()).toBe("idle");
  });

  it("returns to IDLE for an unknown transcript without executing", async () => {
    const output = createOutput();
    const { engine, aliases, ide, git } = createEngine(output);
    const client = createFakeClient({
      onStop: async (sessionId) => ({
        type: "final",
        text: "get status",
        id: sessionId,
      }),
    });
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
    });

    await controller.start();
    await controller.stop();
    expect(controller.state()).toBe("idle");
    expect(output.infos).toContain('Heard: "get status"');
    expect(output.errors).toEqual(['Unrecognized command: "get status".']);
    expect(git.status).not.toHaveBeenCalled();
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
  });

  it("keeps open dinner as openFile without semantic correction", async () => {
    const output = createOutput();
    const { engine, aliases, ide, git } = createEngine(output);
    const client = createFakeClient({
      onStop: async (sessionId) => ({
        type: "final",
        text: "open dinner",
        id: sessionId,
      }),
    });
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
    });

    await controller.start();
    await controller.stop();
    expect(controller.state()).toBe("idle");
    expect(output.infos).toContain('Heard: "open dinner"');
    expect(ide.openFile).toHaveBeenCalledWith("dinner");
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
  });

  it("returns to IDLE after a command failure", async () => {
    const output = createOutput();
    const { engine, aliases, ide } = createEngine(output, {
      runTrustedTerminalCommand: vi.fn(async () => {
        throw new Error("git failed");
      }),
    });
    const client = createFakeClient({
      onStop: async (sessionId) => ({
        type: "final",
        text: "git status",
        id: sessionId,
      }),
    });
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
    });

    await controller.start();
    await controller.stop();
    expect(controller.state()).toBe("idle");
    expect(output.errors).toEqual(["git failed"]);
    expect(ide.runTrustedTerminalCommand).toHaveBeenCalledOnce();
  });

  it("returns to IDLE after a helper or STT failure", async () => {
    const output = createOutput();
    const { engine, aliases, ide, git } = createEngine(output);
    const client = createFakeClient({
      onStop: async (sessionId) => ({
        type: "error",
        code: "STT_FAILED",
        message: "Speech recognition failed.",
        id: sessionId,
      }),
    });
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
    });

    await controller.start();
    await controller.stop();
    expect(controller.state()).toBe("idle");
    expect(output.errors).toEqual(["Speech recognition failed."]);
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
  });

  it("Cancel discards the recording, executes nothing, and returns to IDLE", async () => {
    const output = createOutput();
    const { engine, aliases, ide, git } = createEngine(output);
    const client = createFakeClient();
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
    });

    await controller.start();
    expect(controller.state()).toBe("recording");
    await controller.cancel();
    expect(controller.state()).toBe("idle");
    expect(client.cancelled).toEqual(["1"]);
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
    expect(output.infos).toEqual([]);
  });

  it("ignores a stale final from an earlier session", async () => {
    const output = createOutput();
    const { engine, aliases, ide, git } = createEngine(output);
    const client = createFakeClient();
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
    });

    await controller.start();
    const firstStop = controller.stop();
    await expect.poll(() => controller.state()).toBe("processingAudio");
    await controller.cancel();
    expect(controller.state()).toBe("idle");
    await controller.start();
    expect(controller.state()).toBe("recording");
    expect(controller.activeSessionId()).toBe("2");
    client.pendingStop?.resolve({
      type: "final",
      text: "open terminal",
      id: "1",
    });
    await firstStop;
    expect(controller.state()).toBe("recording");
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
    expect(output.infos).toEqual([]);
  });

  it("executes a command at most once for one final transcript", async () => {
    const output = createOutput();
    const { engine, aliases, ide } = createEngine(output);
    const client = createFakeClient({
      onStop: async (sessionId) => ({
        type: "final",
        text: "open terminal",
        id: sessionId,
      }),
    });
    const controller = createPttController({
      client,
      output,
      engine,
      aliases,
    });

    await controller.start();
    await controller.stop();
    await controller.stop();
    expect(controller.state()).toBe("idle");
    expect(ide.openTerminal).toHaveBeenCalledOnce();
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
    expect(output.infos.filter((line) => line.startsWith("Heard:"))).toEqual([
      'Heard: "open terminal"',
    ]);
  });
});
