import { Intent } from "./intent";
import { TrustedTerminalCommand } from "../ports/ports";

export const TRUSTED_GIT_STATUS_COMMAND: TrustedTerminalCommand = "git status";

export function trustedTerminalCommandForIntent(
  intent: Intent
): TrustedTerminalCommand | undefined {
  if (intent.kind === "gitStatus") {
    return TRUSTED_GIT_STATUS_COMMAND;
  }
  return undefined;
}

export function assertTrustedTerminalCommand(
  command: string
): asserts command is TrustedTerminalCommand {
  if (command !== TRUSTED_GIT_STATUS_COMMAND) {
    throw new Error("Refusing to send untrusted text to the terminal.");
  }
}
