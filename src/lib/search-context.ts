import { getAllProvinces, getLocationOptions } from "@/lib/neon/queries";
import { findProvince } from "@/lib/thai-admin";

/** Data every SearchExperience screen needs besides its results (/search and the /land SEO pages). */
export async function loadSearchContext() {
  const [provinces, locationOptions] = await Promise.all([
    getAllProvinces().catch(() => []),
    getLocationOptions().catch(() => []),
  ]);
  // Province slug -> admin code, used to load /geo/th/<code>.json boundaries on the map.
  const provinceCodes = Object.fromEntries(provinces.flatMap((province) => {
    const code = findProvince(province.name_th)?.code;
    return code ? [[province.slug, code]] : [];
  }));
  return { provinces, locationOptions, provinceCodes };
}
