import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SearchExperience from "@/components/search/SearchExperience";
import { getPublicInventory } from "@/lib/public-inventory";
import { archiveInventory } from "@/lib/public-seo";
import { loadSearchContext } from "@/lib/search-context";
import { LAND_CATEGORY_TYPES, LAND_TYPE_LABELS, landTypeSlug } from "@/lib/utils";
import type { LandType } from "@/lib/types/database";

interface Props {
  province: { name_th: string };
  slug: string;
  landType?: LandType;
}

/**
 * /land/<province>[/<type>] SEO archive rendered with the same search screen as /search:
 * cards, map and the red province outline. Results start from exactly the inventory the
 * archive's robots/sitemap logic counts, so an indexed page always shows what it promises.
 */
export default async function LandArchive({ province, slug, landType }: Props) {
  const [inventory, context] = await Promise.all([getPublicInventory().catch(() => []), loadSearchContext()]);
  const results = archiveInventory(inventory, slug, landType);
  // Only link to type archives that have listings; empty ones are noindex dead ends.
  const types = LAND_CATEGORY_TYPES.filter((type) => type !== landType && archiveInventory(inventory, slug, type).length > 0);
  const typeName = landType ? LAND_TYPE_LABELS[landType] : null;
  const heading = typeName ? `${typeName}${province.name_th}` : `ที่ดินอุตสาหกรรม${province.name_th}`;

  const header = (
    <div className="min-w-0">
      <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-blue-200" aria-label="breadcrumb">
        <Link href="/" className="hover:text-white">หน้าแรก</Link>
        <ChevronRight size={12} />
        <Link href="/land" className="hover:text-white">ที่ดิน</Link>
        <ChevronRight size={12} />
        {typeName ? <Link href={`/land/${slug}`} className="hover:text-white">{province.name_th}</Link> : <span className="text-white">{province.name_th}</span>}
        {typeName && <><ChevronRight size={12} /><span className="text-white">{typeName}</span></>}
      </nav>
      <h1 className="text-xl font-black sm:text-3xl">{heading}</h1>
      {types.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {types.map((type) => (
            <Link key={type} href={`/land/${slug}/${landTypeSlug(type)}`} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20">
              {LAND_TYPE_LABELS[type]}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <SearchExperience
        initialProperties={results}
        provinces={context.provinces}
        provinceCodes={context.provinceCodes}
        locationOptions={context.locationOptions}
        initialValues={{ province: slug }}
        header={header}
      />
      <section className="border-t border-slate-200 bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-sm leading-relaxed text-slate-600">
          <h2 className="mb-2 text-base font-bold text-slate-900">เกี่ยวกับ{heading}</h2>
          <p>
            ประกาศ{typeName ?? "อสังหาริมทรัพย์"}ใน<strong>{province.name_th}</strong> พร้อมข้อมูลราคา ทำเล และรายละเอียดที่ผู้ลงประกาศระบุ
            ทีมงาน LandmarketThai ตรวจสอบประกาศก่อนเผยแพร่ ควรตรวจสอบเอกสาร ผังเมือง และข้อจำกัดการใช้พื้นที่กับหน่วยงานก่อนตัดสินใจ
          </p>
        </div>
      </section>
    </>
  );
}
