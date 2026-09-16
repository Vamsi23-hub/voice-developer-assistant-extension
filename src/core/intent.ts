export type Intent =
  | { kind: "openTerminal" }
  | { kind: "gitStatus" }
  | { kind: "openFile"; filename: string }
  | { kind: "openRepository"; alias: string }
  | { kind: "unknown"; text: string };

export type ParseIntentOptions = {
  aliases?: string[];
};
