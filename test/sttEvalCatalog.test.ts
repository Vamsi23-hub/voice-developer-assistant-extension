import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("STT eval catalog", () => {
  it("lists the Phase 2A developer-command phrases", () => {
    const catalogPath = path.join(
      process.cwd(),
      "helpers",
      "stt",
      "eval-catalog.json"
    );
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      phrases: Array<{ file: string; expected: string }>;
    };
    expect(catalog.phrases.map((phrase) => phrase.expected)).toEqual([
      "open terminal",
      "git status",
      "open package json",
      "open site visual builder",
      "open storefront",
    ]);
  });
});
