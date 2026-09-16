import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
export const helperJs = path.join(repoRoot, "dist-helper", "stt.mjs");
export const fixturesDir = path.join(
  repoRoot,
  "helpers",
  "stt",
  "fixtures"
);
export const defaultWav = path.join(fixturesDir, "open-terminal.wav");
export const evalCatalogPath = path.join(
  repoRoot,
  "helpers",
  "stt",
  "eval-catalog.json"
);

export function nativeLibDir() {
  const osName = process.platform === "win32" ? "win" : process.platform;
  const packageName = `sherpa-onnx-${osName}-${process.arch}`;
  const sherpaNodeDir = path.dirname(
    require.resolve("sherpa-onnx-node/package.json")
  );
  return path.resolve(sherpaNodeDir, "..", packageName);
}

export function helperEnv() {
  const env = { ...process.env };
  const libDir = nativeLibDir();
  if (process.platform === "darwin") {
    env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH
      ? `${libDir}:${env.DYLD_LIBRARY_PATH}`
      : libDir;
  } else if (process.platform === "linux") {
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
      ? `${libDir}:${env.LD_LIBRARY_PATH}`
      : libDir;
  }
  return env;
}

export function normalizeTranscript(text) {
  const trailing = new Set([".", ",", "!", "?"]);
  let normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  while (
    normalized.length > 0 &&
    trailing.has(normalized.at(-1))
  ) {
    normalized = normalized.slice(0, -1).trimEnd();
  }
  return normalized;
}

export function isAcceptableRecognition(rawTranscript, expectedPhrase) {
  const actual = normalizeTranscript(rawTranscript);
  const expected = normalizeTranscript(expectedPhrase);
  return actual.length > 0 && actual === expected;
}

export function inspectWav(filePath) {
  const buf = fs.readFileSync(filePath);
  if (
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return {
      path: filePath,
      compatible: false,
      problem: "Not a RIFF/WAVE file.",
    };
  }

  let offset = 12;
  let audioFormat;
  let channels;
  let sampleRate;
  let bitsPerSample;
  let dataBytes;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      audioFormat = buf.readUInt16LE(start);
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bitsPerSample = buf.readUInt16LE(start + 14);
    } else if (id === "data") {
      dataBytes = size;
    }
    offset = start + size + (size % 2);
  }

  const pcm = audioFormat === 1;
  const problems = [];
  if (!pcm) {
    problems.push(
      `audio format is ${audioFormat ?? "unknown"} (PCM WAV required, format=1)`
    );
  }
  if (channels !== 1) {
    problems.push(`channels=${channels ?? "unknown"} (mono required)`);
  }
  if (sampleRate !== 16000) {
    problems.push(`sampleRate=${sampleRate ?? "unknown"} (16 kHz required)`);
  }

  const bytesPerSample = bitsPerSample ? bitsPerSample / 8 : undefined;
  const durationSec =
    sampleRate && dataBytes && channels && bytesPerSample
      ? dataBytes / (sampleRate * channels * bytesPerSample)
      : undefined;

  return {
    path: filePath,
    container: "WAVE",
    pcm,
    channels,
    sampleRate,
    bitsPerSample,
    durationSec,
    compatible: problems.length === 0,
    problem: problems.length > 0 ? problems.join("; ") : undefined,
  };
}

export function extraArgs(argv = process.argv) {
  return argv.slice(2).filter((arg) => arg !== "--");
}

export function collectWavs(args) {
  if (args.length === 0) {
    return [defaultWav];
  }

  const wavs = [];
  for (const arg of args) {
    const resolved = path.resolve(arg);
    if (!fs.existsSync(resolved)) {
      throw new Error(`WAV path not found: ${resolved}`);
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      wavs.push(
        ...fs
          .readdirSync(resolved)
          .filter((name) => name.toLowerCase().endsWith(".wav"))
          .sort()
          .map((name) => path.join(resolved, name))
      );
      continue;
    }
    wavs.push(resolved);
  }
  return wavs;
}

export function loadEvalCatalog() {
  return JSON.parse(fs.readFileSync(evalCatalogPath, "utf8"));
}

export function parseHelperTimings(stderr) {
  const load = stderr.match(/loadMs=(\d+)/);
  const decode = stderr.match(/decodeMs=(\d+)/);
  const duration = stderr.match(/durationMs=(\d+)/);
  const encoder = stderr.match(/encoder=(.+)/);
  const decoder = stderr.match(/decoder=(.+)/);
  const tokens = stderr.match(/tokens=(.+)/);
  return {
    loadMs: load ? Number(load[1]) : undefined,
    decodeMs: decode ? Number(decode[1]) : undefined,
    durationMs: duration ? Number(duration[1]) : undefined,
    encoder: encoder?.[1]?.trim(),
    decoder: decoder?.[1]?.trim(),
    tokens: tokens?.[1]?.trim(),
  };
}

export function runHelper(wavPath, options = {}) {
  const pipe = options.pipe === true;
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [helperJs, wavPath], {
      env: helperEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (pipe) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (pipe) {
        process.stderr.write(chunk);
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        wallMs: Date.now() - started,
      });
    });
  });
}
