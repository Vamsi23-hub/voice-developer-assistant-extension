import * as vscode from "vscode";
import { ResponseOutput } from "../ports/ports";

export class VscodeResponseOutput implements ResponseOutput, vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel(
    "Voice Developer Assistant"
  );

  constructor(private readonly developmentFolder?: vscode.Uri) {}

  debug(message: string): void {
    this.channel.appendLine(`[debug] ${message}`);
    this.channel.show(true);
  }

  async info(message: string): Promise<void> {
    this.channel.appendLine(`[info] ${message}`);
    await vscode.window.showInformationMessage(message);
  }

  async error(message: string): Promise<void> {
    this.channel.appendLine(`[error] ${message}`);
    this.channel.show(true);
    if (message === "No workspace is open.") {
      const action = await vscode.window.showErrorMessage(
        message,
        "Open Folder"
      );
      if (action === "Open Folder") {
        if (this.developmentFolder) {
          await vscode.commands.executeCommand(
            "vscode.openFolder",
            this.developmentFolder,
            false
          );
          return;
        }
        await vscode.commands.executeCommand("workbench.action.files.openFolder");
      }
      return;
    }
    await vscode.window.showErrorMessage(message);
  }

  async gitOutput(formatted: string): Promise<void> {
    this.channel.appendLine("[git status]");
    this.channel.appendLine(formatted);
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
