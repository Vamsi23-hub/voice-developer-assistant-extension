import fs from "node:fs";
import path from "node:path";
import {
  extraArgs,
  fixturesDir,
  helperJs,
  inspectWav,
  isAcceptableRecognition,
  loadEvalCatalog,
  nativeLibDir,
  normalizeTranscript,
  parseHelperTimings,
  runHelper,
} from "./stt-lib.mjs";

function fail(message) {
  process.stderr.write(`[stt:eval] ${message}\n`);
  process.exit(1);
}

function parseProtocol(stdout) {
  const protocolLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("{"));
  if (!protocolLine) {
    return undefined;
  }
  return JSON.parse(protocolLine);
}

if (!fs.existsSync(helperJs)) {
  fail(`Helper bundle not found at ${helperJs}. Run pnpm stt:build first.`);
}

if (!process.env.VDA_STT_MODEL_DIR) {
  fail(
    "VDA_STT_MODEL_DIR is not set. Point it at tiny.en or base.en, for example: export VDA_STT_MODEL_DIR=$PWD/models/sherpa-onnx-whisper-tiny.en"
  );
}

const catalog = loadEvalCatalog();
const extraWavs = extraArgs().filter((arg) => arg.endsWith(".wav"));
const extraRows = extraWavs.map((wavArg) => {
  const file = path.basename(wavArg);
  return {
    file,
    expected: file.replace(/\.wav$/i, "").replaceAll("-", " "),
    wavPath: path.resolve(wavArg),
  };
});

const rows = [
  ...catalog.phrases.map((phrase) => ({
    ...phrase,
    wavPath: path.join(fixturesDir, phrase.file),
  })),
  ...extraRows,
];

process.stderr.write(`[stt:eval] modelDir=${process.env.VDA_STT_MODEL_DIR}\n`);
process.stderr.write(`[stt:eval] nativeLib=${nativeLibDir()}\n`);

const results = [];
for (const row of rows) {
  if (!fs.existsSync(row.wavPath)) {
    results.push({
      expected: row.expected,
      file: row.file,
      status: "pending",
      raw: "",
      normalized: "",
      acceptable: false,
      note: "WAV fixture not provided yet",
    });
    continue;
  }

  const wav = inspectWav(row.wavPath);
  if (!wav.compatible) {
    results.push({
      expected: row.expected,
      file: row.file,
      status: "incompatible",
      raw: "",
      normalized: "",
      acceptable: false,
      wav,
      note: wav.problem,
    });
    continue;
  }

  const helper = await runHelper(row.wavPath);
  const timings = parseHelperTimings(helper.stderr);
  process.stderr.write(helper.stderr);
  const message = parseProtocol(helper.stdout);

  if (!message) {
    results.push({
      expected: row.expected,
      file: row.file,
      status: "error",
      raw: "",
      normalized: "",
      acceptable: false,
      wav,
      wallMs: helper.wallMs,
      ...timings,
      exitCode: helper.code,
      note: "Helper produced no protocol JSON on stdout",
    });
    continue;
  }

  if (message.type === "error") {
    results.push({
      expected: row.expected,
      file: row.file,
      status: "error",
      raw: "",
      normalized: "",
      acceptable: false,
      wav,
      wallMs: helper.wallMs,
      ...timings,
      exitCode: helper.code,
      note: message.message,
    });
    continue;
  }

  const normalized = normalizeTranscript(message.text);
  const acceptable = isAcceptableRecognition(message.text, row.expected);
  results.push({
    expected: row.expected,
    file: row.file,
    status: acceptable ? "acceptable" : "mismatch",
    raw: message.text,
    normalized,
    acceptable,
    wav,
    wallMs: helper.wallMs,
    ...timings,
    exitCode: helper.code,
  });
}

const present = results.filter((row) => row.status !== "pending");
const acceptableCount = results.filter((row) => row.acceptable).length;
const pendingCount = results.filter((row) => row.status === "pending").length;
const modelRow = present.find((row) => row.encoder);

const report = {
  modelDir: process.env.VDA_STT_MODEL_DIR,
  nativeLib: nativeLibDir(),
  modelFiles: modelRow
    ? {
        encoder: modelRow.encoder,
        decoder: modelRow.decoder,
        tokens: modelRow.tokens,
      }
    : undefined,
  summary: {
    total: results.length,
    ran: present.length,
    acceptable: acceptableCount,
    pending: pendingCount,
  },
  results: results.map((row) => ({
    expected: row.expected,
    file: row.file,
    raw: row.raw,
    normalized: row.normalized,
    acceptable: row.acceptable,
    status: row.status,
    wallMs: row.wallMs,
    loadMs: row.loadMs,
    decodeMs: row.decodeMs,
    durationMs: row.durationMs,
    exitCode: row.exitCode,
    wav: row.wav
      ? {
          pcm: row.wav.pcm,
          channels: row.wav.channels,
          sampleRate: row.wav.sampleRate,
          bitsPerSample: row.wav.bitsPerSample,
          durationSec: row.wav.durationSec,
          compatible: row.wav.compatible,
          problem: row.wav.problem,
        }
      : undefined,
    note: row.note,
  })),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

process.stderr.write("\nPhase 2A STT accuracy evaluation\n");
process.stderr.write(
  `${"expected".padEnd(28)} ${"raw".padEnd(28)} ${"normalized".padEnd(28)} ${"ok".padEnd(5)} ${"wallMs".padEnd(8)}\n`
);
for (const row of results) {
  const raw = row.raw || row.status;
  process.stderr.write(
    `${row.expected.padEnd(28)} ${raw.padEnd(28)} ${(row.normalized || "-").padEnd(28)} ${String(row.acceptable).padEnd(5)} ${String(row.wallMs ?? "-").padEnd(8)}\n`
  );
}

if (present.length === 0) {
  fail(
    "No WAV fixtures were present. Add recordings under helpers/stt/fixtures or pass extra WAV paths."
  );
}

if (results.some((row) => row.status === "error" || row.status === "incompatible")) {
  process.exit(1);
}
