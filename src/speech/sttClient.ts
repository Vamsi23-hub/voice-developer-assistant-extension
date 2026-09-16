import { SttProtocolMessage } from "./sttProtocol";

export interface SttClient {
  transcribeWav(wavPath: string): Promise<SttProtocolMessage>;
}
