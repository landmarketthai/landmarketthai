import { notFound, redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";

function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.LANDMARKETTHAI_ADMIN_EMAILS ?? "")
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function requireAdmin(nextPath = "/admin/leads") {
  const sessionClient = await createSessionClient();
  const loginPath = nextPath === "/admin/leads"
    ? "/login?next=/admin/leads"
    : `/login?next=${encodeURIComponent(nextPath)}`;
  if (!sessionClient) redirect(loginPath);

  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) redirect(loginPath);

  const email = user.email?.trim().toLowerCase();
  if (!email || !getAdminEmails().has(email)) notFound();

  return user;
}
