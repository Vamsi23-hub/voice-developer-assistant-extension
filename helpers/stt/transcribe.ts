import { createRequire } from "node:module";
import { resolveModelFiles } from "./resolveModel";

const require = createRequire(import.meta.url);

type SherpaWave = {
  sampleRate: number;
  samples: Float32Array;
};

type SherpaResult = {
  text?: string;
};

type SherpaOnnx = {
  OfflineRecognizer: new (config: unknown) => {
    createStream: () => {
      acceptWaveform: (wave: {
        sampleRate: number;
        samples: Float32Array;
      }) => void;
    };
    decode: (stream: unknown) => void;
    getResult: (stream: unknown) => SherpaResult;
  };
  readWave: (filename: string) => SherpaWave;
};

function loadSherpa(): SherpaOnnx {
  // Loaded only inside the helper process, never by the extension bundle.
  return require("sherpa-onnx-node") as SherpaOnnx;
}

function recognizerConfig(files: ReturnType<typeof resolveModelFiles>): unknown {
  const shared = {
    featConfig: {
      sampleRate: 16000,
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

export type TranscribeResult = {
  text: string;
  kind: "whisper" | "transducer";
  encoder: string;
  decoder: string;
  tokens: string;
  loadMs: number;
  decodeMs: number;
};

export function transcribeWav(
  wavPath: string,
  modelDir: string
): TranscribeResult {
  const files = resolveModelFiles(modelDir);
  const loadStarted = Date.now();
  const sherpa = loadSherpa();
  const recognizer = new sherpa.OfflineRecognizer(recognizerConfig(files));
  const loadMs = Date.now() - loadStarted;

  const decodeStarted = Date.now();
  const stream = recognizer.createStream();
  const wave = sherpa.readWave(wavPath);
  stream.acceptWaveform({
    sampleRate: wave.sampleRate,
    samples: wave.samples,
  });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  const decodeMs = Date.now() - decodeStarted;

  return {
    text: (result.text ?? "").trim(),
    kind: files.kind,
    encoder: files.encoder,
    decoder: files.decoder,
    tokens: files.tokens,
    loadMs,
    decodeMs,
  };
}
