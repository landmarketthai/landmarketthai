import { permanentRedirect } from "next/navigation";
import { propertyHref } from "@/lib/property-detail-data";

export default async function LegacyPropertyRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(propertyHref(slug));
}
