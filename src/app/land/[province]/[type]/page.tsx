import { getPublicInventory } from "@/lib/public-inventory";
import { archiveInventory, archiveRobots } from "@/lib/public-seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LandArchive from "@/components/search/LandArchive";
import JsonLd from "@/components/seo/JsonLd";
import { getProvinceBySlug } from "@/lib/neon/queries";
import { getFallbackProvinceBySlug } from "@/lib/fallback-provinces";
import { LAND_TYPE_LABELS, slugToLandType } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

interface Params { province: string; type: string }

async function resolveProvince(slug: string) {
  return (await getProvinceBySlug(slug).catch(() => null)) ?? getFallbackProvinceBySlug(slug);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { province: slug, type } = await params;
  const province = await resolveProvince(slug);
  const landType = slugToLandType(type);
  if (!province || !landType) return {};
  const typeName = LAND_TYPE_LABELS[landType];
  const inventory = await getPublicInventory().catch(() => []);
  return {
    robots: archiveRobots(archiveInventory(inventory, slug, landType).length > 0),
    openGraph: { url: `/land/${slug}/${type}` },
    title: `${typeName}${province.name_th} – ที่ดิน ${province.name_en} ${typeName}`,
    description: `${typeName}ใน${province.name_th} พร้อมข้อมูลราคาและทำเลตามประกาศ ติดต่อผ่าน LINE`,
    alternates: { canonical: `/land/${slug}/${type}` },
  };
}

export default async function ProvinceTypePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { province: slug, type } = await params;
  const [province, landType] = await Promise.all([
    resolveProvince(slug),
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
    <>
      <JsonLd data={breadcrumb} />
      <LandArchive province={province} slug={slug} landType={landType} />
    </>
  );
}
