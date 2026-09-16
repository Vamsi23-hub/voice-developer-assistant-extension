import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findFilesOnDisk,
  pickWorkspaceRoot,
  readExtensionDevelopmentPath,
} from "../src/adapters/workspacePaths";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("pickWorkspaceRoot", () => {
  it("prefers the active editor folder", () => {
    expect(
      pickWorkspaceRoot({
        activeEditorFolder: "/active",
        firstWorkspaceFolder: "/first",
        developmentFallback: "/dev",
      })
    ).toBe("/active");
  });

  it("uses the first workspace folder when no active editor folder exists", () => {
    expect(
      pickWorkspaceRoot({
        firstWorkspaceFolder: "/first",
        developmentFallback: "/dev",
      })
    ).toBe("/first");
  });

  it("uses the development fallback when vscode reports no workspace", () => {
    expect(
      pickWorkspaceRoot({
        developmentFallback: "/dev",
      })
    ).toBe("/dev");
  });

  it("returns undefined when nothing is available", () => {
    expect(pickWorkspaceRoot({})).toBeUndefined();
  });
});

describe("readExtensionDevelopmentPath", () => {
  it("reads the equals form", () => {
    expect(
      readExtensionDevelopmentPath([
        "--type=extensionHost",
        "--extensionDevelopmentPath=/tmp/ext",
      ])
    ).toBe("/tmp/ext");
  });

  it("reads the split form", () => {
    expect(
      readExtensionDevelopmentPath([
        "--extensionDevelopmentPath",
        "/tmp/ext",
      ])
    ).toBe("/tmp/ext");
  });

  it("ignores unrelated args", () => {
    expect(readExtensionDevelopmentPath(["--disable-extensions"])).toBeUndefined();
  });
});

describe("findFilesOnDisk", () => {
  it("finds package.json at the repo root and skips node_modules", () => {
    const matches = findFilesOnDisk(repoRoot, "package.json");
    expect(matches).toContain(path.join(repoRoot, "package.json"));
    expect(
      matches.every((filePath) => !filePath.includes(`${path.sep}node_modules${path.sep}`))
    ).toBe(true);
  });

  it("finds a nested source file", () => {
    expect(findFilesOnDisk(repoRoot, "src/extension.ts")).toEqual([
      path.join(repoRoot, "src/extension.ts"),
    ]);
  });
});
