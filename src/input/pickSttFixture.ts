import * as fs from "node:fs";
import * as vscode from "vscode";
import { defaultFixtureWavPath } from "../adapters/sttPaths";

type FixturePick = {
  label: string;
  description?: string;
  wavPath?: string;
};

export async function pickSttFixtureWav(
  extensionRoot: string
): Promise<string | undefined> {
  const defaultWav = defaultFixtureWavPath(extensionRoot);
  const items: FixturePick[] = [];
  if (fs.existsSync(defaultWav)) {
    items.push({
      label: "Use open-terminal.wav",
      description: defaultWav,
      wavPath: defaultWav,
    });
  }
  items.push({
    label: "Choose WAV file…",
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a 16 kHz mono WAV fixture",
    ignoreFocusOut: true,
  });
  if (!picked) {
    return undefined;
  }
  if (picked.wavPath) {
    return picked.wavPath;
  }

  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { WAV: ["wav"] },
    title: "Select a 16 kHz mono WAV fixture",
  });
  return selected?.[0]?.fsPath;
}
