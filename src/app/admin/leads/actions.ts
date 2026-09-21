"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { parseBangkokDateTimeLocal } from "@/lib/lead-crm";
import type { LeadStatus } from "@/lib/types/database";

const LEAD_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacting",
  "qualified",
  "won",
  "lost",
];

const ACTIVITY_TYPES = ["note", "call", "line", "site_visit", "other"] as const;

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "ใหม่",
  contacting: "กำลังติดต่อ",
  qualified: "ผ่านการคัดกรอง",
  won: "ปิดดีล",
  lost: "ไม่สำเร็จ",
};

type DbClient = ReturnType<typeof createServerClient>;

async function recordLeadActivity(db: DbClient, leadIdValue: string, note: string, createdBy?: string | null) {
  const { error } = await db.from("lead_activities").insert({
    lead_id: leadIdValue,
    activity_type: "note",
    note,
    created_by: createdBy ?? null,
  });
  if (error) console.error(`Record lead activity failed lead_id=${leadIdValue}:`, error.message);
}

function leadId(formData: FormData): string {
  const value = formData.get("lead_id");
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid lead id");
  }
  return value;
}

function revalidateLead(id: string) {
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${id}`);
}

export async function updateLeadStatus(formData: FormData) {
  const admin = await requireAdmin();
  const id = leadId(formData);
  const value = formData.get("status");
  if (typeof value !== "string" || !LEAD_STATUSES.includes(value as LeadStatus)) {
    throw new Error("Invalid lead status");
  }

  const status = value as LeadStatus;
  const db = createServerClient();
  const { error } = await db
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Update lead status failed: ${error.message}`);
  await recordLeadActivity(db, id, `เปลี่ยนสถานะเป็น: ${STATUS_LABELS[status]}`, admin.email);
  revalidateLead(id);
}

export async function updateLeadAssignee(formData: FormData) {
  const admin = await requireAdmin();
  const id = leadId(formData);
  const raw = formData.get("assigned_to");
  if (typeof raw !== "string") throw new Error("Invalid assignee");

  const assignedTo = raw.trim();
  if (assignedTo.length > 100) throw new Error("Assignee too long");

  const db = createServerClient();
  const { error } = await db
    .from("leads")
    .update({ assigned_to: assignedTo || null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Update lead assignee failed: ${error.message}`);
  await recordLeadActivity(
    db,
    id,
    assignedTo ? `มอบหมายผู้รับผิดชอบ: ${assignedTo}` : "ล้างผู้รับผิดชอบ",
    admin.email,
  );
  revalidateLead(id);
}

export async function updateLeadNextAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = leadId(formData);
  const raw = formData.get("next_action_at");
  if (typeof raw !== "string") throw new Error("Invalid next action");

  const nextActionAt = parseBangkokDateTimeLocal(raw);
  const db = createServerClient();
  const { error } = await db
    .from("leads")
    .update({ next_action_at: nextActionAt, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Update next action failed: ${error.message}`);
  await recordLeadActivity(
    db,
    id,
    nextActionAt ? `ตั้งนัดติดตามครั้งถัดไป: ${raw.trim()} น. (Asia/Bangkok)` : "ล้างนัดติดตามครั้งถัดไป",
    admin.email,
  );
  revalidateLead(id);
}

export async function addLeadActivity(formData: FormData) {
  const admin = await requireAdmin();
  const id = leadId(formData);
  const rawType = formData.get("activity_type");
  const rawNote = formData.get("note");

  if (typeof rawType !== "string" || !ACTIVITY_TYPES.includes(rawType as (typeof ACTIVITY_TYPES)[number])) {
    throw new Error("Invalid activity type");
  }
  if (typeof rawNote !== "string") throw new Error("Invalid activity note");

  const note = rawNote.trim();
  if (!note || note.length > 2000) throw new Error("Activity note must be 1-2000 characters");

  const db = createServerClient();
  const { error } = await db.from("lead_activities").insert({
    lead_id: id,
    activity_type: rawType,
    note,
    created_by: admin.email ?? null,
  });

  if (error) throw new Error(`Add lead activity failed: ${error.message}`);
  revalidateLead(id);
}
