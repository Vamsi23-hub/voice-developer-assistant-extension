import * as vscode from "vscode";

export async function promptForCommand(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: "Enter a command",
    placeHolder:
      "open terminal, git status, open <file>, open <repo alias>",
    ignoreFocusOut: true,
  });
}
