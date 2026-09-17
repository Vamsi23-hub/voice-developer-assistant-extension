import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseIntent } from "../src/core/parseIntent";
import {
  assertTrustedTerminalCommand,
  TRUSTED_GIT_STATUS_COMMAND,
  trustedTerminalCommandForIntent,
} from "../src/core/trustedTerminalCommand";

describe("trustedTerminalCommandForIntent", () => {
  it("maps gitStatus only to the fixed git status command", () => {
    expect(trustedTerminalCommandForIntent({ kind: "gitStatus" })).toBe(
      TRUSTED_GIT_STATUS_COMMAND
    );
    expect(TRUSTED_GIT_STATUS_COMMAND).toBe("git status");
  });

  it("does not map arbitrary recognized text to a terminal command", () => {
    const dangerous = parseIntent("rm -rf /");
    expect(trustedTerminalCommandForIntent(dangerous)).toBeUndefined();
    expect(
      trustedTerminalCommandForIntent({
        kind: "unknown",
        text: "git status && rm -rf /",
      })
    ).toBeUndefined();
    expect(
      trustedTerminalCommandForIntent({
        kind: "unknown",
        text: "get status",
      })
    ).toBeUndefined();
  });

  it("does not map openFile, openTerminal, or openRepository to a shell command", () => {
    expect(
      trustedTerminalCommandForIntent({
        kind: "openFile",
        filename: "git status",
      })
    ).toBeUndefined();
    expect(
      trustedTerminalCommandForIntent({ kind: "openTerminal" })
    ).toBeUndefined();
    expect(
      trustedTerminalCommandForIntent({
        kind: "openRepository",
        alias: "git status",
      })
    ).toBeUndefined();
  });

  it("rejects untrusted sendText payloads", () => {
    expect(() => assertTrustedTerminalCommand("git status")).not.toThrow();
    expect(() => assertTrustedTerminalCommand("rm -rf /")).toThrow(
      /untrusted text/
    );
    expect(() => assertTrustedTerminalCommand("get status")).toThrow(
      /untrusted text/
    );
    expect(() =>
      assertTrustedTerminalCommand("git status && echo pwned")
    ).toThrow(/untrusted text/);
  });
});

describe("VS Code terminal adapter", () => {
  it("sends only the trusted command variable to sendText", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src", "adapters", "vscodeIdeAdapter.ts"),
      "utf8"
    );
    expect(source).toMatch(/assertTrustedTerminalCommand\(command\)/);
    expect(source).toMatch(/terminal\.sendText\(command\)/);
    expect(source).not.toMatch(/sendText\([^)]*transcript/);
    expect(source).not.toMatch(/sendText\([^)]*normalized/);
    expect(source).not.toMatch(/sendText\([^)]*intent\.text/);
  });
});
