import { describe, expect, it } from "vitest";
import { formatGitStatus, parseGitStatus } from "../src/core/parseGitStatus";

const cleanStdout = `# branch.oid abcdef0123456789
# branch.head main
# branch.upstream origin/main
# branch.ab +0 -0
`;

const dirtyStdout = `# branch.oid abcdef0123456789
# branch.head feature
1 .M N... 100644 100644 100644 abc abc src/foo.ts
? untracked.ts
`;

describe("parseGitStatus", () => {
  it("parses a clean porcelain v2 working tree", () => {
    expect(parseGitStatus(cleanStdout)).toEqual({
      branch: "main",
      clean: true,
      raw: cleanStdout,
    });
  });

  it("parses a dirty porcelain v2 working tree", () => {
    expect(parseGitStatus(dirtyStdout)).toEqual({
      branch: "feature",
      clean: false,
      raw: dirtyStdout,
    });
  });

  it("omits branch when git does not report one", () => {
    const stdout = "? untracked.ts\n";
    expect(parseGitStatus(stdout)).toEqual({
      branch: undefined,
      clean: false,
      raw: stdout,
    });
  });

  it("omits branch when HEAD is detached", () => {
    const stdout = `# branch.oid abcdef
# branch.head (detached)
`;
    expect(parseGitStatus(stdout)).toEqual({
      branch: undefined,
      clean: true,
      raw: stdout,
    });
  });
});

describe("formatGitStatus", () => {
  it("includes branch and clean summary", () => {
    const formatted = formatGitStatus(parseGitStatus(cleanStdout));
    expect(formatted).toContain("Branch: main");
    expect(formatted).toContain("Working tree: clean");
    expect(formatted).toContain(cleanStdout);
  });

  it("marks dirty trees", () => {
    const formatted = formatGitStatus(parseGitStatus(dirtyStdout));
    expect(formatted).toContain("Branch: feature");
    expect(formatted).toContain("Working tree: dirty");
  });
});
