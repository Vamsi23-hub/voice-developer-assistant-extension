import { describe, expect, it } from "vitest";
import { normalizeAlias } from "../src/core/normalizeAlias";

describe("normalizeAlias", () => {
  it("normalizes mixed case, spacing, and hyphens to the same key", () => {
    expect(normalizeAlias("Site Visual Builder")).toBe("site visual builder");
    expect(normalizeAlias("site visual builder")).toBe("site visual builder");
    expect(normalizeAlias("  SITE   VISUAL BUILDER ")).toBe(
      "site visual builder"
    );
    expect(normalizeAlias("site-visual-builder")).toBe("site visual builder");
  });
});
