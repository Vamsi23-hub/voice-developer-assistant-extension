import { CommandEngine } from "../core/commandEngine";
import { parseIntent } from "../core/parseIntent";
import { ResponseOutput } from "../ports/ports";
import { VoiceOutboundMessage } from "./pttProtocol";
import { normalizeTranscript } from "./normalizeTranscript";

export type ExecuteRecognizedSpeechOptions = {
  transcript: string;
  aliases: string[];
  engine: CommandEngine;
  output: ResponseOutput;
};

export async function executeRecognizedSpeech(
  options: ExecuteRecognizedSpeechOptions
): Promise<void> {
  const normalized = normalizeTranscript(options.transcript);
  if (!normalized) {
    await options.output.error(
      "Speech recognition produced an empty transcript."
    );
    return;
  }

  await options.output.info(`Heard: "${normalized}"`);
  const intent = parseIntent(normalized, { aliases: options.aliases });
  await options.engine.execute(intent);
}

export function createVoiceFinalGate(): { consume(): boolean } {
  let consumed = false;
  return {
    consume(): boolean {
      if (consumed) {
        return false;
      }
      consumed = true;
      return true;
    },
  };
}

export type VoiceUserAction = "final" | "error" | "cancel" | "recording";

export function voiceActionShouldExecute(action: VoiceUserAction): boolean {
  return action === "final";
}

export async function handleVoiceStopResult(options: {
  result: VoiceOutboundMessage;
  aliases: string[];
  engine: CommandEngine;
  output: ResponseOutput;
  gate: { consume(): boolean };
}): Promise<void> {
  if (options.result.type !== "final") {
    if (options.result.type === "error") {
      await options.output.error(options.result.message);
    }
    return;
  }
  if (!options.gate.consume()) {
    return;
  }
  options.output.debug(
    `push-to-talk final: ${JSON.stringify(options.result.text)}`
  );
  await executeRecognizedSpeech({
    transcript: options.result.text,
    aliases: options.aliases,
    engine: options.engine,
    output: options.output,
  });
}
