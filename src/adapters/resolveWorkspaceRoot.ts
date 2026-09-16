import * as vscode from "vscode";
import { pickWorkspaceRoot } from "./workspacePaths";

function uriToFsPath(uri: vscode.Uri): string | undefined {
  if (uri.scheme === "untitled") {
    return undefined;
  }
  if (uri.fsPath) {
    return uri.fsPath;
  }
  if (uri.scheme === "file" && uri.path) {
    return uri.path;
  }
  return undefined;
}

function folderPathForUri(uri: vscode.Uri | undefined): string | undefined {
  if (!uri) {
    return undefined;
  }
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? uriToFsPath(folder.uri) : undefined;
}

function firstVisibleEditorFolder(): string | undefined {
  for (const editor of vscode.window.visibleTextEditors) {
    const fromVisible = folderPathForUri(editor.document.uri);
    if (fromVisible) {
      return fromVisible;
    }
  }
  return undefined;
}

/**
 * Resolves the current workspace/repository root.
 *
 * Order:
 * 1. Workspace folder that contains the active editor
 * 2. First workspace folder
 * 3. Extension development path, only when debugging this extension
 * 4. undefined (no workspace is open)
 */
export function resolveWorkspaceRoot(
  developmentFallback?: string
): string | undefined {
  const firstFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  return pickWorkspaceRoot({
    activeEditorFolder:
      folderPathForUri(vscode.window.activeTextEditor?.document.uri) ??
      firstVisibleEditorFolder(),
    firstWorkspaceFolder: firstFolder ? uriToFsPath(firstFolder) : undefined,
    developmentFallback,
  });
}

export function describeWorkspaceState(developmentFallback?: string): string {
  const folders = vscode.workspace.workspaceFolders;
  const folderDesc =
    folders
      ?.map(
        (folder) =>
          `${folder.uri.scheme}:${uriToFsPath(folder.uri) ?? folder.uri.toString()}`
      )
      .join(", ") ?? "(none)";
  const active =
    vscode.window.activeTextEditor?.document.uri.toString() ?? "(none)";
  return `folders=[${folderDesc}] activeEditor=${active} fallback=${developmentFallback ?? "(none)"}`;
}
