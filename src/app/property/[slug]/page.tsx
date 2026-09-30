import { permanentRedirect } from "next/navigation";

export default async function LegacyPropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/properties/${slug}`);
}
