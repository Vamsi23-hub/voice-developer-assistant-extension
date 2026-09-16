import { execFile, ExecFileException } from "node:child_process";
import { GitCommandResult, GitRunner } from "../ports/ports";

const GIT_STATUS_TIMEOUT_MS = 10_000;

function exitCodeFromError(error: ExecFileException | null): number {
  if (!error) {
    return 0;
  }
  if (typeof error.code === "number") {
    return error.code;
  }
  return 1;
}

function isGitNotFound(error: ExecFileException | null): boolean {
  if (!error) {
    return false;
  }
  return error.code === "ENOENT" || error.message.includes("ENOENT");
}

export function createNodeGitRunner(): GitRunner {
  return {
    status(cwd: string): Promise<GitCommandResult> {
      return new Promise((resolve) => {
        execFile(
          "git", // NOSONAR S4036 - git is invoked by name without a shell
          ["status", "--porcelain=v2", "--branch"],
          {
            cwd,
            timeout: GIT_STATUS_TIMEOUT_MS,
            encoding: "utf8",
            windowsHide: true,
          },
          (error, stdout, stderr) => {
            resolve({
              stdout: stdout ?? "",
              stderr: stderr ?? "",
              code: exitCodeFromError(error),
              gitNotFound: isGitNotFound(error),
            });
          }
        );
      });
    },
  };
}
