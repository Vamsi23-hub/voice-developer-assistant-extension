import { describe, expect, it } from "vitest";
import {
  CaptureConvenience,
  CaptureDeviceConfig,
  describeBufferSize,
  mapCaptureError,
  SampleAccumulator,
  startCapture,
} from "../helpers/voice/capture";
import { resampleTo16k } from "../helpers/voice/transcribe";

type FakeStream = {
  closed: boolean;
  play(): void;
  bufferSize(): number;
  close(): Promise<void>;
};

type FakeMic = {
  emitData: (data: ArrayLike<number>) => void;
  emitError: (error: Error) => void;
  closedCount: number;
  createdConfig?: CaptureDeviceConfig;
  stream?: FakeStream;
};

function xrun(): Error {
  return Object.assign(new Error("A buffer underrun or overrun occurred."), {
    code: "XRUN",
  });
}

function createFakeConvenience(mic: FakeMic): CaptureConvenience {
  return {
    getDefaultInputDevice() {
      return { name: "MacBook Pro Microphone", deviceId: "mic-1" };
    },
    getDefaultInputConfig() {
      return {
        sampleRate: 48000,
        channels: 1,
        sampleFormat: "f32",
        bufferSize: { type: "default" },
      };
    },
    async createInputStream(options) {
      mic.createdConfig = options.config;
      const stream: FakeStream = {
        closed: false,
        play() {},
        bufferSize() {
          return 512;
        },
        async close() {
          stream.closed = true;
          mic.closedCount += 1;
        },
      };
      mic.stream = stream;
      mic.emitData = (data) => options.onData(data);
      mic.emitError = (error) => options.onError(error);
      if (options.autoStart) {
        stream.play();
      }
      return stream;
    },
  };
}

describe("SampleAccumulator", () => {
  it("copies chunks and concatenates on take", () => {
    const first = new Float32Array([1, 2]);
    const buffer = new SampleAccumulator();
    buffer.append(first);
    first[0] = 9;
    expect(Array.from(buffer.take("f32"))).toEqual([1, 2]);
  });

  it("discards partial audio", () => {
    const buffer = new SampleAccumulator();
    buffer.append(new Float32Array([1, 2, 3]));
    buffer.discard();
    expect(buffer.sampleCount).toBe(0);
    expect(buffer.take("f32")).toHaveLength(0);
  });
});

describe("startCapture convenience stream", () => {
  it("uses the device default buffer and native 48 kHz mono", async () => {
    const mic: FakeMic = {
      emitData() {},
      emitError() {},
      closedCount: 0,
    };
    const session = await startCapture({
      convenience: createFakeConvenience(mic),
    });
    expect(mic.createdConfig).toMatchObject({
      sampleRate: 48000,
      channels: 1,
      sampleFormat: "f32",
      bufferSize: { type: "default" },
    });
    expect(session.nativeSampleRate).toBe(48000);
    expect(session.nativeChannels).toBe(1);
    expect(session.configuredBufferSize).toBe("default:512");
    mic.emitData(new Float32Array([0.5, -0.5]));
    await expect(session.stop()).resolves.toEqual(new Float32Array([0.5, -0.5]));
    expect(mic.closedCount).toBe(1);
  });

  it("discards partial audio and closes on stream XRUN", async () => {
    const mic: FakeMic = {
      emitData() {},
      emitError() {},
      closedCount: 0,
    };
    const failures: Error[] = [];
    const session = await startCapture({
      convenience: createFakeConvenience(mic),
      onStreamFailed(error) {
        failures.push(error);
      },
    });
    mic.emitData(new Float32Array([1, 2, 3, 4]));
    mic.emitError(xrun());
    await expect.poll(() => failures.length).toBe(1);
    expect(mic.stream?.closed).toBe(true);
    await expect(session.stop()).rejects.toMatchObject({ code: "XRUN" });
    expect(mic.closedCount).toBeGreaterThanOrEqual(1);
  });

  it("stop after stream failure does not return partial samples", async () => {
    const mic: FakeMic = {
      emitData() {},
      emitError() {},
      closedCount: 0,
    };
    const session = await startCapture({
      convenience: createFakeConvenience(mic),
    });
    mic.emitData(new Float32Array([0.25, 0.5]));
    mic.emitError(xrun());
    await expect(session.stop()).rejects.toMatchObject({ code: "XRUN" });
  });

  it("can start a new recording after a stream failure", async () => {
    const first: FakeMic = {
      emitData() {},
      emitError() {},
      closedCount: 0,
    };
    const failed = await startCapture({
      convenience: createFakeConvenience(first),
    });
    first.emitError(xrun());
    await expect(failed.stop()).rejects.toMatchObject({ code: "XRUN" });

    const second: FakeMic = {
      emitData() {},
      emitError() {},
      closedCount: 0,
    };
    const session = await startCapture({
      convenience: createFakeConvenience(second),
    });
    second.emitData(new Float32Array([0.1, 0.2, 0.3]));
    await expect(session.stop()).resolves.toEqual(
      new Float32Array([0.1, 0.2, 0.3])
    );
  });
});

describe("buffer size labels", () => {
  it("prefers default over a forced small fixed size", () => {
    expect(describeBufferSize({ type: "default" }, 512)).toBe("default:512");
    expect(describeBufferSize({ type: "fixed", frames: 64 })).toBe("fixed:64");
  });
});

describe("microphone error mapping", () => {
  it("maps XRUN underrun/overrun to MIC_STREAM_FAILED", () => {
    expect(mapCaptureError(xrun())).toMatchObject({
      code: "MIC_STREAM_FAILED",
    });
  });
});

describe("post-capture resampling", () => {
  it("resamples successful 48 kHz capture to 16 kHz after stop", () => {
    const input = new Float32Array(48000);
    const sherpa = {
      LinearResampler: class {
        constructor(
          readonly inputSampleRate: number,
          readonly outputSampleRate: number
        ) {}
        resample(samples: Float32Array): Float32Array {
          return samples;
        }
        flush(samples: Float32Array): Float32Array {
          expect(this.inputSampleRate).toBe(48000);
          expect(this.outputSampleRate).toBe(16000);
          return new Float32Array(
            Math.round((samples.length * 16000) / 48000)
          );
        }
      },
    };
    const normalized = resampleTo16k(sherpa, input, 48000);
    expect(normalized).toHaveLength(16000);
  });

  it("does not resample audio that is already 16 kHz", () => {
    const input = new Float32Array([1, 2, 3]);
    const sherpa = {
      LinearResampler: class {
        constructor() {
          throw new Error("should not resample 16 kHz audio");
        }
        resample(): Float32Array {
          throw new Error("unused");
        }
        flush(): Float32Array {
          throw new Error("unused");
        }
      },
    };
    expect(resampleTo16k(sherpa, input, 16000)).toBe(input);
  });
});
