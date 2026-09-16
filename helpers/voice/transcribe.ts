import { createRequire } from "node:module";
import { resolveModelFiles } from "../stt/resolveModel";

const require = createRequire(import.meta.url);

type SherpaResult = {
  text?: string;
};

type SherpaRecognizer = {
  createStream: () => {
    acceptWaveform: (wave: {
      sampleRate: number;
      samples: Float32Array;
    }) => void;
  };
  decode: (stream: unknown) => void;
  getResult: (stream: unknown) => SherpaResult;
};

type LinearResampler = {
  resample: (samples: Float32Array) => Float32Array;
  flush: (samples: Float32Array) => Float32Array;
};

export type ResamplerHost = {
  LinearResampler: new (
    inputSampleRate: number,
    outputSampleRate: number
  ) => LinearResampler;
};

type SherpaOnnx = ResamplerHost & {
  OfflineRecognizer: new (config: unknown) => SherpaRecognizer;
};

export const TARGET_SAMPLE_RATE = 16000;
const MIN_DURATION_SECONDS = 0.25;

function loadSherpa(): SherpaOnnx {
  return require("sherpa-onnx-node") as SherpaOnnx;
}

function recognizerConfig(
  files: ReturnType<typeof resolveModelFiles>
): unknown {
  const shared = {
    featConfig: {
      sampleRate: TARGET_SAMPLE_RATE,
      featureDim: 80,
    },
    modelConfig: {
      tokens: files.tokens,
      numThreads: 1,
      provider: "cpu",
      debug: 0,
    },
  };
  if (files.kind === "transducer") {
    return {
      ...shared,
      modelConfig: {
        ...shared.modelConfig,
        transducer: {
          encoder: files.encoder,
          decoder: files.decoder,
          joiner: files.joiner,
        },
      },
    };
  }
  return {
    ...shared,
    modelConfig: {
      ...shared.modelConfig,
      whisper: {
        encoder: files.encoder,
        decoder: files.decoder,
      },
    },
  };
}

export type LoadedRecognizer = {
  recognizer: SherpaRecognizer;
  sherpa: SherpaOnnx;
  loadMs: number;
  encoder: string;
  decoder: string;
  tokens: string;
};

export function loadRecognizer(modelDir: string): LoadedRecognizer {
  const files = resolveModelFiles(modelDir);
  const started = Date.now();
  const sherpa = loadSherpa();
  const recognizer = new sherpa.OfflineRecognizer(recognizerConfig(files));
  return {
    recognizer,
    sherpa,
    loadMs: Date.now() - started,
    encoder: files.encoder,
    decoder: files.decoder,
    tokens: files.tokens,
  };
}

export function downmixToMono(
  samples: Float32Array,
  channels: number
): Float32Array {
  if (channels <= 1) {
    return samples;
  }
  const frames = Math.floor(samples.length / channels);
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += samples[frame * channels + channel] ?? 0;
    }
    mono[frame] = sum / channels;
  }
  return mono;
}

export function resampleTo16k(
  sherpa: ResamplerHost,
  samples: Float32Array,
  inputSampleRate: number
): Float32Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) {
    return samples;
  }
  const resampler = new sherpa.LinearResampler(
    inputSampleRate,
    TARGET_SAMPLE_RATE
  );
  return resampler.flush(samples);
}

export function durationSeconds(
  samples: Float32Array,
  sampleRate: number,
  channels: number
): number {
  if (sampleRate <= 0 || channels <= 0 || samples.length === 0) {
    return 0;
  }
  return samples.length / channels / sampleRate;
}

export function isTooShort(mono16k: Float32Array): boolean {
  return mono16k.length < TARGET_SAMPLE_RATE * MIN_DURATION_SECONDS;
}

export function transcribeMono16k(
  loaded: LoadedRecognizer,
  samples: Float32Array
): { text: string; decodeMs: number } {
  const started = Date.now();
  const stream = loaded.recognizer.createStream();
  stream.acceptWaveform({
    sampleRate: TARGET_SAMPLE_RATE,
    samples,
  });
  loaded.recognizer.decode(stream);
  const result = loaded.recognizer.getResult(stream);
  return {
    text: (result.text ?? "").trim(),
    decodeMs: Date.now() - started,
  };
}
