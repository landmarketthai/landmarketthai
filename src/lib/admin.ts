import { notFound, redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin-access";
import { createSessionClient } from "@/lib/supabase/server";

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
  if (!isAdminEmail(user.email, process.env.LANDMARKETTHAI_ADMIN_EMAILS)) notFound();

  return user;
}
