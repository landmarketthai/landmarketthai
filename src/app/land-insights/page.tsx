import type { Metadata } from "next";
import { InventoryAnalytics } from "@/components/intelligence/InventoryAnalytics";
import { getInventoryAnalytics } from "@/lib/inventory-analytics";
import { loadIntelligenceInventory } from "@/lib/intelligence-inventory";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "ราคาตั้งขายในประกาศที่เปิดขายของ LandmarketThai",
  description: "สถิติราคาตั้งขายเฉพาะประกาศที่เปิดขายของ LandmarketThai แยกจังหวัด ประเภท และผังสี ไม่ใช่ราคาประเมินตลาด",
};

export default async function LandInsightsPage() {
  const inventory = await loadIntelligenceInventory();
  return <div className="container-xl section space-y-6">
    <h1 className="text-2xl font-bold">ราคาตั้งขายในประกาศที่เปิดขายของ LandmarketThai</h1>
    <p className="text-sm text-slate-500">{inventory.source === "database" ? "จากฐานข้อมูลประกาศที่เปิดขายขณะโหลดหน้านี้" : "จากประกาศมาตรฐานในเว็บไซต์ ยังไม่ได้เชื่อมต่อฐานข้อมูลสด"}</p>
    <InventoryAnalytics analytics={getInventoryAnalytics(inventory.lands)} />
  </div>;
}
