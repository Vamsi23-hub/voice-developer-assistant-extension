import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readModelDirFromEnv } from "../../helpers/stt/resolveModel";

export function helperScriptPath(extensionRoot: string): string {
  return path.join(extensionRoot, "dist-helper", "stt.mjs");
}

export function voiceHelperPath(extensionRoot: string): string {
  return path.join(extensionRoot, "dist-helper", "voice.mjs");
}

export function defaultFixtureWavPath(extensionRoot: string): string {
  return path.join(
    extensionRoot,
    "helpers",
    "stt",
    "fixtures",
    "open-terminal.wav"
  );
}

export function nativePackageName(
  platform: NodeJS.Platform = os.platform(),
  arch: string = os.arch()
): string {
  const osName = platform === "win32" ? "win" : platform;
  return `sherpa-onnx-${osName}-${arch}`;
}

export function resolveNativeLibDir(extensionRoot: string): string {
  const packageName = nativePackageName();
  const linked = path.join(extensionRoot, "node_modules", "sherpa-onnx-node");
  if (!fs.existsSync(linked)) {
    throw new Error(
      `sherpa-onnx-node is not installed at ${linked}. The STT helper cannot load native libraries.`
    );
  }
  const sherpaNodeDir = fs.realpathSync(linked);
  const sibling = path.resolve(sherpaNodeDir, "..", packageName);
  if (fs.existsSync(path.join(sibling, "package.json"))) {
    return sibling;
  }
  throw new Error(
    `Could not resolve native sherpa-onnx package at ${sibling}.`
  );
}

export function resolveSttModelDir(input: {
  settingValue?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const setting = input.settingValue?.trim();
  if (setting) {
    if (!path.isAbsolute(setting)) {
      throw new Error(
        "voiceDeveloperAssistant.sttModelDir must be an absolute path."
      );
    }
    return setting;
  }
  return readModelDirFromEnv(input.env ?? process.env);
}

export function resolveNodeExecutable(configured?: string): string {
  const explicit = configured?.trim();
  if (explicit) {
    return explicit;
  }
  if (!process.versions.electron) {
    return process.execPath;
  }
  return "node";
}

export function helperChildEnv(input: {
  modelDir: string;
  nativeLibDir: string;
  env?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const env = { ...(input.env ?? process.env) };
  env.VDA_STT_MODEL_DIR = input.modelDir;
  if (os.platform() === "darwin") {
    const pathParts = ["/opt/homebrew/bin", "/usr/local/bin", env.PATH ?? ""];
    env.PATH = pathParts.filter((part) => part.length > 0).join(":");
    const current = env.DYLD_LIBRARY_PATH ?? "";
    env.DYLD_LIBRARY_PATH = current
      ? `${input.nativeLibDir}:${current}`
      : input.nativeLibDir;
  } else if (os.platform() === "linux") {
    const current = env.LD_LIBRARY_PATH ?? "";
    env.LD_LIBRARY_PATH = current
      ? `${input.nativeLibDir}:${current}`
      : input.nativeLibDir;
  }
  return env;
}
