import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Calendar, ChevronRight } from "lucide-react";
import { getPostBySlug, getPublishedPosts } from "@/lib/neon/queries";
import { cdnUrl } from "@/lib/utils";
import JsonLd from "@/components/seo/JsonLd";

export const revalidate = 3600;

interface Params { slug: string }

export async function generateStaticParams() {
  const posts = await getPublishedPosts({ limit: 100 }).catch(() => []);
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug).catch(() => null);
  if (!post) return {};
  return {
    title: post.seo_title ?? post.title_th,
    description: post.seo_description ?? post.excerpt ?? "",
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      url: `/blog/${slug}`,
      images: post.cover_image_key ? [cdnUrl(post.cover_image_key)] : [],
      type: "article",
      publishedTime: post.published_at ?? undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug).catch(() => null);
  if (!post) notFound();

  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title_th,
    description: post.excerpt ?? "",
    image: post.cover_image_key ? cdnUrl(post.cover_image_key) : undefined,
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.updated_at,
    author: { "@type": "Organization", name: "LandmarketThai" },
    publisher: { "@type": "Organization", name: "LandmarketThai" },
  };

  return (
    <div className="container-xl section max-w-3xl">
      <JsonLd data={schema} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-slate-500 mb-6">
        <Link href="/" className="hover:text-brand-600">หน้าแรก</Link>
        <ChevronRight size={12} />
        <Link href="/blog" className="hover:text-brand-600">บทความ</Link>
        {post.category && (
          <>
            <ChevronRight size={12} />
            <Link href={`/blog/category/${post.category.slug}`} className="hover:text-brand-600">
              {post.category.name_th}
            </Link>
          </>
        )}
        <ChevronRight size={12} />
        <span className="text-slate-700 line-clamp-1">{post.title_th}</span>
      </nav>

      {post.category && (
        <span className="badge bg-brand-100 text-brand-700 mb-4 inline-block">
          {post.category.name_th}
        </span>
      )}

      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">{post.title_th}</h1>

      <div className="flex items-center gap-1 text-xs text-slate-400 mb-6">
        <Calendar size={11} />
        {post.published_at
          ? new Date(post.published_at).toLocaleDateString("th-TH", {
              year: "numeric", month: "long", day: "numeric",
            })
          : ""}
      </div>

      {post.cover_image_key && (
        <div className="relative rounded-2xl overflow-hidden aspect-video mb-8 bg-slate-100">
          <Image
            src={cdnUrl(post.cover_image_key)}
            alt={post.title_th}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 800px"
            className="object-cover"
          />
        </div>
      )}

      <div className="prose prose-slate prose-sm sm:prose-base max-w-none">
        {post.body ? (
          <div dangerouslySetInnerHTML={{ __html: post.body }} />
        ) : (
          <p className="text-slate-500">เนื้อหากำลังเตรียม</p>
        )}
      </div>

      <div className="mt-10 pt-6 border-t border-slate-100">
        <Link href="/blog" className="text-sm text-slate-500 hover:text-brand-600">
          ← กลับไปหน้าบทความ
        </Link>
      </div>
    </div>
  );
}
