export function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("-", " ")
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .join(" ");
}

export function aliasesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeAlias(left);
  const normalizedRight = normalizeAlias(right);
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
}
