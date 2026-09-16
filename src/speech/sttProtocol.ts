export type SttSuccess = {
  type: "final";
  text: string;
};

export type SttFailure = {
  type: "error";
  message: string;
};

export type SttProtocolMessage = SttSuccess | SttFailure;

export function encodeSttMessage(message: SttProtocolMessage): string {
  return JSON.stringify(message);
}

export function readProtocolFromStdout(stdout: string): SttProtocolMessage {
  const line = stdout
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("{"));
  if (!line) {
    throw new Error("STT helper produced no protocol JSON on stdout.");
  }
  return parseSttMessage(line);
}

export function parseSttMessage(line: string): SttProtocolMessage {
  const parsed: unknown = JSON.parse(line);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("STT protocol message must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  if (record.type === "final" && typeof record.text === "string") {
    return { type: "final", text: record.text };
  }
  if (record.type === "error" && typeof record.message === "string") {
    return { type: "error", message: record.message };
  }
  throw new Error("STT protocol message is missing a valid type.");
}

export function writeProtocol(message: SttProtocolMessage): void {
  process.stdout.write(`${encodeSttMessage(message)}\n`);
}

export function writeDebug(message: string): void {
  process.stderr.write(`[stt] ${message}\n`);
}
