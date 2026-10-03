import { getPublicContentAvailability } from "@/lib/public-content";
import { archiveRobots } from "@/lib/public-seo";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Calendar } from "lucide-react";
import { getPublishedPosts } from "@/lib/neon/queries";
import { cdnUrl } from "@/lib/utils";

export const revalidate = 3600;

const archiveMetadata: Metadata = {
  title: "บทความ – ความรู้ที่ดินอุตสาหกรรม EEC",
  description:
    "บทความความรู้ด้านที่ดินอุตสาหกรรม EEC กฎหมาย เอกสารสิทธิ์ การลงทุน สำหรับผู้ซื้อ ผู้ขาย และพาร์ทเนอร์",
  alternates: { canonical: "/blog" },
  openGraph: { url: "/blog" },
};

export async function generateMetadata(): Promise<Metadata> {
  const availability = await getPublicContentAvailability();
  return { ...archiveMetadata, robots: archiveRobots(availability.blog !== false) };
}

export default async function BlogPage() {
  const posts = await getPublishedPosts({ limit: 20 }).catch(() => null);
  if (posts === null) return <div className="container-xl section text-center" role="alert">
    <h1 className="text-xl font-bold">โหลดบทความไม่ได้ในขณะนี้</h1>
    <Link href="/blog" className="btn-outline mt-4">ลองใหม่</Link>
  </div>;

  return (
    <div>
      <div className="bg-slate-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="container-xl">
          <h1 className="text-2xl font-bold mb-1">บทความ & ความรู้</h1>
          <p className="text-slate-400 text-sm">ที่ดินอุตสาหกรรม EEC กฎหมาย การลงทุน</p>
        </div>
      </div>

      <div className="container-xl section">
        {posts.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-4">📝</div>
            <p>กำลังเตรียมบทความ กลับมาใหม่เร็วๆ นี้</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="card group hover:shadow-md transition-shadow"
              >
                {post.cover_image_key && (
                  <div className="relative h-44 bg-slate-100">
                    <Image
                      src={cdnUrl(post.cover_image_key)}
                      alt={post.title_th}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <div className="p-5">
                  {post.category && (
                    <span className="badge bg-brand-100 text-brand-700 mb-3">
                      {post.category.name_th}
                    </span>
                  )}
                  <h2 className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2 mb-2 group-hover:text-brand-600 transition-colors">
                    {post.title_th}
                  </h2>
                  {post.excerpt && (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">{post.excerpt}</p>
                  )}
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Calendar size={11} />
                    {post.published_at
                      ? new Date(post.published_at).toLocaleDateString("th-TH", {
                          year: "numeric", month: "long", day: "numeric",
                        })
                      : ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
