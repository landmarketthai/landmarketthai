"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { verificationUpdate } from "@/lib/verification";

export async function createAgent(formData: FormData) {
  await requireAdmin("/admin/agents");
  const name = formData.get("display_name");
  if (typeof name !== "string" || !name.trim() || name.trim().length > 150) throw new Error("Invalid public agent name");
  const { error } = await createServerClient().from("agents").insert({ display_name: name.trim() });
  if (error) throw new Error(`Create agent failed: ${error.message}`);
  revalidatePath("/admin/agents");
}

export async function updateAgentVerification(formData: FormData) {
  const admin = await requireAdmin("/admin/agents");
  const id = formData.get("agent_id");
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid agent id");
  const update = verificationUpdate(formData.get("decision"), admin.id);
  const { data, error } = await createServerClient().from("agents").update(update).eq("id", id).select("id").single();
  if (error || !data) throw new Error(`Agent verification failed: ${error?.message ?? "Agent not found"}`);
  revalidatePath("/admin/agents");
  revalidatePath("/land", "layout");
  revalidatePath("/listing/[slug]", "page");
  revalidatePath("/property/[slug]", "page");
  revalidatePath("/");
}
