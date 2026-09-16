import * as fs from "node:fs";
import * as path from "node:path";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
]);

export function pickWorkspaceRoot(input: {
  activeEditorFolder?: string;
  firstWorkspaceFolder?: string;
  developmentFallback?: string;
}): string | undefined {
  return (
    input.activeEditorFolder ??
    input.firstWorkspaceFolder ??
    input.developmentFallback
  );
}

export function readExtensionDevelopmentPath(
  argv: readonly string[] = process.argv
): string | undefined {
  const prefix = "--extensionDevelopmentPath=";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--extensionDevelopmentPath") {
      const value = argv[i + 1];
      return value && !value.startsWith("-") ? value : undefined;
    }
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length) || undefined;
    }
  }
  return undefined;
}

export function findFilesOnDisk(
  root: string,
  filename: string,
  maxResults = 50
): string[] {
  const resolvedRoot = path.resolve(root);
  const posixName = filename.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!posixName || posixName === "/") {
    return [];
  }

  const direct = path.resolve(resolvedRoot, posixName);
  if (isInsideRoot(resolvedRoot, direct) && isFile(direct)) {
    return [direct];
  }

  const matches: string[] = [];
  const target = path.posix.basename(posixName);

  function walk(dir: string): void {
    if (matches.length >= maxResults) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= maxResults) {
        return;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          walk(full);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relative = path.relative(resolvedRoot, full).split(path.sep).join("/");
      if (posixName.includes("/")) {
        if (relative === posixName || relative.endsWith(`/${posixName}`)) {
          matches.push(full);
        }
      } else if (entry.name === target) {
        matches.push(full);
      }
    }
  }

  walk(resolvedRoot);
  return matches;
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
