import { VoiceOutboundMessage } from "./pttProtocol";

export interface VoiceClient {
  ensureReady(): Promise<void>;
  start(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<VoiceOutboundMessage>;
  cancel(sessionId?: string): Promise<void>;
  dispose(): void;
}
