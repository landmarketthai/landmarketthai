import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import ListingGrid from "@/components/listings/ListingGrid";
import JsonLd from "@/components/seo/JsonLd";
import { getProvinceBySlug, getAllProvinces } from "@/lib/supabase/queries";
import { LAND_TYPE_LABELS } from "@/lib/utils";
import type { LandType } from "@/lib/types/database";

export const revalidate = 3600;

interface Params { province: string }
interface SearchParams { page?: string }

export async function generateStaticParams() {
  const provinces = await getAllProvinces().catch(() => []);
  return provinces.map((p) => ({ province: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { province: slug } = await params;
  const province = await getProvinceBySlug(slug).catch(() => null);
  if (!province) return {};
  return {
    title: `ที่ดินอุตสาหกรรม${province.name_th} – ที่ดิน EEC ${province.name_en}`,
    description: `ที่ดินอุตสาหกรรม โรงงาน คลังสินค้า EEC ใน${province.name_th} ตรวจสอบแล้ว ราคาต่อไร่ สอบถาม LINE`,
    alternates: { canonical: `/land/${slug}` },
  };
}

const LAND_TYPES = Object.keys(LAND_TYPE_LABELS) as LandType[];

export default async function ProvincePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { province: slug } = await params;
  const { page } = await searchParams;
  const province = await getProvinceBySlug(slug).catch(() => null);
  if (!province) notFound();

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "หน้าแรก", item: "/" },
      { "@type": "ListItem", position: 2, name: "ที่ดิน", item: "/land" },
      { "@type": "ListItem", position: 3, name: province.name_th, item: `/land/${slug}` },
    ],
  };

  return (
    <div>
      <JsonLd data={breadcrumb} />

      {/* Header */}
      <div className="bg-slate-900 text-white py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <nav className="flex items-center gap-1 text-xs text-slate-400 mb-3">
            <Link href="/" className="hover:text-white">หน้าแรก</Link>
            <ChevronRight size={12} />
            <Link href="/land" className="hover:text-white">ที่ดิน</Link>
            <ChevronRight size={12} />
            <span className="text-white">{province.name_th}</span>
          </nav>
          <h1 className="text-2xl font-bold">
            ที่ดินอุตสาหกรรม{province.name_th}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            ที่ดิน EEC โรงงาน คลังสินค้า ลงทุน ใน{province.name_th} – ตรวจสอบก่อนทุกครั้ง
          </p>
        </div>
      </div>

      <div className="container-xl section">
        {/* Type sub-links */}
        <div className="flex flex-wrap gap-2 mb-8">
          {LAND_TYPES.map((type) => (
            <Link
              key={type}
              href={`/land/${slug}/${type.replace(/_/g, "-")}`}
              className="badge bg-slate-100 text-slate-700 hover:bg-brand-100 hover:text-brand-700 px-3 py-1 text-sm transition-colors"
            >
              {LAND_TYPE_LABELS[type]}
            </Link>
          ))}
        </div>

        {/* SEO intro */}
        <div className="prose prose-slate text-sm max-w-none mb-8 p-5 bg-slate-50 rounded-xl">
          <p>
            <strong>{province.name_th}</strong>เป็นหนึ่งในจังหวัดสำคัญของ EEC (Eastern Economic Corridor)
            ที่ดึงดูดการลงทุนจากญี่ปุ่น จีน และยุโรปอย่างต่อเนื่อง
            ที่ดินอุตสาหกรรมใน{province.name_th}ประกอบด้วยโซนม่วง (อุตสาหกรรม) และพื้นที่ใกล้นิคมชั้นนำ
            LandmarketThai คัดสรรที่ดินที่ผ่านการตรวจสอบเอกสารสิทธิ์แล้วทุกแปลง
          </p>
        </div>

        <ListingGrid
          provinceSlug={slug}
          page={Number(page ?? 1)}
          basePath={`/land/${slug}`}
        />
      </div>
    </div>
  );
}
