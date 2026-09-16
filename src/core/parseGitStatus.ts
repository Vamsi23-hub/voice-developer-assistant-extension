export type GitStatusResult = {
  branch?: string;
  clean: boolean;
  raw: string;
};

export function parseGitStatus(stdout: string): GitStatusResult {
  let branch: string | undefined;
  let hasEntries = false;

  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("# branch.head ")) {
      const head = line.slice("# branch.head ".length).trim();
      if (head && head !== "(detached)") {
        branch = head;
      }
      continue;
    }

    if (line && !line.startsWith("#")) {
      hasEntries = true;
    }
  }

  return {
    branch,
    clean: !hasEntries,
    raw: stdout,
  };
}

export function formatGitStatus(result: GitStatusResult): string {
  const header = result.branch ? [`Branch: ${result.branch}`] : [];
  return [
    ...header,
    result.clean ? "Working tree: clean" : "Working tree: dirty",
    "",
    result.raw,
  ].join("\n");
}
