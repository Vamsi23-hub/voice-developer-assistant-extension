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

  it("runs git status against the same resolved workspace root", async () => {
    const { engine, git } = createEngine({});
    await engine.execute({ kind: "gitStatus" });
    expect(git.status).toHaveBeenCalledWith("/workspace/repo");
  });

  it("does not run git status when no workspace is open", async () => {
    const output = createOutput();
    const { engine, git } = createEngine({
      ide: { getWorkspaceRoot: () => undefined },
      output,
    });
    await engine.execute({ kind: "gitStatus" });
    expect(git.status).not.toHaveBeenCalled();
    expect(output.errors).toEqual(["No workspace is open."]);
  });

  it("shows a clear error when the workspace is not a git repository", async () => {
    const output = createOutput();
    const { engine } = createEngine({
      git: {
        status: vi.fn(async () => ({
          stdout: "",
          stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
          code: 128,
        })),
      },
      output,
    });
    await engine.execute({ kind: "gitStatus" });
    expect(output.errors).toEqual(["This workspace is not a Git repository."]);
  });

  it("shows a clear error when git cannot be found", async () => {
    const output = createOutput();
    const { engine } = createEngine({
      git: {
        status: vi.fn(async () => ({
          stdout: "",
          stderr: "",
          code: 1,
          gitNotFound: true,
        })),
      },
      output,
    });
    await engine.execute({ kind: "gitStatus" });
    expect(output.errors).toEqual([
      "Git was not found. Make sure Git is installed and on your PATH.",
    ]);
  });

  it("does not execute unknown commands", async () => {
    const output = createOutput();
    const { engine, ide, git } = createEngine({ output });
    await engine.execute({ kind: "unknown", text: "rm -rf /" });
    expect(ide.openTerminal).not.toHaveBeenCalled();
    expect(ide.openFile).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
    expect(output.errors).toEqual(['Unrecognized command: "rm -rf /".']);
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
    expect(output.errors).toEqual([
      'Repository alias "some unknown project" was not found. Use "Voice Developer Assistant: Set Repository Alias" first.',
    ]);
  });
});
