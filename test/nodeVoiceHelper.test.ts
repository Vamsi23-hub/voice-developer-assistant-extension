import { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  createNodeVoiceHelper,
  SpawnFn,
} from "../src/adapters/nodeVoiceHelper";

type FakeChild = EventEmitter & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  killed: boolean;
  exitCode: number | null;
  kill: () => boolean;
};

function createFakeChild(options?: {
  onCommand?: (type: string, child: FakeChild, id?: string) => void;
}): FakeChild {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = new EventEmitter() as FakeChild;
  child.stdin = stdin;
  child.stdout = stdout;
  child.stderr = stderr;
  child.killed = false;
  child.exitCode = null;
  child.kill = () => {
    child.killed = true;
    child.exitCode = 0;
    child.emit("exit", 0);
    return true;
  };
  stdin.on("data", (chunk: Buffer | string) => {
    for (const line of String(chunk).split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const parsed = JSON.parse(trimmed) as { type: string; id?: string };
      options?.onCommand?.(parsed.type, child, parsed.id);
    }
  });
  return child;
}

function tempExtensionRoot(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "vda-voice-helper-"));
  mkdirSync(path.join(dir, "dist-helper"));
  writeFileSync(path.join(dir, "dist-helper", "voice.mjs"), "");
  return dir;
}

describe("nodeVoiceHelper protocol client", () => {
  const helpers: Array<{ dispose(): void }> = [];

  afterEach(() => {
    while (helpers.length > 0) {
      helpers.pop()?.dispose();
    }
  });

  it("starts, records, and returns a final transcript without executing it", async () => {
    const extensionRoot = tempExtensionRoot();
    let recording = false;
    const child = createFakeChild({
      onCommand(type, current, id) {
        if (type === "start") {
          recording = true;
          current.stdout.write(
            `${JSON.stringify({ type: "recording", ...(id ? { id } : {}) })}\n`
          );
          return;
        }
        if (type === "stop") {
          recording = false;
          current.stdout.write(
            `${JSON.stringify({
              type: "final",
              text: "open terminal",
              ...(id ? { id } : {}),
            })}\n`
          );
        }
      },
    });
    const spawnImpl: SpawnFn = () => {
      queueMicrotask(() => child.stdout.write('{"type":"ready"}\n'));
      return child as unknown as ChildProcessWithoutNullStreams;
    };
    const client = createNodeVoiceHelper({
      extensionRoot,
      modelDir: "/models/base.en",
      nativeLibDir: "/native/lib",
      nodeExecutable: "/usr/local/bin/node",
      spawnImpl,
    });
    helpers.push(client);

    await client.start("1");
    expect(recording).toBe(true);
    await expect(client.stop("1")).resolves.toEqual({
      type: "final",
      text: "open terminal",
      id: "1",
    });
    expect(recording).toBe(false);
  });

  it("returns MIC_ALREADY_ACTIVE when start is sent while recording", async () => {
    const extensionRoot = tempExtensionRoot();
    let recording = false;
    const child = createFakeChild({
      onCommand(type, current) {
        if (type === "start" && recording) {
          current.stdout.write(
            '{"type":"error","code":"MIC_ALREADY_ACTIVE","message":"Push-to-talk is already recording."}\n'
          );
          return;
        }
        if (type === "start") {
          recording = true;
          current.stdout.write('{"type":"recording"}\n');
        }
      },
    });
    const spawnImpl: SpawnFn = () => {
      queueMicrotask(() => child.stdout.write('{"type":"ready"}\n'));
      return child as unknown as ChildProcessWithoutNullStreams;
    };
    const client = createNodeVoiceHelper({
      extensionRoot,
      modelDir: "/models/base.en",
      nativeLibDir: "/native/lib",
      nodeExecutable: "node",
      spawnImpl,
    });
    helpers.push(client);

    await client.start("1");
    await expect(client.start("2")).rejects.toThrow(/already recording/);
  });

  it("returns VOICE_NOT_RECORDING when stop is sent while idle", async () => {
    const extensionRoot = tempExtensionRoot();
    const child = createFakeChild({
      onCommand(type, current) {
        if (type === "stop") {
          current.stdout.write(
            '{"type":"error","code":"VOICE_NOT_RECORDING","message":"Push-to-talk is not recording."}\n'
          );
        }
      },
    });
    const spawnImpl: SpawnFn = () => {
      queueMicrotask(() => child.stdout.write('{"type":"ready"}\n'));
      return child as unknown as ChildProcessWithoutNullStreams;
    };
    const client = createNodeVoiceHelper({
      extensionRoot,
      modelDir: "/models/base.en",
      nativeLibDir: "/native/lib",
      nodeExecutable: "node",
      spawnImpl,
    });
    helpers.push(client);

    await client.ensureReady();
    await expect(client.stop("1")).resolves.toEqual({
      type: "error",
      code: "VOICE_NOT_RECORDING",
      message: "Push-to-talk is not recording.",
    });
  });

  it("sends cancel and does not wait for a transcript", async () => {
    const extensionRoot = tempExtensionRoot();
    const commands: string[] = [];
    const child = createFakeChild({
      onCommand(type, current) {
        commands.push(type);
        if (type === "start") {
          current.stdout.write('{"type":"recording"}\n');
        }
      },
    });
    const spawnImpl: SpawnFn = () => {
      queueMicrotask(() => child.stdout.write('{"type":"ready"}\n'));
      return child as unknown as ChildProcessWithoutNullStreams;
    };
    const client = createNodeVoiceHelper({
      extensionRoot,
      modelDir: "/models/base.en",
      nativeLibDir: "/native/lib",
      nodeExecutable: "node",
      spawnImpl,
    });
    helpers.push(client);

    await client.start("1");
    await client.cancel("1");
    expect(commands).toEqual(["start", "cancel"]);
  });

  it("maps a helper crash to HELPER_CRASHED", async () => {
    const extensionRoot = tempExtensionRoot();
    const child = createFakeChild();
    const spawnImpl: SpawnFn = () => {
      queueMicrotask(() => {
        child.exitCode = 1;
        child.emit("exit", 1);
      });
      return child as unknown as ChildProcessWithoutNullStreams;
    };
    const client = createNodeVoiceHelper({
      extensionRoot,
      modelDir: "/models/base.en",
      nativeLibDir: "/native/lib",
      nodeExecutable: "node",
      spawnImpl,
    });
    helpers.push(client);

    await expect(client.ensureReady()).rejects.toThrow(/crashed/);
  });

  it("surfaces an unsolicited stream error while recording", async () => {
    const extensionRoot = tempExtensionRoot();
    const errors: Array<{ code: string; message: string }> = [];
    const child = createFakeChild({
      onCommand(type, current) {
        if (type === "start") {
          current.stdout.write('{"type":"recording"}\n');
        }
      },
    });
    const spawnImpl: SpawnFn = () => {
      queueMicrotask(() => child.stdout.write('{"type":"ready"}\n'));
      return child as unknown as ChildProcessWithoutNullStreams;
    };
    const client = createNodeVoiceHelper({
      extensionRoot,
      modelDir: "/models/base.en",
      nativeLibDir: "/native/lib",
      nodeExecutable: "node",
      spawnImpl,
      onProtocolError(message) {
        errors.push(message);
      },
    });
    helpers.push(client);

    await client.start("1");
    child.stdout.write(
      '{"type":"error","code":"MIC_STREAM_FAILED","message":"Could not capture from the microphone: A buffer underrun or overrun occurred."}\n'
    );
    await expect.poll(() => errors.length).toBe(1);
    expect(errors).toEqual([
      {
        type: "error",
        code: "MIC_STREAM_FAILED",
        message:
          "Could not capture from the microphone: A buffer underrun or overrun occurred.",
      },
    ]);
  });

  it("ignores a stale final from another session while waiting to stop", async () => {
    const extensionRoot = tempExtensionRoot();
    const child = createFakeChild({
      onCommand(type, current, id) {
        if (type === "start") {
          current.stdout.write(
            `${JSON.stringify({ type: "recording", id })}\n`
          );
          return;
        }
        if (type === "stop") {
          current.stdout.write(
            '{"type":"final","text":"stale transcript","id":"old"}\n'
          );
          current.stdout.write(
            `${JSON.stringify({
              type: "final",
              text: "git status",
              id,
            })}\n`
          );
        }
      },
    });
    const spawnImpl: SpawnFn = () => {
      queueMicrotask(() => child.stdout.write('{"type":"ready"}\n'));
      return child as unknown as ChildProcessWithoutNullStreams;
    };
    const client = createNodeVoiceHelper({
      extensionRoot,
      modelDir: "/models/base.en",
      nativeLibDir: "/native/lib",
      nodeExecutable: "node",
      spawnImpl,
    });
    helpers.push(client);

    await client.start("7");
    await expect(client.stop("7")).resolves.toEqual({
      type: "final",
      text: "git status",
      id: "7",
    });
  });
});
