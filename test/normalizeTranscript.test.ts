import { describe, expect, it } from "vitest";
import {
  isAcceptableRecognition,
  normalizeTranscript,
} from "../src/speech/normalizeTranscript";

describe("normalizeTranscript", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeTranscript("  Open   TERMINAL  ")).toBe("open terminal");
  });

  it("strips trailing command punctuation", () => {
    expect(normalizeTranscript("Open terminal.")).toBe("open terminal");
    expect(normalizeTranscript("git status!")).toBe("git status");
    expect(normalizeTranscript("open storefront?")).toBe("open storefront");
    expect(normalizeTranscript("open package json,")).toBe("open package json");
    expect(normalizeTranscript("open terminal...")).toBe("open terminal");
  });

  it("does not substitute similar words", () => {
    expect(normalizeTranscript("open integral.")).toBe("open integral");
    expect(isAcceptableRecognition("open integral.", "open terminal")).toBe(
      false
    );
  });

  it("does not rewrite punctuation in the middle of a phrase", () => {
    expect(normalizeTranscript("open, terminal")).toBe("open, terminal");
  });

  it("accepts exact phrases after safe normalization", () => {
    expect(isAcceptableRecognition("Open terminal.", "open terminal")).toBe(
      true
    );
  });
});
