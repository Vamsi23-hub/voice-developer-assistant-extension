import {
  encodeVoiceMessage,
  VoiceOutboundMessage,
} from "../../src/speech/pttProtocol";

export function writeVoiceProtocol(message: VoiceOutboundMessage): void {
  process.stdout.write(`${encodeVoiceMessage(message)}\n`);
}

export function writeVoiceDebug(message: string): void {
  process.stderr.write(`[voice] ${message}\n`);
}
