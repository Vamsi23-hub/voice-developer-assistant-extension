import * as vscode from "vscode";
import { normalizeAlias } from "../core/normalizeAlias";
import { AliasStore } from "../ports/ports";

export const REPOSITORY_ALIASES_STATE_KEY =
  "voiceDeveloperAssistant.repositoryAliases";

export class VscodeAliasStore implements AliasStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getAll(): Promise<Record<string, string>> {
    return (
      this.context.globalState.get<Record<string, string>>(
        REPOSITORY_ALIASES_STATE_KEY
      ) ?? {}
    );
  }

  async set(alias: string, absolutePath: string): Promise<void> {
    const key = normalizeAlias(alias);
    const all = await this.getAll();
    const next: Record<string, string> = {};
    for (const [name, folderPath] of Object.entries(all)) {
      if (normalizeAlias(name) !== key) {
        next[name] = folderPath;
      }
    }
    next[key] = absolutePath;
    await this.context.globalState.update(REPOSITORY_ALIASES_STATE_KEY, next);
  }
}
