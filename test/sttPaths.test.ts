import { describe, expect, it } from "vitest";
import {
  defaultFixtureWavPath,
  helperScriptPath,
  nativePackageName,
  resolveNativeLibDir,
  resolveSttModelDir,
  voiceHelperPath,
} from "../src/adapters/sttPaths";

describe("sttPaths", () => {
  it("resolves helper and default fixture paths from the extension root", () => {
    expect(helperScriptPath("/ext")).toBe("/ext/dist-helper/stt.mjs");
    expect(defaultFixtureWavPath("/ext")).toBe(
      "/ext/helpers/stt/fixtures/open-terminal.wav"
    );
    expect(voiceHelperPath("/ext")).toBe("/ext/dist-helper/voice.mjs");
  });

  it("prefers the settings value over VDA_STT_MODEL_DIR", () => {
    expect(
      resolveSttModelDir({
        settingValue: "/models/sherpa-onnx-whisper-base.en",
        env: { VDA_STT_MODEL_DIR: "/models/tiny.en" },
      })
    ).toBe("/models/sherpa-onnx-whisper-base.en");
  });

  it("uses VDA_STT_MODEL_DIR when the setting is empty", () => {
    expect(
      resolveSttModelDir({
        settingValue: "  ",
        env: { VDA_STT_MODEL_DIR: "/models/sherpa-onnx-whisper-base.en" },
      })
    ).toBe("/models/sherpa-onnx-whisper-base.en");
  });

  it("does not accept a relative model path", () => {
    expect(() =>
      resolveSttModelDir({ settingValue: "models/base.en" })
    ).toThrow(/absolute path/);
  });

  it("names the Darwin ARM64 native package", () => {
    expect(nativePackageName("darwin", "arm64")).toBe(
      "sherpa-onnx-darwin-arm64"
    );
  });

  it("resolves the pnpm-nested native package from the extension root", () => {
    const libDir = resolveNativeLibDir(process.cwd());
    expect(libDir).toContain("sherpa-onnx-");
  });
});
