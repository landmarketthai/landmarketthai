import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Users, ArrowRight } from "lucide-react";
import { getDemandBySlug } from "@/lib/neon/queries";
import { LAND_TYPE_LABELS, formatUpdatedDate } from "@/lib/utils";
import { BuyerDemandCriteria, demandProvinceLabel, demandSizeLabel, isPublishedDemand } from "@/components/demand/BuyerDemandList";
import LineButton from "@/components/ui/LineButton";
import JsonLd from "@/components/seo/JsonLd";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Params { slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const demand = await getDemandBySlug(slug);
  if (!demand || !isPublishedDemand(demand)) return {};
  return {
    title: `Buyer ต้องการ${demand.land_type ? (LAND_TYPE_LABELS[demand.land_type] ?? LAND_TYPE_LABELS.other) : "อสังหาริมทรัพย์ทุกประเภท"} — ${demandProvinceLabel(demand)}`,
    description: `ผู้ซื้อต้องการ${demand.land_type ? (LAND_TYPE_LABELS[demand.land_type] ?? LAND_TYPE_LABELS.other) : "อสังหาริมทรัพย์ทุกประเภท"} ${demandProvinceLabel(demand)} ขนาด ${demandSizeLabel(demand)}`,
    alternates: { canonical: `/buyer-demand/${slug}` },
    openGraph: { url: `/buyer-demand/${slug}` },
  };
}

export default async function BuyerDemandDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const demand = await getDemandBySlug(slug);
  if (!demand || !isPublishedDemand(demand)) notFound();

  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Buyer ต้องการ${demand.land_type ? (LAND_TYPE_LABELS[demand.land_type] ?? LAND_TYPE_LABELS.other) : "อสังหาริมทรัพย์ทุกประเภท"} — ${demandProvinceLabel(demand)}`,
    description: `พื้นที่ต้องการ ${demandSizeLabel(demand)}`,
    url: `/buyer-demand/${slug}`,
  };

  return (
    <div className="container-xl section">
      <JsonLd data={schema} />

      {/* Breadcrumb */}
      <nav aria-label="เส้นทางนำทาง" className="flex flex-wrap items-center gap-1 text-xs text-slate-500 mb-6">
        <Link href="/" className="hover:text-brand-600">หน้าแรก</Link>
        <ChevronRight size={12} />
        <Link href="/buyer-demand" className="hover:text-brand-600">Buyer กำลังหา</Link>
        <ChevronRight size={12} />
        <span className="min-w-0 break-words text-slate-700">{demandProvinceLabel(demand)}</span>
      </nav>

      <div className="max-w-2xl">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="badge bg-green-100 text-green-700 px-3 py-1">🔍 กำลังมองหา</span>
          {formatUpdatedDate(demand.published_at) && (
            <span className="text-xs text-slate-400">ลงประกาศ {formatUpdatedDate(demand.published_at)}</span>
          )}
          {demand.land_type && (
            <span className="badge bg-slate-100 text-slate-700 px-3 py-1">
              {(LAND_TYPE_LABELS[demand.land_type] ?? LAND_TYPE_LABELS.other)}
            </span>
          )}
        </div>

        <h1 className="break-words text-2xl font-bold text-slate-900 mb-2">
          Buyer ต้องการ{demand.land_type ? (LAND_TYPE_LABELS[demand.land_type] ?? LAND_TYPE_LABELS.other) : "อสังหาริมทรัพย์ทุกประเภท"}
          {` — ${demandProvinceLabel(demand)}`}
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
          <div className="min-w-0 break-words bg-slate-50 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">จังหวัด</div>
            <div className="font-semibold text-slate-800">{demandProvinceLabel(demand)}</div>
          </div>
          {(demand.size_min_rai != null || demand.size_max_rai != null) && (
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">พื้นที่ต้องการ</div>
              <div className="font-semibold text-slate-800">
                {demandSizeLabel(demand)}
              </div>
            </div>
          )}
        </div>

        <div className="mb-6 break-words"><BuyerDemandCriteria demand={demand} /></div>

        {/* CTA */}
        <div className="bg-brand-50 border border-brand-100 rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-brand-600" />
            <h2 className="font-semibold text-slate-800">คุณรู้จักทรัพย์ที่ตรงกันไหม?</h2>
          </div>
          <p className="text-sm text-slate-600">
            ส่งข้อมูลทรัพย์ให้เรา หรือแนะนำเจ้าของทรัพย์มา
            รับค่าแนะนำสูงสุดหลายล้านบาทเมื่อปิดดีล
          </p>
          <label className="block min-w-0 text-xs text-slate-600">รหัสอ้างอิง (คัดลอกและส่งพร้อมข้อมูลทรัพย์ / LINE)<input aria-label="รหัสความต้องการซื้อ" readOnly value={demand.slug} className="input mt-1 w-full text-xs" /></label>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href={`/sell?buyer_demand=${encodeURIComponent(demand.slug)}`} className="btn-primary">
              ส่งข้อมูลทรัพย์นี้
              <ArrowRight size={16} />
            </Link>
            <LineButton label="แจ้งผ่าน LINE" size="sm" />
          </div>
        </div>

        <div className="mt-6">
          <Link href="/buyer-demand" className="text-sm text-slate-500 hover:text-brand-600">
            ← ดู Buyer ทั้งหมด
          </Link>
        </div>
      </div>
    </div>
  );
}
