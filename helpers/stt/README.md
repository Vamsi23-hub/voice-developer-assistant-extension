# Local STT helper (Phase 2A / 2B)

This helper transcribes a **local 16 kHz mono WAV** with `sherpa-onnx-node` in a **separate Node process**. It does not capture the microphone and is not loaded by the VS Code extension bundle.

The current **development** model is **sherpa-onnx Whisper base.en**, selected with `VDA_STT_MODEL_DIR` or `voiceDeveloperAssistant.sttModelDir`. tiny.en remains supported if you point the same setting at that directory. Do not hardcode a machine-specific path.

In the editor, run **Voice Developer Assistant: Run STT Fixture**. That command spawns this helper, reads the JSON protocol from stdout, safely normalizes the transcript, then passes it to the existing intent pipeline. It does not import `sherpa-onnx-node` into the Extension Host.

## WAV fixtures

Place 16 kHz, mono, PCM WAV files here:

```text
helpers/stt/fixtures/
```

The accuracy catalog currently expects:

| File | Spoken phrase |
| --- | --- |
| `open-terminal.wav` | open terminal |
| `git-status.wav` | git status |
| `open-package-json.wav` | open package json |
| `open-site-visual-builder.wav` | open site visual builder |
| `open-storefront.wav` | open storefront |

Do not commit generated recordings unless you created them yourself. The helper will not download, synthesize, or rewrite audio.

## Smoke test

```bash
export VDA_STT_MODEL_DIR=/absolute/path/to/sherpa-onnx-whisper-base.en
pnpm stt:test
```

Test any WAV, several WAVs, or a directory of WAVs:

```bash
pnpm stt:test -- helpers/stt/fixtures/open-terminal.wav
pnpm stt:test -- helpers/stt/fixtures/open-terminal.wav helpers/stt/fixtures/git-status.wav
pnpm stt:test -- helpers/stt/fixtures
```

Stdout is protocol JSON only, one object per file:

```json
{"type":"final","text":"..."}
```

Debug, model paths, `loadMs`, `decodeMs`, `durationMs`, and `wallMs` stay on stderr.

## Accuracy evaluation

Safe normalization (lowercase, whitespace, trailing `. , ! ?`) is also applied
before `parseIntent` in the Phase 2B fixture command. It is not a semantic
correction.

```bash
export VDA_STT_MODEL_DIR=/absolute/path/to/sherpa-onnx-whisper-base.en
pnpm stt:eval
```

Compare another English Whisper model by pointing the same env var at a different directory:

```bash
export VDA_STT_MODEL_DIR=/absolute/path/to/sherpa-onnx-whisper-base.en
pnpm stt:eval
```

Missing catalog WAVs are reported as pending. Do not hardcode phrase substitutions to make a mismatch look successful.

## Model directory

Set `VDA_STT_MODEL_DIR` to an **absolute** path. Do not hardcode a machine-specific path in source. Keep `tiny.en` available even if you also download `base.en`.

### tiny.en (still supported)

```bash
mkdir -p models
curl -L -o models/sherpa-onnx-whisper-tiny.en.tar.bz2 \
  https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2
tar xjf models/sherpa-onnx-whisper-tiny.en.tar.bz2 -C models
export VDA_STT_MODEL_DIR=$PWD/models/sherpa-onnx-whisper-tiny.en
```

Expected files:

```text
tiny.en-encoder.int8.onnx
tiny.en-decoder.int8.onnx
tiny.en-tokens.txt
```

Approximate int8 size on disk: encoder ~12 MB + decoder ~86 MB ≈ **98 MB**.

### base.en (current development default)

Same helper and `VDA_STT_MODEL_DIR` contract. No architecture change.

```bash
curl -L -o models/sherpa-onnx-whisper-base.en.tar.bz2 \
  https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.en.tar.bz2
tar xjf models/sherpa-onnx-whisper-base.en.tar.bz2 -C models
export VDA_STT_MODEL_DIR=$PWD/models/sherpa-onnx-whisper-base.en
```

Expected files:

```text
base.en-encoder.int8.onnx
base.en-decoder.int8.onnx
base.en-tokens.txt
```

Approximate int8 size on disk: encoder ~29 MB + decoder ~131 MB ≈ **160 MB** (~1.6× tiny.en).

Zipformer transducer folders also work if they contain `encoder*.onnx`, `decoder*.onnx`, `joiner*.onnx`, and `tokens.txt`.

`models/` is gitignored. Models are not bundled into the extension VSIX.

## Native libraries (macOS ARM64)

`pnpm stt:test` and `pnpm stt:eval` start a **new Node process** and set `DYLD_LIBRARY_PATH` **only on that process**. They do not change your shell profile.

The path is the installed package:

```text
sherpa-onnx-darwin-arm64
```

On Linux the script sets `LD_LIBRARY_PATH` the same way. Windows does not need an extra library path.

Do not run `dist-helper/stt.mjs` directly unless you set the library path on that process yourself.

## Protocol

Success (stdout only):

```json
{"type":"final","text":"open terminal"}
```

Failure (stdout only):

```json
{"type":"error","message":"..."}
```

Debug logs go to stderr.
