import * as fs from "node:fs";
import * as path from "node:path";

export type TransducerModelFiles = {
  kind: "transducer";
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
};

export type WhisperModelFiles = {
  kind: "whisper";
  encoder: string;
  decoder: string;
  tokens: string;
};

export type ModelFiles = TransducerModelFiles | WhisperModelFiles;

function isOnnx(name: string): boolean {
  return name.toLowerCase().endsWith(".onnx");
}

function pick(
  files: string[],
  substring: string,
  preferInt8: boolean
): string | undefined {
  const matches = files.filter(
    (name) => isOnnx(name) && name.toLowerCase().includes(substring)
  );
  if (matches.length === 0) {
    return undefined;
  }
  if (preferInt8) {
    return matches.find((name) => name.includes("int8")) ?? matches[0];
  }
  return matches.find((name) => !name.includes("int8")) ?? matches[0];
}

function pickTokens(files: string[]): string | undefined {
  return (
    files.find((name) => name === "tokens.txt") ??
    files.find((name) => name.toLowerCase().endsWith("-tokens.txt")) ??
    files.find((name) => name.toLowerCase().includes("tokens"))
  );
}

export function resolveModelFiles(modelDir: string): ModelFiles {
  const resolvedDir = path.resolve(modelDir);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(`Model directory does not exist: ${resolvedDir}`);
  }

  const files = fs.readdirSync(resolvedDir);
  const tokens = pickTokens(files);
  if (!tokens) {
    throw new Error(
      `No tokens file found in ${resolvedDir}. Expected tokens.txt.`
    );
  }

  const encoder = pick(files, "encoder", true);
  const decoder = pick(files, "decoder", false);
  const joiner = pick(files, "joiner", true);

  if (encoder && decoder && joiner) {
    return {
      kind: "transducer",
      encoder: path.join(resolvedDir, encoder),
      decoder: path.join(resolvedDir, decoder),
      joiner: path.join(resolvedDir, joiner),
      tokens: path.join(resolvedDir, tokens),
    };
  }

  const whisperDecoder = pick(files, "decoder", true);
  if (encoder && whisperDecoder) {
    return {
      kind: "whisper",
      encoder: path.join(resolvedDir, encoder),
      decoder: path.join(resolvedDir, whisperDecoder),
      tokens: path.join(resolvedDir, tokens),
    };
  }

  throw new Error(
    `Could not detect a Zipformer transducer or Whisper model in ${resolvedDir}. Expected encoder/decoder/joiner ONNX files plus tokens.txt, or Whisper encoder/decoder ONNX files plus tokens.`
  );
}

export function readModelDirFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  const modelDir = env.VDA_STT_MODEL_DIR?.trim();
  if (!modelDir) {
    throw new Error(
      "VDA_STT_MODEL_DIR is not set. Point it at a sherpa-onnx English model directory."
    );
  }
  if (!path.isAbsolute(modelDir)) {
    throw new Error("VDA_STT_MODEL_DIR must be an absolute path.");
  }
  return modelDir;
}
