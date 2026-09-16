export interface IdeAdapter {
  openTerminal(cwd?: string): Promise<void>;
  openFile(filename: string): Promise<void>;
  openFolder(absolutePath: string): Promise<void>;
  getWorkspaceRoot(): string | undefined;
}

export type GitCommandResult = {
  stdout: string;
  stderr: string;
  code: number;
  gitNotFound?: boolean;
};

export interface GitRunner {
  status(cwd: string): Promise<GitCommandResult>;
}

export interface AliasStore {
  getAll(): Promise<Record<string, string>>;
  set(alias: string, absolutePath: string): Promise<void>;
}

export interface ResponseOutput {
  info(message: string): Promise<void>;
  error(message: string): Promise<void>;
  gitOutput(formatted: string): Promise<void>;
  debug(message: string): void;
}
