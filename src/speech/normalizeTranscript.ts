const TRAILING_PUNCTUATION = new Set([".", ",", "!", "?"]);

/**
 * Safe STT cleanup only. Does not substitute words
 * (for example "integral" is never rewritten as "terminal").
 */
export function normalizeTranscript(text: string): string {
  let normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  while (
    normalized.length > 0 &&
    TRAILING_PUNCTUATION.has(normalized.at(-1) ?? "")
  ) {
    normalized = normalized.slice(0, -1).trimEnd();
  }
  return normalized;
}

export function isAcceptableRecognition(
  rawTranscript: string,
  expectedPhrase: string
): boolean {
  const actual = normalizeTranscript(rawTranscript);
  const expected = normalizeTranscript(expectedPhrase);
  return actual.length > 0 && actual === expected;
}
