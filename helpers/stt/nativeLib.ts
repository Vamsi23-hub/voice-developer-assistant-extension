import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function nativePackageName(
  platform: NodeJS.Platform = os.platform(),
  arch: string = os.arch()
): string {
  const osName = platform === "win32" ? "win" : platform;
  return `sherpa-onnx-${osName}-${arch}`;
}

export function resolveNativeLibDir(): string {
  const packageName = nativePackageName();
  const sherpaNodeDir = path.dirname(
    require.resolve("sherpa-onnx-node/package.json")
  );
  const sibling = path.resolve(sherpaNodeDir, "..", packageName);
  if (fs.existsSync(path.join(sibling, "package.json"))) {
    return sibling;
  }
  throw new Error(
    `Could not resolve native sherpa-onnx package at ${sibling}. Install sherpa-onnx-node for this platform.`
  );
}

export function helperProcessEnv(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const next = { ...env };
  const libDir = resolveNativeLibDir();
  if (os.platform() === "darwin") {
    const current = next.DYLD_LIBRARY_PATH ?? "";
    next.DYLD_LIBRARY_PATH = current ? `${libDir}:${current}` : libDir;
  } else if (os.platform() === "linux") {
    const current = next.LD_LIBRARY_PATH ?? "";
    next.LD_LIBRARY_PATH = current ? `${libDir}:${current}` : libDir;
  }
  return next;
}

