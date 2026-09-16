import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CommandEngine } from "../src/core/commandEngine";
import {
  AliasStore,
  GitRunner,
  IdeAdapter,
  ResponseOutput,
} from "../src/ports/ports";
import { SttClient } from "../src/speech/sttClient";
import { runSttFixture } from "../src/speech/runSttFixture";

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

function createEngine(output: ResponseOutput) {
  const ide: IdeAdapter = {
    openTerminal: vi.fn(),
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
    getAll: vi.fn(async () => ({})),
    set: vi.fn(),
  };
  return {
    engine: new CommandEngine({ ide, git, aliases, output }),
    ide,
    git,
  };
}

describe("runSttFixture pipeline", () => {
  it("normalizes a recognized open terminal transcript and reaches the existing engine", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine(output);
    const stt: SttClient = {
      transcribeWav: vi.fn(async () => ({
        type: "final" as const,
        text: "Open terminal.",
      })),
    };

    await runSttFixture({
      wavPath: "/tmp/open-terminal.wav",
      stt,
      aliases: [],
      engine,
      output,
    });

    expect(stt.transcribeWav).toHaveBeenCalledWith("/tmp/open-terminal.wav");
    expect(output.infos).toContain('Heard: "open terminal"');
    expect(ide.openTerminal).toHaveBeenCalledWith("/workspace/repo");
    expect(git.status).not.toHaveBeenCalled();
  });

  it("shows an STT error and does not execute a command", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine(output);
    const stt: SttClient = {
      transcribeWav: vi.fn(async () => ({
        type: "error" as const,
        message: "WAV file not found",
      })),
    };

    await runSttFixture({
      wavPath: "/tmp/missing.wav",
      stt,
      aliases: [],
      engine,
      output,
    });

    expect(output.infos).toEqual([]);
    expect(output.errors).toEqual([
      "Speech recognition failed: WAV file not found",
    ]);
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.openFile).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
  });

  it("uses existing unknown-command behavior for an unrecognized transcript", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine(output);
    const stt: SttClient = {
      transcribeWav: vi.fn(async () => ({
        type: "final" as const,
        text: "please reboot the server",
      })),
    };

    await runSttFixture({
      wavPath: "/tmp/unknown.wav",
      stt,
      aliases: [],
      engine,
      output,
    });

    expect(output.infos).toContain('Heard: "please reboot the server"');
    expect(output.errors).toEqual([
      'Unrecognized command: "please reboot the server".',
    ]);
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.openFile).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
  });

  it("does not substitute integral for terminal", async () => {
    const output = createOutput();
    const { engine, ide } = createEngine(output);
    const stt: SttClient = {
      transcribeWav: vi.fn(async () => ({
        type: "final" as const,
        text: "open integral.",
      })),
    };

    await runSttFixture({
      wavPath: "/tmp/open-terminal.wav",
      stt,
      aliases: [],
      engine,
      output,
    });

    expect(output.infos).toContain('Heard: "open integral"');
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.openFile).toHaveBeenCalledWith("integral");
  });
});

describe("extension host STT sources", () => {
  it("does not import sherpa-onnx-node or add microphone capture", () => {
    const srcRoot = path.join(process.cwd(), "src");
    const files: string[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (entry.name.endsWith(".ts")) {
          files.push(full);
        }
      }
    }
    walk(srcRoot);
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toMatch(
      /from ["']sherpa-onnx-node["']|require\(["']sherpa-onnx-node["']\)/
    );
    expect(combined).not.toMatch(
      /from ["']node-cpal["']|require\(["']node-cpal["']\)/
    );
    expect(combined).not.toMatch(
      /getUserMedia|MediaRecorder|webkitSpeechRecognition/i
    );
    const ptt = readFileSync(
      path.join(srcRoot, "input", "pushToTalk.ts"),
      "utf8"
    );
    const controller = readFileSync(
      path.join(srcRoot, "speech", "pttController.ts"),
      "utf8"
    );
    expect(ptt).toMatch(/createPttController/);
    expect(controller).toMatch(/handleVoiceStopResult|executeRecognizedSpeech/);
    expect(ptt).not.toMatch(
      /parseIntent|validateIntent|sendText|shell:\s*true|\beval\s*\(/
    );
    expect(controller).not.toMatch(
      /parseIntent|validateIntent|sendText|shell:\s*true|\beval\s*\(/
    );
  });
});
