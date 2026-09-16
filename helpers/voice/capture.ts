import { createRequire } from "node:module";
import { writeVoiceDebug } from "./protocol";

const require = createRequire(import.meta.url);

export type CaptureBufferSize =
  | { type: "default" }
  | { type: "fixed"; frames: number };

export type CaptureDeviceConfig = {
  sampleRate: number;
  channels: number;
  sampleFormat: string;
  bufferSize?: CaptureBufferSize;
};

export type CaptureInputStream = {
  play(): void;
  bufferSize(): number;
  close(): Promise<void> | void;
};

export type CaptureConvenience = {
  getDefaultInputDevice(): { name: string; deviceId: string } | null;
  getDefaultInputConfig(deviceId: string): CaptureDeviceConfig;
  createInputStream(options: {
    deviceId: string;
    config: CaptureDeviceConfig;
    autoStart?: boolean;
    onData: (data: ArrayLike<number>) => void;
    onError: (error: Error) => void;
  }): Promise<CaptureInputStream>;
};

export type StartCaptureOptions = {
  convenience?: CaptureConvenience;
  onStreamFailed?: (error: Error) => void;
};

export type CaptureSession = {
  deviceName: string;
  nativeSampleRate: number;
  nativeChannels: number;
  nativeFormat: string;
  configuredBufferSize: string;
  stop(): Promise<Float32Array>;
};

export class SampleAccumulator {
  private chunks: Array<ArrayLike<number>> = [];

  append(data: ArrayLike<number>): void {
    if (ArrayBuffer.isView(data) && "slice" in data) {
      this.chunks.push(
        (data as Float32Array | Int16Array | Int32Array).slice()
      );
      return;
    }
    this.chunks.push(Float32Array.from(data));
  }

  discard(): void {
    this.chunks = [];
  }

  get sampleCount(): number {
    return this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  take(formatName: string): Float32Array {
    const chunks = this.chunks;
    this.chunks = [];
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      if (formatName === "f32" && chunk instanceof Float32Array) {
        samples.set(chunk, offset);
      } else {
        const converted = toFloat32(chunk, formatName);
        samples.set(converted, offset);
      }
      offset += chunk.length;
    }
    return samples;
  }
}

function loadConvenience(): CaptureConvenience {
  const cpal = require("node-cpal") as { convenience: CaptureConvenience };
  return cpal.convenience;
}

function sampleScale(formatName: string): number {
  if (formatName === "i16") {
    return 32768;
  }
  if (formatName === "i32") {
    return 2147483648;
  }
  return 1;
}

function toFloat32(data: ArrayLike<number>, formatName: string): Float32Array {
  if (formatName === "f32") {
    return data instanceof Float32Array ? data : Float32Array.from(data);
  }
  const out = new Float32Array(data.length);
  const scale = sampleScale(formatName);
  for (let i = 0; i < data.length; i += 1) {
    out[i] = Number(data[i]) / scale;
  }
  return out;
}

export function describeBufferSize(
  configured: CaptureBufferSize | undefined,
  negotiatedFrames?: number
): string {
  if (configured?.type === "fixed") {
    return `fixed:${configured.frames}`;
  }
  if (typeof negotiatedFrames === "number") {
    return `default:${negotiatedFrames}`;
  }
  return "default";
}

export function mapCaptureError(error: unknown): {
  code: "MIC_PERMISSION_DENIED" | "MIC_DEVICE_NOT_FOUND" | "MIC_STREAM_FAILED";
  message: string;
} {
  const err = error as { code?: string; message?: string };
  const message = err.message ?? "Microphone capture failed.";
  const code = String(err.code ?? "").toUpperCase();
  if (
    code === "PERMISSION_DENIED" ||
    code.includes("PERMISSION") ||
    /permission denied|not authorized/i.test(message)
  ) {
    return { code: "MIC_PERMISSION_DENIED", message };
  }
  if (
    code === "DEVICE_NOT_AVAILABLE" ||
    code === "MIC_DEVICE_NOT_FOUND" ||
    /no default input|no microphone/i.test(message)
  ) {
    return { code: "MIC_DEVICE_NOT_FOUND", message };
  }
  return { code: "MIC_STREAM_FAILED", message };
}

async function closeQuietly(
  closeable: { close(): Promise<void> | void } | undefined
): Promise<void> {
  try {
    await closeable?.close();
  } catch {
    // Best-effort cleanup after a failed open or stream error.
  }
}

export async function startCapture(
  options: StartCaptureOptions = {}
): Promise<CaptureSession> {
  const convenience = options.convenience ?? loadConvenience();
  let device: { name: string; deviceId: string } | null;
  try {
    device = convenience.getDefaultInputDevice();
  } catch (error) {
    throw Object.assign(
      error instanceof Error ? error : new Error("No default input device."),
      { code: "MIC_DEVICE_NOT_FOUND" }
    );
  }
  if (!device) {
    throw Object.assign(new Error("No default input device."), {
      code: "MIC_DEVICE_NOT_FOUND",
    });
  }

  const selected = convenience.getDefaultInputConfig(device.deviceId);
  const bufferSize: CaptureBufferSize = selected.bufferSize ?? {
    type: "default",
  };
  const config: CaptureDeviceConfig = {
    sampleRate: selected.sampleRate,
    channels: selected.channels,
    sampleFormat: selected.sampleFormat,
    bufferSize,
  };

  const samples = new SampleAccumulator();
  let streamError: Error | undefined;
  let closed = false;
  let consumed = false;
  let published = false;
  let stream: CaptureInputStream | undefined;

  const failStream = (error: Error): void => {
    if (streamError || consumed) {
      return;
    }
    streamError = error;
    samples.discard();
    writeVoiceDebug(`stream error: ${error.message}`);
    void closeQuietly(stream).then(() => {
      closed = true;
      if (!consumed && published) {
        options.onStreamFailed?.(error);
      }
    });
  };

  stream = await convenience.createInputStream({
    deviceId: device.deviceId,
    config,
    autoStart: true,
    onData(data) {
      if (streamError || closed || consumed) {
        return;
      }
      samples.append(data);
    },
    onError(error) {
      failStream(error);
    },
  });

  if (streamError) {
    await closeQuietly(stream);
    throw streamError;
  }

  let negotiatedFrames: number | undefined;
  try {
    negotiatedFrames = stream.bufferSize();
  } catch {
    negotiatedFrames = undefined;
  }
  const configuredBufferSize = describeBufferSize(bufferSize, negotiatedFrames);

  writeVoiceDebug(`device=${device.name}`);
  writeVoiceDebug(`configuredSampleRate=${config.sampleRate}`);
  writeVoiceDebug(`configuredChannels=${config.channels}`);
  writeVoiceDebug(`configuredBufferSize=${configuredBufferSize}`);
  writeVoiceDebug(`nativeSampleRate=${config.sampleRate}`);
  writeVoiceDebug(`nativeChannels=${config.channels}`);
  writeVoiceDebug(`nativeFormat=${config.sampleFormat}`);

  published = true;
  const openedStream = stream;
  return {
    deviceName: device.name,
    nativeSampleRate: config.sampleRate,
    nativeChannels: config.channels,
    nativeFormat: String(config.sampleFormat),
    configuredBufferSize,
    async stop(): Promise<Float32Array> {
      consumed = true;
      closed = true;
      await closeQuietly(openedStream);
      if (streamError) {
        samples.discard();
        throw streamError;
      }
      return samples.take(String(config.sampleFormat));
    },
  };
}
