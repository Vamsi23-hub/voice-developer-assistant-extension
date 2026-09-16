Place 16 kHz, mono, PCM WAV recordings in this directory.

Catalog phrases:

| File | Spoken phrase |
| --- | --- |
| `open-terminal.wav` | open terminal |
| `git-status.wav` | git status |
| `open-package-json.wav` | open package json |
| `open-site-visual-builder.wav` | open site visual builder |
| `open-storefront.wav` | open storefront |

WAV files are gitignored. The STT helper does not generate or download them.

Smoke-test one file, several files, or this whole directory:

```bash
pnpm stt:test
pnpm stt:test -- helpers/stt/fixtures/git-status.wav
pnpm stt:test -- helpers/stt/fixtures
```

Accuracy report (safe normalization only; no word substitution):

```bash
pnpm stt:eval
```

In the editor, after F5: **Voice Developer Assistant: Run STT Fixture**.
