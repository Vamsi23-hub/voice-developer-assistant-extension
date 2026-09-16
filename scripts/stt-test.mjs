import fs from "node:fs";
import {
  collectWavs,
  extraArgs,
  helperJs,
  nativeLibDir,
  runHelper,
} from "./stt-lib.mjs";

function fail(message) {
  process.stderr.write(`[stt:test] ${message}\n`);
  process.stdout.write(`${JSON.stringify({ type: "error", message })}\n`);
  process.exit(1);
}

if (!fs.existsSync(helperJs)) {
  fail(`Helper bundle not found at ${helperJs}. Run pnpm stt:build first.`);
}

if (!process.env.VDA_STT_MODEL_DIR) {
  fail(
    "VDA_STT_MODEL_DIR is not set. See helpers/stt/README.md for the expected model directory."
  );
}

let wavs;
try {
  wavs = collectWavs(extraArgs());
} catch (error) {
  fail(error instanceof Error ? error.message : "Invalid WAV path.");
}

if (wavs.length === 0) {
  fail(
    "No WAV files found. Place fixtures in helpers/stt/fixtures or pass a path: pnpm stt:test -- /path/to/file.wav"
  );
}

for (const wavPath of wavs) {
  if (!fs.existsSync(wavPath)) {
    fail(
      `WAV not found: ${wavPath}. Place a 16 kHz mono WAV in helpers/stt/fixtures or pass a path: pnpm stt:test -- /path/to/file.wav`
    );
  }
}

process.stderr.write(`[stt:test] helper=${helperJs}\n`);
process.stderr.write(`[stt:test] modelDir=${process.env.VDA_STT_MODEL_DIR}\n`);
process.stderr.write(`[stt:test] nativeLib=${nativeLibDir()}\n`);
process.stderr.write(`[stt:test] wavCount=${wavs.length}\n`);

let failed = false;
for (const wavPath of wavs) {
  process.stderr.write(`[stt:test] wav=${wavPath}\n`);
  const result = await runHelper(wavPath, { pipe: true });
  process.stderr.write(`[stt:test] wallMs=${result.wallMs} wav=${wavPath}\n`);
  if (result.code !== 0) {
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
