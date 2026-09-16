import * as vscode from "vscode";
import { VscodeAliasStore } from "./adapters/vscodeAliasStore";
import { VscodeIdeAdapter } from "./adapters/vscodeIdeAdapter";
import { VscodeResponseOutput } from "./adapters/vscodeResponseOutput";
import { createNodeGitRunner } from "./adapters/nodeGitRunner";
import { describeWorkspaceState } from "./adapters/resolveWorkspaceRoot";
import { readExtensionDevelopmentPath } from "./adapters/workspacePaths";
import { createNodeSttHelperRunner } from "./adapters/nodeSttHelperRunner";
import {
  helperScriptPath,
  resolveNativeLibDir,
  resolveNodeExecutable,
  resolveSttModelDir,
} from "./adapters/sttPaths";
import { CommandEngine } from "./core/commandEngine";
import { parseIntent } from "./core/parseIntent";
import { pickSttFixtureWav } from "./input/pickSttFixture";
import { registerPushToTalk } from "./input/pushToTalk";
import { promptForRepositoryAlias } from "./input/setRepositoryAlias";
import { promptForCommand } from "./input/textCommandInput";
import { runSttFixture } from "./speech/runSttFixture";

export function activate(context: vscode.ExtensionContext): void {
  const developmentFallback = resolveDevelopmentFallback(context);
  const aliases = new VscodeAliasStore(context);
  const output = new VscodeResponseOutput(
    developmentFallback ? vscode.Uri.file(developmentFallback) : undefined
  );
  const engine = new CommandEngine({
    ide: new VscodeIdeAdapter(developmentFallback),
    git: createNodeGitRunner(),
    aliases,
    output,
  });

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand(
      "voiceDeveloperAssistant.runCommand",
      async () => {
        const text = await promptForCommand();
        if (!text) {
          return;
        }
        output.debug(`received text: ${JSON.stringify(text)}`);
        output.debug(`workspace: ${describeWorkspaceState(developmentFallback)}`);
        const stored = await aliases.getAll();
        const intent = parseIntent(text, { aliases: Object.keys(stored) });
        await engine.execute(intent);
      }
    ),
    vscode.commands.registerCommand(
      "voiceDeveloperAssistant.setRepositoryAlias",
      async () => {
        const selected = await promptForRepositoryAlias();
        if (!selected) {
          return;
        }
        await aliases.set(selected.alias, selected.folderPath);
        await output.info(
          `Saved alias "${selected.alias}" → ${selected.folderPath}`
        );
      }
    ),
    vscode.commands.registerCommand(
      "voiceDeveloperAssistant.runSttFixture",
      async () => {
        const wavPath = await pickSttFixtureWav(context.extensionUri.fsPath);
        if (!wavPath) {
          return;
        }
        output.debug(`stt fixture wav: ${wavPath}`);
        output.debug(`workspace: ${describeWorkspaceState(developmentFallback)}`);
        try {
          const config = vscode.workspace.getConfiguration(
            "voiceDeveloperAssistant"
          );
          const extensionRoot = context.extensionUri.fsPath;
          const modelDir = resolveSttModelDir({
            settingValue: config.get<string>("sttModelDir"),
            env: process.env,
          });
          output.debug(`stt modelDir: ${modelDir}`);
          const stt = createNodeSttHelperRunner({
            helperPath: helperScriptPath(extensionRoot),
            modelDir,
            nativeLibDir: resolveNativeLibDir(extensionRoot),
            nodeExecutable: resolveNodeExecutable(
              config.get<string>("nodePath")
            ),
            onDebug: (message) => output.debug(message),
          });
          const stored = await aliases.getAll();
          await runSttFixture({
            wavPath,
            stt,
            aliases: Object.keys(stored),
            engine,
            output,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "STT fixture failed.";
          await output.error(message);
        }
      }
    ),
    registerPushToTalk({ context, output, engine, aliases })
  );
}

function resolveDevelopmentFallback(
  context: vscode.ExtensionContext
): string | undefined {
  const fromArgs = readExtensionDevelopmentPath();
  if (fromArgs) {
    return fromArgs;
  }
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    return context.extensionUri.fsPath;
  }
  return undefined;
}

export function deactivate(): void {
  // VS Code requires this hook; subscriptions are disposed via activate().
}
