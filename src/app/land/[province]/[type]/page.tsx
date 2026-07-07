import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import ListingGrid from "@/components/listings/ListingGrid";
import JsonLd from "@/components/seo/JsonLd";
import { getProvinceBySlug, getAllProvinces } from "@/lib/supabase/queries";
import { LAND_TYPE_LABELS, slugToLandType } from "@/lib/utils";

export const revalidate = 3600;

interface Params { province: string; type: string }
interface SearchParams { page?: string }

export async function generateStaticParams() {
  const provinces = await getAllProvinces().catch(() => []);
  const types = Object.keys(LAND_TYPE_LABELS);
  return provinces.flatMap((p) =>
    types.map((t) => ({ province: p.slug, type: t.replace(/_/g, "-") }))
  );
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { province: slug, type } = await params;
  const province = await getProvinceBySlug(slug).catch(() => null);
  const landType = slugToLandType(type);
  if (!province || !landType) return {};
  const typeName = LAND_TYPE_LABELS[landType];
  return {
    title: `${typeName}${province.name_th} – ที่ดิน ${province.name_en} ${typeName}`,
    description: `${typeName}ใน${province.name_th} EEC ราคาต่อไร่ ตรวจสอบเอกสารสิทธิ์แล้ว ติดต่อผ่าน LINE`,
    alternates: { canonical: `/land/${slug}/${type}` },
  };
}

export default async function ProvinceTypePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { province: slug, type } = await params;
  const { page } = await searchParams;
  const [province, landType] = await Promise.all([
    getProvinceBySlug(slug).catch(() => null),
    Promise.resolve(slugToLandType(type)),
  ]);
  if (!province || !landType) notFound();

  const typeName = LAND_TYPE_LABELS[landType];

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "หน้าแรก", item: "/" },
      { "@type": "ListItem", position: 2, name: "ที่ดิน", item: "/land" },
      { "@type": "ListItem", position: 3, name: province.name_th, item: `/land/${slug}` },
      { "@type": "ListItem", position: 4, name: typeName, item: `/land/${slug}/${type}` },
    ],
  };

  return (
    <div>
      <JsonLd data={breadcrumb} />

      <div className="bg-slate-900 text-white py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <nav className="flex items-center gap-1 text-xs text-slate-400 mb-3">
            <Link href="/" className="hover:text-white">หน้าแรก</Link>
            <ChevronRight size={12} />
            <Link href="/land" className="hover:text-white">ที่ดิน</Link>
            <ChevronRight size={12} />
            <Link href={`/land/${slug}`} className="hover:text-white">{province.name_th}</Link>
            <ChevronRight size={12} />
            <span className="text-white">{typeName}</span>
          </nav>
          <h1 className="text-2xl font-bold">{typeName}{province.name_th}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {typeName}ใน{province.name_th} ตรวจสอบเอกสารสิทธิ์แล้ว ราคาต่อไร่โปร่งใส
          </p>
        </div>
      </div>

      <div className="container-xl section">
        <div className="prose prose-slate text-sm max-w-none mb-8 p-5 bg-slate-50 rounded-xl">
          <p>
            <strong>{typeName}{province.name_th}</strong> – LandmarketThai รวบรวมที่ดินที่ผ่านการตรวจสอบ
            จากเครือข่ายพาร์ทเนอร์กว่า 200 รายทั่วภูมิภาค ทีมผู้เชี่ยวชาญพร้อมให้ข้อมูลและจัดเยี่ยมชม
            พื้นที่โดยไม่มีค่าใช้จ่าย
          </p>
        </div>
        <ListingGrid
          provinceSlug={slug}
          landType={type}
          page={Number(page ?? 1)}
          basePath={`/land/${slug}/${type}`}
        />
      </div>
    </div>
  );
}
