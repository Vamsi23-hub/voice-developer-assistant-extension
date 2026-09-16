import { describe, expect, it } from "vitest";
import { parseIntent } from "../src/core/parseIntent";

describe("parseIntent", () => {
  it("parses open terminal", () => {
    expect(parseIntent("open terminal")).toEqual({ kind: "openTerminal" });
  });

  it("parses open the terminal", () => {
    expect(parseIntent("open the terminal")).toEqual({ kind: "openTerminal" });
  });

  it("parses git status", () => {
    expect(parseIntent("git status")).toEqual({ kind: "gitStatus" });
  });

  it("parses show git status", () => {
    expect(parseIntent("show git status")).toEqual({ kind: "gitStatus" });
  });

  it("parses open package.json as a file", () => {
    expect(parseIntent("open package.json")).toEqual({
      kind: "openFile",
      filename: "package.json",
    });
  });

  it("parses open README.md as a file", () => {
    expect(parseIntent("open README.md")).toEqual({
      kind: "openFile",
      filename: "README.md",
    });
  });

  it("parses open file src/index.ts", () => {
    expect(parseIntent("open file src/index.ts")).toEqual({
      kind: "openFile",
      filename: "src/index.ts",
    });
  });

  it("parses open repo api", () => {
    expect(parseIntent("open repo api")).toEqual({
      kind: "openRepository",
      alias: "api",
    });
  });

  it("parses open repository api", () => {
    expect(parseIntent("open repository api")).toEqual({
      kind: "openRepository",
      alias: "api",
    });
  });

  it("parses open my-api when my-api is in the alias list", () => {
    expect(parseIntent("open my-api", { aliases: ["my-api"] })).toEqual({
      kind: "openRepository",
      alias: "my-api",
    });
  });

  it("keeps open file my-api as a file even when my-api is an alias", () => {
    expect(parseIntent("open file my-api", { aliases: ["my-api"] })).toEqual({
      kind: "openFile",
      filename: "my-api",
    });
  });

  it("prefers alias over file for a bare open token", () => {
    expect(parseIntent("open my-api", { aliases: ["my-api"] })).toEqual({
      kind: "openRepository",
      alias: "my-api",
    });
  });

  it("treats unknown input as unknown", () => {
    expect(parseIntent("run rm -rf /")).toEqual({
      kind: "unknown",
      text: "run rm -rf /",
    });
  });

  it("treats empty input as unknown", () => {
    expect(parseIntent("")).toEqual({ kind: "unknown", text: "" });
  });

  it("treats whitespace-only input as unknown", () => {
    expect(parseIntent("   \t  ")).toEqual({ kind: "unknown", text: "   \t  " });
  });

  it("normalizes case and extra spaces", () => {
    expect(parseIntent("  Open   The   Terminal  ")).toEqual({
      kind: "openTerminal",
    });
    expect(parseIntent("GIT   STATUS")).toEqual({ kind: "gitStatus" });
    expect(parseIntent("  Open  File   Src/Index.ts  ")).toEqual({
      kind: "openFile",
      filename: "Src/Index.ts",
    });
  });
});

const SITE_VISUAL_BUILDER_ALIASES = ["site visual builder"];

describe("parseIntent repository aliases", () => {
  it("parses open site visual builder", () => {
    expect(
      parseIntent("open site visual builder", {
        aliases: SITE_VISUAL_BUILDER_ALIASES,
      })
    ).toEqual({ kind: "openRepository", alias: "site visual builder" });
  });

  it("parses open site visual builder repo", () => {
    expect(
      parseIntent("open site visual builder repo", {
        aliases: SITE_VISUAL_BUILDER_ALIASES,
      })
    ).toEqual({ kind: "openRepository", alias: "site visual builder" });
  });

  it("parses open site visual builder repository", () => {
    expect(
      parseIntent("open site visual builder repository", {
        aliases: SITE_VISUAL_BUILDER_ALIASES,
      })
    ).toEqual({ kind: "openRepository", alias: "site visual builder" });
  });

  it("parses open repo site visual builder", () => {
    expect(
      parseIntent("open repo site visual builder", {
        aliases: SITE_VISUAL_BUILDER_ALIASES,
      })
    ).toEqual({ kind: "openRepository", alias: "site visual builder" });
  });

  it("parses open repository site visual builder", () => {
    expect(
      parseIntent("open repository site visual builder", {
        aliases: SITE_VISUAL_BUILDER_ALIASES,
      })
    ).toEqual({ kind: "openRepository", alias: "site visual builder" });
  });

  it("parses open site-visual-builder", () => {
    expect(
      parseIntent("open site-visual-builder", {
        aliases: SITE_VISUAL_BUILDER_ALIASES,
      })
    ).toEqual({ kind: "openRepository", alias: "site-visual-builder" });
  });

  it("matches case and spacing variations", () => {
    expect(
      parseIntent("  Open   SITE-visual   BUILDER  ", {
        aliases: SITE_VISUAL_BUILDER_ALIASES,
      })
    ).toEqual({ kind: "openRepository", alias: "SITE-visual BUILDER" });
  });

  it("keeps explicit open file in front of repository phrasing", () => {
    expect(
      parseIntent("open file site visual builder repo", {
        aliases: SITE_VISUAL_BUILDER_ALIASES,
      })
    ).toEqual({
      kind: "openFile",
      filename: "site visual builder repo",
    });
  });

  it("treats an unknown open repo phrase as a repository, not a file", () => {
    expect(parseIntent("open repo some unknown project")).toEqual({
      kind: "openRepository",
      alias: "some unknown project",
    });
  });

  it("treats a trailing repo word as repository context even without a known alias", () => {
    expect(parseIntent("open some unknown project repo")).toEqual({
      kind: "openRepository",
      alias: "some unknown project",
    });
  });

  it("still parses open package.json as a file", () => {
    expect(
      parseIntent("open package.json", {
        aliases: SITE_VISUAL_BUILDER_ALIASES,
      })
    ).toEqual({
      kind: "openFile",
      filename: "package.json",
    });
  });
});
