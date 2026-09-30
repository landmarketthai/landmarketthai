import { auth } from "@/lib/auth/server";

export interface AdminUser {
  id: string;
  name?: string;
  email: string;
  role?: string;
}

export function isAdminUserAllowed(
  user: AdminUser | null,
  adminEmails = process.env.ADMIN_EMAILS ?? "",
): boolean {
  if (!user?.email) return false;
  const allowed = new Set(
    adminEmails
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  return user.role === "admin" || allowed.has(user.email.toLowerCase());
}

export async function getAdminUser(_headers?: Headers): Promise<AdminUser | null> {
  const result = await auth.getSession().catch(() => null);
  const sessionResult = result as
    | { data?: { user?: AdminUser | null } | null; user?: AdminUser | null }
    | null;
  const sessionUser = sessionResult?.data?.user ?? sessionResult?.user ?? null;
  return isAdminUserAllowed(sessionUser) ? sessionUser : null;
}
