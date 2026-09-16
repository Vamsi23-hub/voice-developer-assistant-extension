import { execFile } from "node:child_process";
import * as fs from "node:fs";
import type { ExecFileException, ExecFileOptions } from "node:child_process";
import { SttClient } from "../speech/sttClient";
import {
  readProtocolFromStdout,
  SttProtocolMessage,
} from "../speech/sttProtocol";
import { helperChildEnv } from "./sttPaths";

export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
  callback: (
    error: ExecFileException | null,
    stdout: string,
    stderr: string
  ) => void
) => void;

export type NodeSttHelperRunnerOptions = {
  helperPath: string;
  modelDir: string;
  nativeLibDir: string;
  nodeExecutable: string;
  execFileImpl?: ExecFileFn;
  onDebug?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
};

export function createNodeSttHelperRunner(
  options: NodeSttHelperRunnerOptions
): SttClient {
  const run = options.execFileImpl ?? execFile;
  return {
    transcribeWav(wavPath: string): Promise<SttProtocolMessage> {
      if (!fs.existsSync(options.helperPath)) {
        return Promise.resolve({
          type: "error",
          message: `STT helper not found at ${options.helperPath}. Run pnpm stt:build.`,
        });
      }
      if (!fs.existsSync(wavPath)) {
        return Promise.resolve({
          type: "error",
          message: `WAV file not found: ${wavPath}`,
        });
      }

      const env = helperChildEnv({
        modelDir: options.modelDir,
        nativeLibDir: options.nativeLibDir,
        env: options.env,
      });

      return new Promise((resolve) => {
        run(
          options.nodeExecutable,
          [options.helperPath, wavPath],
          { env, timeout: 120000, encoding: "utf8", windowsHide: true },
          (error, stdout, stderr) => {
            if (stderr) {
              for (const line of stderr.split("\n")) {
                if (line.trim()) {
                  options.onDebug?.(line);
                }
              }
            }
            try {
              resolve(readProtocolFromStdout(stdout ?? ""));
            } catch (parseError) {
              const fallback =
                error?.message ??
                (parseError instanceof Error
                  ? parseError.message
                  : "STT helper failed.");
              resolve({ type: "error", message: fallback });
            }
          }
        );
      });
    },
  };
}
