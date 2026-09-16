import { Intent, ParseIntentOptions } from "./intent";
import { aliasesMatch } from "./normalizeAlias";

function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function startsWithIgnoreCase(text: string, prefix: string): boolean {
  return text.toLowerCase().startsWith(prefix);
}

function slicePrefix(text: string, prefix: string): string {
  return text.slice(prefix.length).trim();
}

function stripTrailingRepoContext(target: string): {
  alias: string;
  repoContext: boolean;
} {
  const lower = target.toLowerCase();
  if (lower.endsWith(" repository")) {
    return {
      alias: target.slice(0, -" repository".length).trim(),
      repoContext: true,
    };
  }
  if (lower.endsWith(" repo")) {
    return {
      alias: target.slice(0, -" repo".length).trim(),
      repoContext: true,
    };
  }
  return { alias: target, repoContext: false };
}

function matchesKnownAlias(aliases: string[], candidate: string): boolean {
  return aliases.some((alias) => aliasesMatch(alias, candidate));
}

function unknownIfEmpty(raw: string, value: string, kind: "openFile" | "openRepository"): Intent {
  if (!value) {
    return { kind: "unknown", text: raw };
  }
  if (kind === "openFile") {
    return { kind: "openFile", filename: value };
  }
  return { kind: "openRepository", alias: value };
}

function parsePrefixedRepository(raw: string, prefix: string): Intent | undefined {
  if (!startsWithIgnoreCase(raw, prefix)) {
    return undefined;
  }
  const alias = stripTrailingRepoContext(slicePrefix(raw, prefix)).alias;
  return unknownIfEmpty(raw, alias, "openRepository");
}

function parseOpenTarget(raw: string, aliases: string[]): Intent {
  const target = slicePrefix(raw, "open ");
  if (!target) {
    return { kind: "unknown", text: raw };
  }

  const { alias, repoContext } = stripTrailingRepoContext(target);
  if (repoContext || matchesKnownAlias(aliases, alias)) {
    return unknownIfEmpty(raw, alias, "openRepository");
  }

  return { kind: "openFile", filename: target };
}

export function parseIntent(
  text: string,
  options: ParseIntentOptions = {}
): Intent {
  const raw = collapseWhitespace(text);
  if (!raw) {
    return { kind: "unknown", text };
  }

  const lower = raw.toLowerCase();
  if (lower === "open terminal" || lower === "open the terminal") {
    return { kind: "openTerminal" };
  }
  if (lower === "git status" || lower === "show git status") {
    return { kind: "gitStatus" };
  }

  if (startsWithIgnoreCase(raw, "open file ")) {
    return unknownIfEmpty(raw, slicePrefix(raw, "open file "), "openFile");
  }

  const prefixedRepository =
    parsePrefixedRepository(raw, "open repository ") ??
    parsePrefixedRepository(raw, "open repo ");
  if (prefixedRepository) {
    return prefixedRepository;
  }

  if (startsWithIgnoreCase(raw, "open ")) {
    return parseOpenTarget(raw, options.aliases ?? []);
  }

  return { kind: "unknown", text: raw };
}
