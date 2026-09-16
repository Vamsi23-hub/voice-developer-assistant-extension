import { describe, expect, it, vi } from "vitest";
import { CommandEngine } from "../src/core/commandEngine";
import { parseIntent } from "../src/core/parseIntent";
import {
  AliasStore,
  GitRunner,
  IdeAdapter,
  ResponseOutput,
} from "../src/ports/ports";
import {
  createVoiceFinalGate,
  executeRecognizedSpeech,
  handleVoiceStopResult,
  voiceActionShouldExecute,
} from "../src/speech/executeRecognizedSpeech";

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
  aliasMap: Record<string, string> = {}
) {
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
    getAll: vi.fn(async () => aliasMap),
    set: vi.fn(),
  };
  return {
    engine: new CommandEngine({ ide, git, aliases, output }),
    ide,
    git,
  };
}

describe("executeRecognizedSpeech", () => {
  it("opens a terminal exactly once for Open terminal.", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine(output);

    await executeRecognizedSpeech({
      transcript: "Open terminal.",
      aliases: [],
      engine,
      output,
    });

    expect(output.infos).toContain('Heard: "open terminal"');
    expect(output.infos).toContain("Opened terminal.");
    expect(ide.openTerminal).toHaveBeenCalledOnce();
    expect(ide.openTerminal).toHaveBeenCalledWith("/workspace/repo");
    expect(git.status).not.toHaveBeenCalled();
  });

  it("runs git status for a git status transcript", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine(output);

    await executeRecognizedSpeech({
      transcript: "git status",
      aliases: [],
      engine,
      output,
    });

    expect(output.infos).toContain('Heard: "git status"');
    expect(git.status).toHaveBeenCalledWith("/workspace/repo");
    expect(ide.openTerminal).not.toHaveBeenCalled();
  });

  it("opens a repository alias through the existing intent", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine(output, {
      "site visual builder": "/repos/site-visual-builder",
    });

    await executeRecognizedSpeech({
      transcript: "open site visual builder",
      aliases: ["site visual builder"],
      engine,
      output,
    });

    expect(output.infos).toContain('Heard: "open site visual builder"');
    expect(ide.openFolder).toHaveBeenCalledWith("/repos/site-visual-builder");
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
  });

  it("executes nothing for unsupported speech", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine(output);

    await executeRecognizedSpeech({
      transcript: "(buzzer buzzing)",
      aliases: [],
      engine,
      output,
    });

    expect(output.infos).toContain('Heard: "(buzzer buzzing)"');
    expect(output.errors).toEqual([
      'Unrecognized command: "(buzzer buzzing)".',
    ]);
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.openFile).not.toHaveBeenCalled();
    expect(ide.openFolder).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
  });

  it("executes nothing for an empty transcript", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine(output);

    await executeRecognizedSpeech({
      transcript: "   ...  ",
      aliases: [],
      engine,
      output,
    });

    expect(output.infos).toEqual([]);
    expect(output.errors).toEqual([
      "Speech recognition produced an empty transcript.",
    ]);
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
  });

  it("does not execute get status as git status", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine(output);

    await executeRecognizedSpeech({
      transcript: "get status",
      aliases: [],
      engine,
      output,
    });

    expect(output.infos).toContain('Heard: "get status"');
    expect(output.errors).toEqual(['Unrecognized command: "get status".']);
    expect(git.status).not.toHaveBeenCalled();
    expect(ide.openTerminal).not.toHaveBeenCalled();
  });

  it("keeps open dinner as openFile without rewriting dinner to terminal", async () => {
    const output = createOutput();
    const { engine, ide } = createEngine(output);

    await executeRecognizedSpeech({
      transcript: "open dinner",
      aliases: [],
      engine,
      output,
    });

    expect(output.infos).toContain('Heard: "open dinner"');
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.openFile).toHaveBeenCalledWith("dinner");
  });

  it("does not rewrite integral as terminal", async () => {
    const output = createOutput();
    const { engine, ide } = createEngine(output);

    await executeRecognizedSpeech({
      transcript: "open integral.",
      aliases: [],
      engine,
      output,
    });

    expect(output.infos).toContain('Heard: "open integral"');
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.openFile).toHaveBeenCalledWith("integral");
  });
});

describe("handleVoiceStopResult", () => {
  it("does not execute helper or STT errors", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine(output);

    await handleVoiceStopResult({
      result: {
        type: "error",
        code: "STT_FAILED",
        message: "Speech recognition failed.",
      },
      aliases: [],
      engine,
      output,
      gate: createVoiceFinalGate(),
    });

    expect(output.infos).toEqual([]);
    expect(output.errors).toEqual(["Speech recognition failed."]);
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
  });

  it("does not execute recording or ready protocol messages", async () => {
    const output = createOutput();
    const { engine, ide } = createEngine(output);
    const gate = createVoiceFinalGate();

    await handleVoiceStopResult({
      result: { type: "recording" },
      aliases: [],
      engine,
      output,
      gate,
    });
    await handleVoiceStopResult({
      result: { type: "ready" },
      aliases: [],
      engine,
      output,
      gate,
    });

    expect(output.infos).toEqual([]);
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(voiceActionShouldExecute("recording")).toBe(false);
    expect(voiceActionShouldExecute("cancel")).toBe(false);
    expect(voiceActionShouldExecute("error")).toBe(false);
    expect(voiceActionShouldExecute("final")).toBe(true);
  });

  it("does not execute twice for a duplicate final message", async () => {
    const output = createOutput();
    const { engine, ide } = createEngine(output);
    const gate = createVoiceFinalGate();
    const result = { type: "final" as const, text: "open terminal" };

    await handleVoiceStopResult({
      result,
      aliases: [],
      engine,
      output,
      gate,
    });
    await handleVoiceStopResult({
      result,
      aliases: [],
      engine,
      output,
      gate,
    });

    expect(ide.openTerminal).toHaveBeenCalledOnce();
  });
});

describe("InputBox command path", () => {
  it("still parses typed text through parseIntent and the engine", async () => {
    const output = createOutput();
    const { engine, ide } = createEngine(output);
    const intent = parseIntent("open terminal", { aliases: [] });
    await engine.execute(intent);
    expect(ide.openTerminal).toHaveBeenCalledOnce();
    expect(output.infos).toContain("Opened terminal.");
    expect(output.infos).not.toContain('Heard: "open terminal"');
  });
});
