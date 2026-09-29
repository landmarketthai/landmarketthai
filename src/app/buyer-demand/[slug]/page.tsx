import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Users, ArrowRight } from "lucide-react";
import { getDemandBySlug, getActiveDemands } from "@/lib/neon/queries";
import { LAND_TYPE_LABELS } from "@/lib/utils";
import LineButton from "@/components/ui/LineButton";
import JsonLd from "@/components/seo/JsonLd";

export const revalidate = 3600;

interface Params { slug: string }

export async function generateStaticParams() {
  const demands = await getActiveDemands(100).catch(() => []);
  return demands.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const demand = await getDemandBySlug(slug).catch(() => null);
  if (!demand) return {};
  return {
    title: demand.seo_title ?? `Buyer ต้องการที่ดิน${demand.province?.name_th ?? ""} ${demand.land_type ? LAND_TYPE_LABELS[demand.land_type] : ""}`,
    description: demand.seo_description ?? `ผู้ซื้อต้องการที่ดิน${demand.province?.name_th ?? ""}${demand.land_type ? ` ประเภท${LAND_TYPE_LABELS[demand.land_type]}` : ""} ขนาด ${demand.size_min_rai ?? ""}–${demand.size_max_rai ?? ""} ไร่`,
    alternates: { canonical: `/buyer-demand/${slug}` },
  };
}

export default async function BuyerDemandDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const demand = await getDemandBySlug(slug).catch(() => null);
  if (!demand) notFound();

  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Buyer ต้องการ${demand.land_type ? LAND_TYPE_LABELS[demand.land_type] : "ที่ดิน"}ใน${demand.province?.name_th ?? "ไทย"}`,
    description: demand.intended_use ?? "",
    url: `/buyer-demand/${slug}`,
  };

  return (
    <div className="container-xl section">
      <JsonLd data={schema} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-slate-500 mb-6">
        <Link href="/" className="hover:text-brand-600">หน้าแรก</Link>
        <ChevronRight size={12} />
        <Link href="/buyer-demand" className="hover:text-brand-600">Buyer กำลังหา</Link>
        <ChevronRight size={12} />
        <span className="text-slate-700">{demand.province?.name_th ?? "ทั่วไทย"}</span>
      </nav>

      <div className="max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <span className="badge bg-green-100 text-green-700 px-3 py-1">🔍 กำลังมองหา</span>
          {demand.land_type && (
            <span className="badge bg-slate-100 text-slate-700 px-3 py-1">
              {LAND_TYPE_LABELS[demand.land_type]}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Buyer ต้องการ{demand.land_type ? LAND_TYPE_LABELS[demand.land_type] : "ที่ดิน"}
          {demand.province?.name_th ? `ใน${demand.province.name_th}` : ""}
        </h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 my-6">
          {demand.province && (
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">จังหวัด</div>
              <div className="font-semibold text-slate-800">{demand.province.name_th}</div>
            </div>
          )}
          {(demand.size_min_rai || demand.size_max_rai) && (
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">พื้นที่ต้องการ</div>
              <div className="font-semibold text-slate-800">
                {demand.size_min_rai && demand.size_max_rai
                  ? `${demand.size_min_rai}–${demand.size_max_rai} ไร่`
                  : demand.size_min_rai
                  ? `${demand.size_min_rai}+ ไร่`
                  : "ทุกขนาด"}
              </div>
            </div>
          )}
          {demand.budget_note && (
            <div className="bg-green-50 rounded-xl p-4">
              <div className="text-xs text-green-600 mb-1">งบประมาณ</div>
              <div className="font-semibold text-green-800">{demand.budget_note}</div>
            </div>
          )}
        </div>

        {demand.intended_use && (
          <div className="mb-6">
            <h2 className="font-semibold text-slate-800 mb-2">วัตถุประสงค์การใช้งาน</h2>
            <p className="text-slate-600 leading-relaxed">{demand.intended_use}</p>
          </div>
        )}

        {/* CTA */}
        <div className="bg-brand-50 border border-brand-100 rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-brand-600" />
            <h2 className="font-semibold text-slate-800">คุณรู้จักที่ดินที่ตรงกันไหม?</h2>
          </div>
          <p className="text-sm text-slate-600">
            ส่งข้อมูลที่ดินให้เรา หรือแนะนำเจ้าของที่ดินมา
            รับค่าแนะนำสูงสุดหลายล้านบาทเมื่อปิดดีล
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/submit-land" className="btn-primary">
              ส่งข้อมูลที่ดินนี้
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
