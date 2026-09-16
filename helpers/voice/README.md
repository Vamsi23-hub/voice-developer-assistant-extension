# Local voice helper (Phase 2C-A)

Long-lived Node process. Captures the default microphone with `node-cpal`,
normalizes to 16 kHz mono, and transcribes **once** with Whisper via
`sherpa-onnx-node`.

It does not execute commands. The extension shows `Heard: "..."` and stops.

stdin (one JSON object per line):

```json
{"type":"start"}
{"type":"stop"}
{"type":"cancel"}
```

stdout protocol only. Debug logs go to stderr.
