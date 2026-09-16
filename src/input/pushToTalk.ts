import * as vscode from "vscode";
import { createNodeVoiceHelper } from "../adapters/nodeVoiceHelper";
import {
  resolveNativeLibDir,
  resolveNodeExecutable,
  resolveSttModelDir,
} from "../adapters/sttPaths";
import type { CommandEngine } from "../core/commandEngine";
import type { AliasStore, ResponseOutput } from "../ports/ports";
import {
  createPttController,
  PttController,
  PttControllerState,
} from "../speech/pttController";
import { VoiceClient } from "../speech/voiceClient";

export function registerPushToTalk(options: {
  context: vscode.ExtensionContext;
  output: ResponseOutput;
  engine: CommandEngine;
  aliases: AliasStore;
}): vscode.Disposable {
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  let client: VoiceClient | undefined;
  let controller: PttController | undefined;

  const render = (state?: PttControllerState): void => {
    const current = state ?? controller?.state() ?? "idle";
    if (current === "recording") {
      status.text = "🔴 Recording...";
      status.tooltip = "Stop push-to-talk";
      status.command = "voiceDeveloperAssistant.stopPushToTalk";
    } else if (
      current === "processingAudio" ||
      current === "processingIntent"
    ) {
      status.text = "$(loading~spin) Processing...";
      status.tooltip = "Voice command is still processing";
      status.command = undefined;
    } else {
      status.text = "🎤 Voice";
      status.tooltip = "Start push-to-talk";
      status.command = "voiceDeveloperAssistant.startPushToTalk";
    }
    status.show();
    void vscode.commands.executeCommand(
      "setContext",
      "voiceDeveloperAssistant.recording",
      current === "recording"
    );
  };

  const getController = (): PttController => {
    if (controller) {
      return controller;
    }
    const config = vscode.workspace.getConfiguration("voiceDeveloperAssistant");
    const extensionRoot = options.context.extensionUri.fsPath;
    const modelDir = resolveSttModelDir({
      settingValue: config.get<string>("sttModelDir"),
      env: process.env,
    });
    client = createNodeVoiceHelper({
      extensionRoot,
      modelDir,
      nativeLibDir: resolveNativeLibDir(extensionRoot),
      nodeExecutable: resolveNodeExecutable(config.get<string>("nodePath")),
      onDebug: (message) => options.output.debug(message),
      onProtocolError: (message) => {
        controller?.handleUnsolicitedError(message);
      },
    });
    controller = createPttController({
      client,
      output: options.output,
      engine: options.engine,
      aliases: options.aliases,
      onStateChange: render,
    });
    return controller;
  };

  render();
  return vscode.Disposable.from(
    status,
    vscode.commands.registerCommand(
      "voiceDeveloperAssistant.startPushToTalk",
      () => getController().start()
    ),
    vscode.commands.registerCommand(
      "voiceDeveloperAssistant.stopPushToTalk",
      () => getController().stop()
    ),
    vscode.commands.registerCommand(
      "voiceDeveloperAssistant.cancelPushToTalk",
      () => getController().cancel()
    ),
    { dispose: () => client?.dispose() }
  );
}
