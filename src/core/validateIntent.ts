import { Intent } from "./intent";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateIntent(intent: Intent): ValidationResult {
  switch (intent.kind) {
    case "unknown":
      return {
        ok: false,
        reason: `Unrecognized command: "${intent.text}".`,
      };
    case "openTerminal":
    case "gitStatus":
    case "openFile":
    case "openRepository":
      return { ok: true };
  }
}
