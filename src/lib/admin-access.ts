export function isAdminEmail(email: string | null | undefined, rawAllowlist: string | undefined): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;

  const allowed = new Set(
    (rawAllowlist ?? "")
      .split(/[\s,;]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );

  return allowed.has(normalized);
}
