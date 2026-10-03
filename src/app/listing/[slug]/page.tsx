import { notFound, permanentRedirect } from "next/navigation";
import { getListingByRef } from "@/lib/neon/queries";
import { propertyHref } from "@/lib/property-detail-data";

export default async function LegacyListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const match = /^(\d+)-.+$/.exec(slug);
  const ref = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(ref) || ref <= 0) notFound();
  const land = await getListingByRef(ref);
  if (!land) notFound();
  permanentRedirect(propertyHref(land.slug));
}
