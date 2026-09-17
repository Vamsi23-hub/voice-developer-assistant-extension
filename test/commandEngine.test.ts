import { describe, expect, it, vi } from "vitest";
import { CommandEngine } from "../src/core/commandEngine";
import {
  AliasStore,
  GitRunner,
  IdeAdapter,
  ResponseOutput,
} from "../src/ports/ports";

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

function createEngine(overrides: {
  ide?: Partial<IdeAdapter>;
  git?: Partial<GitRunner>;
  aliases?: Partial<AliasStore>;
  output?: ResponseOutput;
}) {
  const output = overrides.output ?? createOutput();
  const ide: IdeAdapter = {
    openTerminal: vi.fn(),
    runTrustedTerminalCommand: vi.fn(),
    openFile: vi.fn(),
    openFolder: vi.fn(),
    getWorkspaceRoot: vi.fn(() => "/workspace/repo"),
    ...overrides.ide,
  };
  const git: GitRunner = {
    status: vi.fn(async () => ({
      stdout: "# branch.head main\n",
      stderr: "",
      code: 0,
    })),
    ...overrides.git,
  };
  const aliases: AliasStore = {
    getAll: vi.fn(async () => ({})),
    set: vi.fn(),
    ...overrides.aliases,
  };
  return {
    engine: new CommandEngine({ ide, git, aliases, output }),
    ide,
    git,
    aliases,
    output,
  };
}

describe("CommandEngine", () => {
  it("opens the terminal at the resolved workspace root", async () => {
    const { engine, ide } = createEngine({});
    await engine.execute({ kind: "openTerminal" });
    expect(ide.openTerminal).toHaveBeenCalledWith("/workspace/repo");
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
  });

  it("does not open a terminal when no workspace is open", async () => {
    const output = createOutput();
    const { engine, ide } = createEngine({
      ide: { getWorkspaceRoot: () => undefined },
      output,
    });
    await engine.execute({ kind: "openTerminal" });
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(output.errors).toEqual(["No workspace is open."]);
  });

  it("runs the trusted git status command in a workspace terminal", async () => {
    const { engine, ide, git } = createEngine({});
    await engine.execute({ kind: "gitStatus" });
    expect(ide.runTrustedTerminalCommand).toHaveBeenCalledWith(
      "git status",
      "/workspace/repo"
    );
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
  });

  it("does not run git status when no workspace is open", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine({
      ide: { getWorkspaceRoot: () => undefined },
      output,
    });
    await engine.execute({ kind: "gitStatus" });
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
    expect(output.errors).toEqual(["No workspace is open."]);
  });

  it("does not send arbitrary recognized text to the terminal", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine({ output });
    await engine.execute({ kind: "unknown", text: "rm -rf /" });
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
    expect(output.errors).toEqual(['Unrecognized command: "rm -rf /".']);
  });

  it("does not invoke a terminal for openFile", async () => {
    const { engine, ide, git } = createEngine({});
    await engine.execute({ kind: "openFile", filename: "readme.md" });
    expect(ide.openFile).toHaveBeenCalledWith("readme.md");
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
  });

  it("opens a repository when the alias matches after hyphen/space normalization", async () => {
    const { engine, ide } = createEngine({
      aliases: {
        getAll: vi.fn(async () => ({
          "site visual builder": "/Projects/Nuskin/site-visual-builder",
        })),
      },
    });
    await engine.execute({
      kind: "openRepository",
      alias: "site-visual-builder",
    });
    expect(ide.openFolder).toHaveBeenCalledWith(
      "/Projects/Nuskin/site-visual-builder"
    );
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
  });

  it("does not treat an unknown repository as a filename", async () => {
    const output = createOutput();
    const { engine, ide } = createEngine({ output });
    await engine.execute({
      kind: "openRepository",
      alias: "some unknown project",
    });
    expect(ide.openFile).not.toHaveBeenCalled();
    expect(ide.openFolder).not.toHaveBeenCalled();
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.runTrustedTerminalCommand).not.toHaveBeenCalled();
    expect(output.errors).toEqual([
      'Repository alias "some unknown project" was not found. Use "Voice Developer Assistant: Set Repository Alias" first.',
    ]);
  });
});
