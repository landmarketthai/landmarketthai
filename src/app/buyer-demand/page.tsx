import { getPublicContentAvailability } from "@/lib/public-content";
import { archiveRobots } from "@/lib/public-seo";
import type { Metadata } from "next";
import Link from "next/link";
import { getActiveDemands } from "@/lib/neon/queries";
import BuyerDemandList, { isPublishedDemand } from "@/components/demand/BuyerDemandList";
import LineButton from "@/components/ui/LineButton";
import JsonLd from "@/components/seo/JsonLd";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const archiveMetadata: Metadata = {
  title: "Buyer กำลังหาอสังหาริมทรัพย์ – ตลาดย้อนกลับ",
  description:
    "รายการผู้ซื้อที่กำลังมองหาอสังหาริมทรัพย์ทั่วประเทศไทย แนะนำทรัพย์ที่ตรงความต้องการได้ทันที",
  alternates: { canonical: "/buyer-demand" },
  openGraph: { url: "/buyer-demand" },
};

export async function generateMetadata(): Promise<Metadata> {
  const availability = await getPublicContentAvailability();
  return { ...archiveMetadata, robots: archiveRobots(availability.buyerDemand !== false) };
}

export default async function BuyerDemandPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = Number((await searchParams).page ?? 1);
  const page = Number.isSafeInteger(raw) && raw > 0 && raw <= Math.floor(Number.MAX_SAFE_INTEGER / 50) ? raw : 1;
  const rows = await getActiveDemands(51, (page - 1) * 50).then((rows) => rows.filter(isPublishedDemand)).catch(() => null);
  if (rows === null) return <div className="container-xl section text-center" role="alert">
    <h1 className="text-xl font-bold">โหลดรายการความต้องการซื้อไม่ได้ในขณะนี้</h1>
    <p className="my-4">กรุณาลองใหม่อีกครั้ง</p>
    <Link href={`/buyer-demand?page=${page}`} className="btn-outline">ลองใหม่</Link>
  </div>;
  const demands = rows.slice(0, 50);

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: demands.map((d, i) => ({
      "@type": "ListItem",
      position: (page - 1) * 50 + i + 1,
      url: `/buyer-demand/${d.slug}`,
    })),
  };

  return (
    <div>
      <JsonLd data={listSchema} />

      <div className="bg-slate-900 text-white py-14 px-4 sm:px-6 lg:px-8">
        <div className="container-xl max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-300 text-xs px-4 py-1.5 rounded-full border border-green-500/30 mb-4">
            🔍 Buyer กำลังหาทรัพย์
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">ตลาดย้อนกลับ</h1>
          <p className="text-slate-400">
            รายการผู้ซื้อที่ต้องการอสังหาริมทรัพย์ทั่วประเทศไทย
            คุณรู้จักทรัพย์ที่ตรงกับความต้องการ? แนะนำเพื่อรับค่าคอม
          </p>
        </div>
      </div>

      <div className="container-xl section">
        <BuyerDemandList
          demands={demands}
          emptyAction={
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/buy-request" className="btn-green">ฝากความต้องการซื้อ</Link>
              <LineButton label="ติดต่อผ่าน LINE OA" />
            </div>
          }
        />

        <nav aria-label="หน้ารายการ" className="mt-6 flex justify-center gap-6">
          {page > 1 && <Link href={`/buyer-demand?page=${page - 1}`} className="btn-outline">ก่อนหน้า</Link>}
          {rows.length > 50 && <Link href={`/buyer-demand?page=${page + 1}`} className="btn-outline">ถัดไป</Link>}
        </nav>
        <div className="mt-12 text-center bg-brand-50 rounded-2xl p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-2">คุณรู้จักทรัพย์ที่ตรงกับ Buyer ไหม?</h2>
          <p className="text-slate-500 text-sm mb-5">
            แนะนำทรัพย์ให้ตรงกับ Buyer รับค่าแนะนำเมื่อปิดดีล
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sell" className="btn-primary">ส่งข้อมูลทรัพย์</Link>
            <Link href="/become-partner" className="btn-outline">สมัครผู้แนะนำ</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
