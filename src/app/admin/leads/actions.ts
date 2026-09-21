"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/types/database";

const LEAD_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacting",
  "qualified",
  "won",
  "lost",
];

function leadId(formData: FormData): string {
  const value = formData.get("lead_id");
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid lead id");
  }
  return value;
}

export async function updateLeadStatus(formData: FormData) {
  await requireAdmin();

  const id = leadId(formData);
  const value = formData.get("status");
  if (typeof value !== "string" || !LEAD_STATUSES.includes(value as LeadStatus)) {
    throw new Error("Invalid lead status");
  }

  const { error } = await createServerClient()
    .from("leads")
    .update({ status: value, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Update lead status failed: ${error.message}`);
  revalidatePath("/admin/leads");
}

export async function updateLeadAssignee(formData: FormData) {
  await requireAdmin();

  const id = leadId(formData);
  const raw = formData.get("assigned_to");
  if (typeof raw !== "string") throw new Error("Invalid assignee");

  const assignedTo = raw.trim();
  if (assignedTo.length > 100) throw new Error("Assignee too long");

  const { error } = await createServerClient()
    .from("leads")
    .update({ assigned_to: assignedTo || null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Update lead assignee failed: ${error.message}`);
  revalidatePath("/admin/leads");
}
