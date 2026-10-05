import { getPublicInventory } from "@/lib/public-inventory";
import { archiveInventory, archiveRobots } from "@/lib/public-seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LandArchive from "@/components/search/LandArchive";
import JsonLd from "@/components/seo/JsonLd";
import { getProvinceBySlug } from "@/lib/neon/queries";
import { getFallbackProvinceBySlug } from "@/lib/fallback-provinces";


export const dynamic = "force-dynamic";
export const revalidate = 3600;

interface Params { province: string }

async function resolveProvince(slug: string) {
  return (await getProvinceBySlug(slug).catch(() => null)) ?? getFallbackProvinceBySlug(slug);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { province: slug } = await params;
  const province = await resolveProvince(slug);
  if (!province) return {};
  const inventory = await getPublicInventory().catch(() => []);
  return {
    robots: archiveRobots(archiveInventory(inventory, slug).length > 0),
    openGraph: { url: `/land/${slug}` },
    title: `อสังหาริมทรัพย์ใน${province.name_th} – ${province.name_en}`,
    description: `ค้นหาประกาศอสังหาริมทรัพย์ใน${province.name_th} พร้อมข้อมูลราคา ทำเล และรายละเอียดตามประกาศ ติดต่อผ่าน LINE`,
    alternates: { canonical: `/land/${slug}` },
  };
}


export default async function ProvincePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { province: slug } = await params;
  const province = await resolveProvince(slug);
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
    <>
      <JsonLd data={breadcrumb} />
      <LandArchive province={province} slug={slug} />
    </>
  );
}
