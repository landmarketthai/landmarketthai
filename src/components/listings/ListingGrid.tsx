import Link from "next/link";
import ListingCard from "./ListingCard";
import LineButton from "@/components/ui/LineButton";
import { getPublicInventory } from "@/lib/public-inventory";
import { matchesLandFilters, landSearchParams, type LandFilters } from "@/lib/land-search";
import {
  resolveListingPresentation,
} from "@/lib/seed-listings";
import { slugToLandType } from "@/lib/utils";

const PAGE_SIZE = 12;

interface Props {
  provinceSlug?: string;
  landType?: string;
  page?: number;
  basePath?: string;
  filters?: LandFilters;
}

export default async function ListingGrid({ provinceSlug, landType, filters, page = 1, basePath = "/land" }: Props) {
  const offset = (page - 1) * PAGE_SIZE;
  const type = landType ? slugToLandType(landType) : undefined;

  function pageHref(targetPage: number): string {
    const params = landSearchParams(filters ?? {});
    if (basePath === "/land") {
      if (provinceSlug) params.set("province", provinceSlug);
      if (landType) params.set("type", landType);
    }
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const inventory = await getPublicInventory().catch(() => null);
  if (!inventory) return <p role="alert" className="rounded-xl bg-amber-50 p-6">โหลดรายการไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง</p>;
  const matches = inventory.filter((land) => land.status === "active" && !land.deleted_at &&
    matchesLandFilters(land, { ...filters, province_slug: provinceSlug ?? filters?.province_slug, land_type: type ?? filters?.land_type }));
  const listings = matches.slice(offset, offset + PAGE_SIZE);
  const hasNext = matches.length > offset + PAGE_SIZE;

  if (listings.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 py-16 text-center">
        <div className="mb-4 text-4xl">🔍</div>
        <h2 className="mb-2 text-lg font-semibold text-slate-700">ยังไม่มีที่ดินในเงื่อนไขนี้</h2>
        <p className="mx-auto mb-6 max-w-sm text-sm text-slate-500">
          ทีมเราอาจมีที่ดินที่ยังไม่ได้ลงประกาศ ติดต่อผ่าน LINE เพื่อรับข้อมูลก่อนใคร
          หรือบันทึกตัวกรองเพื่อกลับมาดูประกาศล่าสุด
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <LineButton label="สอบถามที่ดินผ่าน LINE" />
          <Link href="/submit-land" className="btn-outline">
            ส่งที่ดินของคุณ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 text-sm text-slate-500">แสดง {listings.length} แปลง</div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((land) => (
          <ListingCard
            key={land.id}
            land={land}
            {...resolveListingPresentation(land)}
            ctaLabel="ดูรายละเอียดทรัพย์"
          />
        ))}
      </div>

      {(hasNext || page > 1) && (
        <div className="mt-10 flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={pageHref(page - 1)}
              className="btn-outline px-4 py-2 text-sm"
            >
              ← ก่อนหน้า
            </Link>
          )}
          {hasNext && (
            <Link
              href={pageHref(page + 1)}
              className="btn-primary px-4 py-2 text-sm"
            >
              ถัดไป →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
