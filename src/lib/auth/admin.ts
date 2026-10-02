import { auth } from "@/lib/auth/server";

export interface AdminUser {
  id: string;
  name?: string;
  email: string;
  role?: string;
  emailVerified?: boolean;
}

export function isAdminUserAllowed(
  user: AdminUser | null,
  adminEmails = process.env.ADMIN_EMAILS ?? "",
): boolean {
  if (!user?.id) return false;
  const allowed = new Set(
    adminEmails
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  // role is accepted only from the server-authenticated getSession user, never request input.
  return user.role === "admin" || (user.emailVerified === true && allowed.has((user.email ?? "").trim().toLowerCase()));
}

export async function getSessionUser(): Promise<AdminUser | null> {
  const result = await auth.getSession({ query: { disableCookieCache: "true" } }).catch(() => null);
  const sessionResult = result as
    | { data?: { user?: AdminUser | null } | null; user?: AdminUser | null; error?: unknown }
    | null;
  const sessionUser = sessionResult?.error ? null : sessionResult?.data?.user ?? sessionResult?.user ?? null;
  return sessionUser;
}

export async function getAdminUser(): Promise<AdminUser | null> {
  const user = await getSessionUser();
  return isAdminUserAllowed(user) ? user : null;
}
