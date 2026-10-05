import type { Metadata } from "next";
import BuyerRequirementForm from "@/components/forms/BuyerRequirementForm";
import { getPersistedProvinces } from "@/lib/neon/queries";

export const metadata: Metadata = {
  title: "ฝากความต้องการซื้อทรัพย์",
  description: "แจ้งเงื่อนไขซื้ออสังหาริมทรัพย์ เพื่อจับคู่กับทรัพย์จริงในระบบ LandmarketThai",
  alternates: { canonical: "/buy-request" },
  openGraph: { url: "/buy-request" },
};

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function BuyRequestPage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = await searchParams;
  const provinces = await getPersistedProvinces().catch(() => []);

  return (
    <main className="bg-slate-50">
      <section className="bg-[#071d4a] px-4 py-10 text-white sm:px-6 sm:py-14 lg:px-8">
        <div className="container-xl max-w-3xl text-center">
          <h1 className="text-3xl font-black sm:text-4xl">บอกเราว่าต้องการที่ดินแบบไหน</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-blue-100 sm:text-base">
            ระบบจะเทียบกับที่ดินที่เปิดขายทันที และทีมงานจะหาแปลงที่ตรงเพิ่มให้ ไม่มีค่าใช้จ่าย
          </p>
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="container-xl max-w-3xl">
          <BuyerRequirementForm
            provinces={provinces}
            initial={{
              property_type: one(raw.property_type),
              province: one(raw.province),
              min_size_rai: one(raw.min_size_rai),
              max_size_rai: one(raw.max_size_rai),
              min_usable_area_sqm: one(raw.min_usable_area_sqm),
              max_usable_area_sqm: one(raw.max_usable_area_sqm),
              max_price: one(raw.max_price),
              max_price_per_rai: one(raw.max_price_per_rai),
              zoning: one(raw.zoning),
            }}
          />
        </div>
      </section>
    </main>
  );
}
