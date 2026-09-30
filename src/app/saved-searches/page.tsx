import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SavedSearchList from "@/components/listings/SavedSearchList";
import { createSessionClient } from "@/lib/supabase/server";
import type { SavedSearch } from "@/lib/saved-searches";

export const metadata: Metadata = { title: "การค้นหาที่บันทึก", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SavedSearchesPage() {
  const db = await createSessionClient();
  if (!db) redirect("/login?next=/saved-searches");
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/saved-searches");
  const { data, error } = await db.from("saved_searches")
    .select("id,name,search_params,alert_requested,created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false });

  return (
    <div className="container-xl section max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">การค้นหาที่บันทึก</h1>
      {error ? <p role="alert" className="card p-6">ไม่สามารถโหลดการค้นหาได้ กรุณาลองใหม่ภายหลัง</p>
        : <SavedSearchList searches={(data ?? []) as SavedSearch[]} />}
      <Link href="/land" className="inline-block text-brand-700 hover:underline mt-6">ค้นหาที่ดินเพิ่มเติม</Link>
    </div>
  );
}
