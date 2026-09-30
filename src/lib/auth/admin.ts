import { getSqlIfConfigured } from "@/lib/neon/server";

const DEFAULT_NEON_AUTH_URL =
  "https://ep-raspy-credit-aztfc03r.neonauth.c-3.ap-southeast-1.aws.neon.tech/landmarketthai/auth";

export interface AdminUser {
  id: string;
  name?: string;
  email: string;
  role?: string;
}

export async function getAdminUser(headers: Headers): Promise<AdminUser | null> {
  const cookie = headers.get("cookie");
  const authorization = headers.get("authorization");
  if (!cookie && !authorization) return null;

  const baseUrl = process.env.NEXT_PUBLIC_NEON_AUTH_URL?.trim() || DEFAULT_NEON_AUTH_URL;
  const response = await fetch(`${baseUrl}/get-session`, {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
    },
    cache: "no-store",
  }).catch(() => null);
  const data = response?.ok ? await response.json() as { user?: AdminUser | null } : null;
  let user = data?.user ?? null;
  if (!user && authorization?.startsWith("Bearer ")) {
    const sql = getSqlIfConfigured();
    const token = authorization.slice(7).trim();
    if (sql && token) {
      const rows = await sql.query(
        `select u.id, u.name, u.email, u.role
         from neon_auth.session s
         join neon_auth.user u on u.id=s."userId"
         where s.token=$1 and s."expiresAt" > now()
         limit 1`,
        [token],
      ).catch(() => []);
      if (rows[0]) user = rows[0] as unknown as AdminUser;
    }
  }
  if (!user?.email) return null;

  const allowed = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  return user.role === "admin" || allowed.has(user.email.toLowerCase()) ? user : null;
}
