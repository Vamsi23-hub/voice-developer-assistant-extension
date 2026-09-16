import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createNodeSttHelperRunner,
  ExecFileFn,
} from "../src/adapters/nodeSttHelperRunner";

function tempPair(): { helperPath: string; wavPath: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "vda-stt-helper-"));
  const helperPath = path.join(dir, "stt.mjs");
  const wavPath = path.join(dir, "open-terminal.wav");
  writeFileSync(helperPath, "");
  writeFileSync(wavPath, "");
  return { helperPath, wavPath };
}

describe("nodeSttHelperRunner", () => {
  it("spawns the helper with argument arrays and reads a final protocol result", async () => {
    const { helperPath, wavPath } = tempPair();
    const execFileImpl: ExecFileFn = vi.fn((file, args, options, callback) => {
      expect(file).toBe("/usr/local/bin/node");
      expect(args).toEqual([helperPath, wavPath]);
      expect(options.env?.VDA_STT_MODEL_DIR).toBe("/models/base.en");
      callback(null, '{"type":"final","text":"open terminal"}\n', "[stt] ok\n");
    });

    const stt = createNodeSttHelperRunner({
      helperPath,
      modelDir: "/models/base.en",
      nativeLibDir: "/native/lib",
      nodeExecutable: "/usr/local/bin/node",
      execFileImpl,
      env: { PATH: "/bin" },
    });

    await expect(stt.transcribeWav(wavPath)).resolves.toEqual({
      type: "final",
      text: "open terminal",
    });
    expect(execFileImpl).toHaveBeenCalledOnce();
  });

  it("returns a protocol error result without throwing", async () => {
    const { helperPath, wavPath } = tempPair();
    const execFileImpl: ExecFileFn = vi.fn((_file, _args, _options, callback) => {
      callback(
        null,
        '{"type":"error","message":"VDA_STT_MODEL_DIR is not set"}\n',
        ""
      );
    });

    const stt = createNodeSttHelperRunner({
      helperPath,
      modelDir: "/models/base.en",
      nativeLibDir: "/native/lib",
      nodeExecutable: "node",
      execFileImpl,
    });

    await expect(stt.transcribeWav(wavPath)).resolves.toEqual({
      type: "error",
      message: "VDA_STT_MODEL_DIR is not set",
    });
  });

  it("does not spawn when the WAV is missing", async () => {
    const { helperPath } = tempPair();
    const execFileImpl: ExecFileFn = vi.fn();
    const stt = createNodeSttHelperRunner({
      helperPath,
      modelDir: "/models/base.en",
      nativeLibDir: "/native/lib",
      nodeExecutable: "node",
      execFileImpl,
    });

    await expect(
      stt.transcribeWav("/tmp/does-not-exist-open-terminal.wav")
    ).resolves.toMatchObject({ type: "error" });
    expect(execFileImpl).not.toHaveBeenCalled();
  });
});
