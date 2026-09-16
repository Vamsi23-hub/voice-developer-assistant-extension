import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  encodeSttMessage,
  parseSttMessage,
  readProtocolFromStdout,
} from "../src/speech/sttProtocol";
import { nativePackageName, resolveNativeLibDir } from "../helpers/stt/nativeLib";
import {
  readModelDirFromEnv,
  resolveModelFiles,
} from "../helpers/stt/resolveModel";

describe("stt protocol", () => {
  it("encodes a final transcript", () => {
    expect(encodeSttMessage({ type: "final", text: "open terminal" })).toBe(
      JSON.stringify({ type: "final", text: "open terminal" })
    );
  });

  it("encodes an error", () => {
    expect(encodeSttMessage({ type: "error", message: "missing wav" })).toBe(
      JSON.stringify({ type: "error", message: "missing wav" })
    );
  });

  it("parses a final protocol line", () => {
    expect(
      parseSttMessage('{"type":"final","text":"open terminal"}')
    ).toEqual({ type: "final", text: "open terminal" });
  });

  it("reads a valid final protocol result from helper stdout", () => {
    expect(
      readProtocolFromStdout(
        '{"type":"final","text":"open terminal"}\n'
      )
    ).toEqual({ type: "final", text: "open terminal" });
  });

  it("reads an STT error result from helper stdout", () => {
    expect(
      readProtocolFromStdout(
        '{"type":"error","message":"WAV file not found"}\n'
      )
    ).toEqual({ type: "error", message: "WAV file not found" });
  });

  it("rejects a non-protocol payload", () => {
    expect(() => parseSttMessage('{"hello":"world"}')).toThrow(
      /missing a valid type/
    );
  });
});

describe("native package name", () => {
  it("uses sherpa-onnx-darwin-arm64 on macOS ARM64", () => {
    expect(nativePackageName("darwin", "arm64")).toBe(
      "sherpa-onnx-darwin-arm64"
    );
  });

  it("resolves the pnpm-nested native package next to sherpa-onnx-node", () => {
    const libDir = resolveNativeLibDir();
    expect(libDir).toContain(
      `sherpa-onnx-${process.platform === "win32" ? "win" : process.platform}-${process.arch}`
    );
  });
});

describe("resolveModelFiles", () => {
  it("detects a whisper tiny.en layout", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "vda-stt-"));
    writeFileSync(path.join(dir, "tiny.en-encoder.int8.onnx"), "");
    writeFileSync(path.join(dir, "tiny.en-decoder.int8.onnx"), "");
    writeFileSync(path.join(dir, "tiny.en-tokens.txt"), "a");
    expect(resolveModelFiles(dir)).toEqual({
      kind: "whisper",
      encoder: path.join(dir, "tiny.en-encoder.int8.onnx"),
      decoder: path.join(dir, "tiny.en-decoder.int8.onnx"),
      tokens: path.join(dir, "tiny.en-tokens.txt"),
    });
  });

  it("detects a whisper base.en layout without architecture changes", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "vda-stt-"));
    writeFileSync(path.join(dir, "base.en-encoder.int8.onnx"), "");
    writeFileSync(path.join(dir, "base.en-decoder.int8.onnx"), "");
    writeFileSync(path.join(dir, "base.en-tokens.txt"), "a");
    expect(resolveModelFiles(dir)).toEqual({
      kind: "whisper",
      encoder: path.join(dir, "base.en-encoder.int8.onnx"),
      decoder: path.join(dir, "base.en-decoder.int8.onnx"),
      tokens: path.join(dir, "base.en-tokens.txt"),
    });
  });

  it("detects a zipformer transducer layout", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "vda-stt-"));
    writeFileSync(path.join(dir, "encoder-epoch-99-avg-1.int8.onnx"), "");
    writeFileSync(path.join(dir, "decoder-epoch-99-avg-1.onnx"), "");
    writeFileSync(path.join(dir, "joiner-epoch-99-avg-1.int8.onnx"), "");
    writeFileSync(path.join(dir, "tokens.txt"), "a");
    expect(resolveModelFiles(dir).kind).toBe("transducer");
  });

  it("requires an absolute VDA_STT_MODEL_DIR", () => {
    expect(() => readModelDirFromEnv({})).toThrow(/VDA_STT_MODEL_DIR is not set/);
    expect(() => readModelDirFromEnv({ VDA_STT_MODEL_DIR: "models/foo" })).toThrow(
      /absolute path/
    );
  });
});
