import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { normalizeAlias } from "../core/normalizeAlias";

export type RepositoryAliasSelection = {
  alias: string;
  folderPath: string;
};

export async function promptForRepositoryAlias(): Promise<
  RepositoryAliasSelection | undefined
> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select Repository",
    title: "Select a repository folder",
  });
  const folderUri = selected?.[0];
  if (!folderUri) {
    return undefined;
  }

  const folderPath = folderUri.fsPath;
  if (!fs.existsSync(folderPath)) {
    return undefined;
  }

  const suggested = path.basename(folderPath);
  const aliasInput = await vscode.window.showInputBox({
    prompt: "Repository alias",
    value: suggested,
    placeHolder: suggested,
    ignoreFocusOut: true,
  });
  if (!aliasInput?.trim()) {
    return undefined;
  }

  const alias = normalizeAlias(aliasInput);
  if (!alias) {
    return undefined;
  }

  return { alias, folderPath };
}
