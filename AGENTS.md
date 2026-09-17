# Voice Developer Assistant

## Technology

- Use TypeScript.
- Use stable VS Code Extension APIs only.
- Do not use proposed VS Code APIs.
- Use pnpm.
- Use esbuild for production bundling.

## Architecture

Keep IDE-independent logic separate from VS Code code.

Core logic must not import `vscode`.

Use these layers:

1. speech input
2. intent parser
3. command engine
4. safety validation
5. IDE adapter
6. response output

## Command execution

Never directly execute raw speech as a shell command.

Speech must first be converted into a structured Intent.

Prefer `execFile` or `spawn` with argument arrays instead of shell strings.

Git status is shown in a named integrated terminal using only the fixed
trusted command `git status`. Never send recognized speech to
`terminal.sendText`.

Dangerous Git or filesystem operations must require explicit user confirmation.

## Initial MVP

Only implement:

- Open terminal
- Git status
- Open file
- Open repository

InputBox command entry remains available.

A development STT fixture command may transcribe a local WAV through the
helper child process.

Phase 2C-B may execute one microphone final transcript through
normalizeTranscript, parseIntent, validateIntent, and commandEngine.
Only one push-to-talk session may be active from recording start through
command completion. Do not return to idle until that pipeline finishes.
Do not execute partials, errors, or cancelled recordings.
Do not implement continuous listening, wake word, TTS, cloud APIs, or
LLM features.