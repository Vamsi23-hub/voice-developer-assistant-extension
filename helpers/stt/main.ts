import * as fs from "node:fs";
import * as path from "node:path";
import { writeDebug, writeProtocol } from "../../src/speech/sttProtocol";
import { readModelDirFromEnv } from "./resolveModel";
import { transcribeWav } from "./transcribe";

function fail(message: string, exitCode = 1): never {
  writeProtocol({ type: "error", message });
  process.exit(exitCode);
}

function main(): void {
  const wavPath = process.argv[2];
  if (!wavPath) {
    fail(
      "Missing WAV path. Usage: node dist-helper/stt.mjs /absolute/path/to/file.wav"
    );
  }

  const resolvedWav = path.resolve(wavPath);
  if (!fs.existsSync(resolvedWav)) {
    fail(`WAV file not found: ${resolvedWav}`);
  }

  let modelDir: string;
  try {
    modelDir = readModelDirFromEnv();
  } catch (error) {
    fail(error instanceof Error ? error.message : "Invalid VDA_STT_MODEL_DIR.");
  }

  writeDebug(`wav=${resolvedWav}`);
  writeDebug(`modelDir=${modelDir}`);

  try {
    const result = transcribeWav(resolvedWav, modelDir);
    writeDebug(`kind=${result.kind}`);
    writeDebug(`encoder=${result.encoder}`);
    writeDebug(`decoder=${result.decoder}`);
    writeDebug(`tokens=${result.tokens}`);
    writeDebug(`loadMs=${result.loadMs}`);
    writeDebug(`decodeMs=${result.decodeMs}`);
    writeDebug(`durationMs=${result.loadMs + result.decodeMs}`);
    writeDebug("native libraries loaded; transcription complete");
    writeProtocol({ type: "final", text: result.text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speech recognition failed.";
    fail(message);
  }
}

main();
