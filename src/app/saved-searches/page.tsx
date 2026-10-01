import type { Metadata } from "next";
import Link from "next/link";
import SavedSearchList from "@/components/listings/SavedSearchList";

export const metadata: Metadata = { title: "การค้นหาที่บันทึก", robots: { index: false, follow: false } };

export default function SavedSearchesPage() {
  return (
    <div className="container-xl section max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">การค้นหาที่บันทึก</h1>
      <SavedSearchList />
      <Link href="/land" className="inline-block text-brand-700 hover:underline mt-6">ค้นหาที่ดินเพิ่มเติม</Link>
    </div>
  );
}
