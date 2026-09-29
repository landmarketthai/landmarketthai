import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cachedSql: NeonQueryFunction<false, false> | null | undefined;

export function getSqlIfConfigured(): NeonQueryFunction<false, false> | null {
  if (cachedSql !== undefined) return cachedSql;

  const url = process.env.DATABASE_URL?.trim();
  cachedSql = url ? neon(url) : null;
  return cachedSql;
}

export function getSql(): NeonQueryFunction<false, false> {
  const sql = getSqlIfConfigured();
  if (!sql) {
    throw new Error("DATABASE_URL is not configured");
  }
  return sql;
}
