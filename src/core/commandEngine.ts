import { Intent } from "./intent";
import { aliasesMatch } from "./normalizeAlias";
import { formatGitStatus, parseGitStatus } from "./parseGitStatus";
import { validateIntent } from "./validateIntent";
import {
  AliasStore,
  GitCommandResult,
  GitRunner,
  IdeAdapter,
  ResponseOutput,
} from "../ports/ports";

export type CommandEngineDeps = {
  ide: IdeAdapter;
  git: GitRunner;
  aliases: AliasStore;
  output: ResponseOutput;
};

const NO_WORKSPACE_ERROR = "No workspace is open.";
const GIT_NOT_FOUND_ERROR =
  "Git was not found. Make sure Git is installed and on your PATH.";
const NOT_A_GIT_REPO_ERROR = "This workspace is not a Git repository.";

function resolveAlias(
  aliases: Record<string, string>,
  alias: string
): string | undefined {
  for (const [name, folderPath] of Object.entries(aliases)) {
    if (aliasesMatch(name, alias)) {
      return folderPath;
    }
  }
  return undefined;
}

function unknownRepositoryMessage(alias: string): string {
  return `Repository alias "${alias}" was not found. Use "Voice Developer Assistant: Set Repository Alias" first.`;
}

export class CommandEngine {
  constructor(private readonly deps: CommandEngineDeps) {}

  async execute(intent: Intent): Promise<void> {
    this.deps.output.debug(`parsed intent kind: ${intent.kind}`);

    const validation = validateIntent(intent);
    if (!validation.ok) {
      this.deps.output.debug(`validation failed: ${validation.reason}`);
      await this.deps.output.error(validation.reason);
      return;
    }

    try {
      await this.dispatch(intent);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Command failed.";
      this.deps.output.debug(`command execution error: ${message}`);
      await this.deps.output.error(message);
    }
  }

  private async dispatch(intent: Intent): Promise<void> {
    switch (intent.kind) {
      case "openTerminal":
        await this.handleOpenTerminal();
        return;
      case "gitStatus":
        await this.handleGitStatus();
        return;
      case "openFile":
        await this.handleOpenFile(intent.filename);
        return;
      case "openRepository":
        await this.handleOpenRepository(intent.alias);
        return;
      case "unknown":
        await this.deps.output.error(
          `Unrecognized command: "${intent.text}".`
        );
        return;
    }
  }

  private async handleOpenTerminal(): Promise<void> {
    const root = this.requireWorkspaceRoot();
    if (!root) {
      await this.deps.output.error(NO_WORKSPACE_ERROR);
      return;
    }
    await this.deps.ide.openTerminal(root);
    this.deps.output.debug("command execution result: opened terminal");
    await this.deps.output.info("Opened terminal.");
  }

  private async handleGitStatus(): Promise<void> {
    const root = this.requireWorkspaceRoot();
    if (!root) {
      await this.deps.output.error(NO_WORKSPACE_ERROR);
      return;
    }
    this.deps.output.debug(`git cwd: ${root}`);
    const result = await this.deps.git.status(root);
    this.logGitResult(result);
    if (await this.reportGitFailure(result)) {
      return;
    }
    const parsed = parseGitStatus(result.stdout);
    await this.deps.output.gitOutput(formatGitStatus(parsed));
  }

  private async handleOpenFile(filename: string): Promise<void> {
    const root = this.requireWorkspaceRoot();
    if (!root) {
      await this.deps.output.error(NO_WORKSPACE_ERROR);
      return;
    }
    await this.deps.ide.openFile(filename);
    this.deps.output.debug(`command execution result: opened file ${filename}`);
  }

  private async handleOpenRepository(alias: string): Promise<void> {
    const all = await this.deps.aliases.getAll();
    const folderPath = resolveAlias(all, alias);
    if (!folderPath) {
      this.deps.output.debug(`command execution error: unknown alias ${alias}`);
      await this.deps.output.error(unknownRepositoryMessage(alias));
      return;
    }
    await this.deps.ide.openFolder(folderPath);
    this.deps.output.debug(
      `command execution result: opened repository ${alias}`
    );
    await this.deps.output.info(`Opened repository "${alias}".`);
  }

  private logGitResult(result: GitCommandResult): void {
    const notFound = result.gitNotFound ? " gitNotFound=true" : "";
    this.deps.output.debug(
      `command execution result: git status code=${result.code}${notFound}`
    );
  }

  private async reportGitFailure(result: GitCommandResult): Promise<boolean> {
    if (result.gitNotFound) {
      await this.deps.output.error(GIT_NOT_FOUND_ERROR);
      return true;
    }
    if (result.code === 0) {
      return false;
    }
    const stderr = result.stderr.trim();
    const detail = stderr || `exit ${result.code}`;
    this.deps.output.debug(`command execution error: ${detail}`);
    if (/not a git repository/i.test(stderr)) {
      await this.deps.output.error(NOT_A_GIT_REPO_ERROR);
      return true;
    }
    await this.deps.output.error(
      stderr || `git status exited with code ${result.code}.`
    );
    return true;
  }

  private requireWorkspaceRoot(): string | undefined {
    const root = this.deps.ide.getWorkspaceRoot();
    this.deps.output.debug(`resolved workspace root: ${root ?? "(none)"}`);
    return root;
  }
}
