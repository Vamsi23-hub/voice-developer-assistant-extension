import * as path from "node:path";
import * as vscode from "vscode";
import { IdeAdapter } from "../ports/ports";
import { resolveWorkspaceRoot } from "./resolveWorkspaceRoot";
import { findFilesOnDisk } from "./workspacePaths";

const TERMINAL_NAME = "Voice Developer Assistant";

const FILE_SEARCH_EXCLUDE =
  "{**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/.git/**}";

function toPosix(filename: string): string {
  return filename.replaceAll("\\", "/");
}

function globForFilename(filename: string): string {
  const posixName = toPosix(filename);
  if (posixName.includes("/")) {
    return posixName.startsWith("**/") ? posixName : `**/${posixName}`;
  }
  return `**/${posixName}`;
}

export class VscodeIdeAdapter implements IdeAdapter {
  constructor(private readonly developmentFallback?: string) {}

  async openTerminal(cwd?: string): Promise<void> {
    const terminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      cwd,
    });
    terminal.show();
  }

  async openFile(filename: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      throw new Error("No workspace is open.");
    }

    const uris = await this.findFileUris(root, filename);
    if (uris.length === 0) {
      throw new Error(
        `No file matching "${filename}" found in the workspace.`
      );
    }

    if (uris.length === 1) {
      await vscode.window.showTextDocument(uris[0]);
      return;
    }

    const items = uris.map((uri) => ({
      label: vscode.workspace.asRelativePath(uri),
      uri,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Multiple files match "${filename}"`,
    });
    if (!picked) {
      return;
    }
    await vscode.window.showTextDocument(picked.uri);
  }

  async openFolder(absolutePath: string): Promise<void> {
    const uri = vscode.Uri.file(path.resolve(absolutePath));
    await vscode.commands.executeCommand("vscode.openFolder", uri, true);
  }

  getWorkspaceRoot(): string | undefined {
    return resolveWorkspaceRoot(this.developmentFallback);
  }

  private async findFileUris(
    root: string,
    filename: string
  ): Promise<vscode.Uri[]> {
    if (vscode.workspace.workspaceFolders?.length) {
      const pattern = new vscode.RelativePattern(root, globForFilename(filename));
      return vscode.workspace.findFiles(pattern, FILE_SEARCH_EXCLUDE, 50);
    }
    return findFilesOnDisk(root, filename).map((filePath) =>
      vscode.Uri.file(filePath)
    );
  }
}
