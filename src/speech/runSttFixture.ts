import { CommandEngine } from "../core/commandEngine";
import { ResponseOutput } from "../ports/ports";
import { SttClient } from "./sttClient";
import { executeRecognizedSpeech } from "./executeRecognizedSpeech";

export type RunSttFixtureOptions = {
  wavPath: string;
  stt: SttClient;
  aliases: string[];
  engine: CommandEngine;
  output: ResponseOutput;
};

export async function runSttFixture(
  options: RunSttFixtureOptions
): Promise<void> {
  const result = await options.stt.transcribeWav(options.wavPath);
  if (result.type === "error") {
    await options.output.error(
      `Speech recognition failed: ${result.message}`
    );
    return;
  }

  await executeRecognizedSpeech({
    transcript: result.text,
    aliases: options.aliases,
    engine: options.engine,
    output: options.output,
  });
}
