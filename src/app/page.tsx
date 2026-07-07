import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, MapPin,
  BadgeDollarSign, BarChart3, Smartphone, Wallet, Target, Users,
  Shield, Search, Calendar, Clock,
  Wrench, Briefcase, Building2, Network,
} from "lucide-react";
import TrustStrip from "@/components/ui/TrustStrip";
import MobileStickyCta from "@/components/ui/MobileStickyCta";
import ListingCard from "@/components/listings/ListingCard";
import FacebookIcon from "@/components/ui/FacebookIcon";
import LineIcon from "@/components/ui/LineIcon";
import JsonLd from "@/components/seo/JsonLd";
import { getFeaturedListings, getActiveDemands } from "@/lib/supabase/queries";
import {
  SEED_109_RAI_LAND,
  mergeWithSeedListings,
  resolveListingPresentation,
  sortSeedListings,
} from "@/lib/seed-listings";
import { LAND_TYPE_LABELS } from "@/lib/utils";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "LandmarketThai – ที่ดินอุตสาหกรรม EEC ทั่วไทย",
  description:
    "แพลตฟอร์มที่ดินอุตสาหกรรม EEC ระยอง ชลบุรี ทีมงานช่วยดูแลข้อมูล นัดหมาย และการเจรจา สำหรับผู้แนะนำ เจ้าของที่ดิน และนักลงทุน",
};

const LINE_OA = process.env.NEXT_PUBLIC_LINE_OA_URL ?? "https://lin.ee/8p064f7";
const FACEBOOK_URL = process.env.NEXT_PUBLIC_FACEBOOK_URL ?? "https://www.facebook.com/Landmarketthai";

const LINE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
  </svg>
);

const benefits: { Icon: LucideIcon; label: string }[] = [
  { Icon: BadgeDollarSign, label: "ไม่ต้องลงทุน\nไม่ต้องสต็อก" },
  { Icon: BarChart3,       label: "มีระบบ-ทีมงาน\nสนับสนุน" },
  { Icon: Smartphone, label: "ใช้งานง่าย\nผ่านออนไลน์" },
  { Icon: Wallet,      label: "รายได้ไม่จำกัด\nยิ่งแนะ ยิ่งได้" },
  { Icon: Target,      label: "เหมาะกับทุกคน\nที่อยากมีรายได้เพิ่ม" },
];

const howToEarnSteps = [
  {
    num: "1",
    title: "สมัคร\nเข้าร่วมฟรี",
    desc: "กรอกข้อมูลออนไลน์ ไม่มีค่าใช้จ่าย",
  },
  {
    num: "2",
    title: "แนะนำที่ดิน\nจากแพลตฟอร์ม",
    desc: "ส่งลีดผ่าน LINE หรือแชร์รหัสแนะนำ ทีมเราดูแลทั้งหมด",
  },
  {
    num: "3",
    title: "จบดีล\nรับค่าแนะนำ",
    desc: "ปิดดีลเมื่อไหร่ รับเงินตามเงื่อนไขที่กำหนด",
  },
];

const earnerPersonas: { Icon: LucideIcon; label: string }[] = [
  { Icon: Building2, label: "นายหน้าอสังหาริมทรัพย์" },
  { Icon: Network,   label: "คนมีเครือข่ายนักลงทุน" },
  { Icon: Wrench,    label: "ผู้รับเหมาและผู้ประกอบการในพื้นที่" },
  { Icon: Briefcase, label: "คนรู้จักเจ้าของโรงงานหรือธุรกิจ" },
];

const partnerBenefits: { Icon: LucideIcon; label: string }[] = [
  { Icon: BadgeDollarSign, label: "ไม่ต้องลงทุน" },
  { Icon: Target,          label: "ไม่ต้องปิดการขายเอง" },
  { Icon: Users,           label: "ทีมงานช่วยดูแลข้อมูล นัดหมาย และการเจรจา" },
];

const trustItems: { Icon: LucideIcon; label: string }[] = [
  { Icon: Shield,       label: "ปลอดภัย\nเชื่อถือได้" },
  { Icon: Search,       label: "ตรวจสอบข้อมูล\nก่อนเผยแพร่" },
  { Icon: Users,        label: "มีทีมงานมืออาชีพ\nช่วยปิดดีล" },
  { Icon: Calendar,     label: "ข้อมูลอัปเดต\nทุกวัน" },
  { Icon: Clock,        label: "ปิดดีลไว\nตรวจสอบ 100%" },
];

const fallbackDemands = [
  { province: "ระยอง",         type: "อุตสาหกรรม",  size: "50–100 ไร่", note: "ใกล้นิคมอุตสาหกรรม สำหรับโรงงานผลิต",         ago: "2 ชม. ที่แล้ว" },
  { province: "ชลบุรี",        type: "โลจิสติกส์",  size: "20–50 ไร่",  note: "ใกล้ท่าเรือแหลมฉบัง สำหรับคลังสินค้า",         ago: "4 ชม. ที่แล้ว" },
  { province: "สมุทรปราการ",  type: "ศูนย์ข้อมูล", size: "30–80 ไร่",  note: "บางนา-เทพารักษ์ สำหรับศูนย์ข้อมูล",              ago: "1 วัน ที่แล้ว" },
  { province: "อยุธยา",        type: "อุตสาหกรรม",  size: "100+ ไร่",   note: "ใกล้นิคมบางปะอิน สำหรับโรงงาน",                 ago: "1 วัน ที่แล้ว" },
];

export default async function HomePage() {
  const [featuredListings, demands] = await Promise.all([
    getFeaturedListings(6).catch(() => []),
    getActiveDemands(4).catch(() => []),
  ]);

  const sortedListings = sortSeedListings(mergeWithSeedListings(featuredListings));
  const showHomepageExtras = featuredListings.length === 0;

  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "LandmarketThai",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://landmarketthai.com",
    description: "แพลตฟอร์มที่ดินอุตสาหกรรมและ EEC",
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", availableLanguage: "Thai" },
  };

  return (
    <>
      <JsonLd data={[orgSchema]} />

      {/* ── 1. HERO ───────────────────────────────────────────────────────── */}
      <section className="bg-white pt-0 pb-0">
        {/* Banner — full viewport width, capped height */}
        <div className="hero-banner">
          <Image
            src="/images/final-banner.png"
            alt="LandmarketThai referral income hero banner"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_43%]"
          />
          {/* ── Sales copy — left overlay (md+) ── */}
          <div className="absolute left-5 top-5 hidden w-[360px] md:block lg:left-8 lg:top-7 lg:w-[520px] xl:left-16 xl:top-8 xl:w-[560px]">
            <div className="drop-shadow-[0_4px_12px_rgba(255,255,255,0.70)]">
              <h1 className="text-2xl font-black leading-tight text-[#06235f] lg:text-[2rem] xl:text-[2.35rem]">
                มีคอนเนกชันนักลงทุนหรือเจ้าของโรงงาน?
              </h1>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[#0a2a63] lg:mt-3 lg:text-base xl:text-lg">
                แนะนำที่ดินอุตสาหกรรม EEC กับเรา
                <br />
                ทีมงานช่วยดูแลข้อมูล การนัดหมาย และการเจรจาจนจบ
              </p>
              <p className="mt-2 text-xs font-medium text-[#0f3478]/80 lg:text-sm">
                รับค่าตอบแทนตามเงื่อนไข เมื่อธุรกรรมสำเร็จ
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 lg:mt-5">
              <Link href="/land" className="btn-green px-4 py-2.5 text-sm">
                ดูที่ดินพร้อมแนะนำ
              </Link>
              <Link href="/become-partner" className="btn-white px-4 py-2.5 text-sm ring-1 ring-white/60">
                สมัครเป็นผู้แนะนำ
              </Link>
            </div>
            <Link
              href="/submit-land"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#0f3478] underline-offset-2 hover:underline"
            >
              มีที่ดินต้องการขาย
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* ── QR / LINE card — desktop only ── */}
          <div className="absolute right-5 top-5 hidden w-[176px] overflow-hidden rounded-xl bg-[#06235f] p-1.5 text-center text-brand-900 shadow-[0_20px_58px_rgba(4,16,44,0.30)] ring-1 ring-white/80 backdrop-blur-md lg:right-16 lg:top-8 lg:block lg:w-[216px] lg:p-2 xl:right-28 xl:top-10 xl:w-[248px] 2xl:right-32">
            <div className="px-3 pb-2 pt-1.5 text-white lg:px-4 lg:pb-3 lg:pt-2">
              <p className="text-sm font-black leading-tight lg:text-lg xl:text-xl">ติดต่อทีมงาน</p>
              <p className="mt-0.5 text-xs font-semibold text-gold-400 lg:mt-1 lg:text-sm">สอบถามที่ดินและเงื่อนไขผู้แนะนำ</p>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] lg:gap-3.5 lg:px-4 lg:py-4 xl:px-5">
              <div>
                <p className="text-xs font-black text-brand-800 lg:text-sm">สแกนเพิ่มเพื่อนใน LINE</p>
                <p className="mt-0.5 hidden text-[11px] font-medium text-slate-500 lg:block">
                  รับข่าวสารและดีลพิเศษก่อนใคร
                </p>
              </div>
              <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-white p-1.5 shadow-[0_10px_26px_rgba(15,52,120,0.12)] ring-1 ring-slate-200 lg:h-32 lg:w-32 lg:p-2 xl:h-36 xl:w-36">
                <Image
                  src="/images/line-qr.png"
                  alt="คิวอาร์โค้ด LINE OA"
                  width={288}
                  height={288}
                  className="h-full w-full rounded-lg object-contain"
                />
              </div>
              <div className="flex w-full flex-col gap-1.5 lg:gap-2">
                <Link
                  href={LINE_OA}
                  target="_blank"
                  rel="noopener"
                  className="btn-line w-full justify-center gap-1.5 py-2 text-xs font-bold tracking-tight active:scale-[0.98] lg:gap-2.5 lg:py-2.5 lg:text-sm"
                >
                  <LineIcon size={18} />
                  @landmarketthai
                </Link>
                <Link
                  href={FACEBOOK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="เฟซบุ๊ก"
                  className="btn-facebook w-full justify-center py-2 lg:py-2.5"
                >
                  <FacebookIcon size={18} />
                </Link>
              </div>
            </div>
          </div>

          {/* ── Mobile conversion copy ── */}
          <div className="hero-mobile-scrim" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-5 pt-16 md:hidden">
            <div className="max-w-sm">
              <p className="text-xs font-bold tracking-wide text-gold-400">
                LandmarketThai · ที่ดินอุตสาหกรรม EEC
              </p>
              <h1 className="mt-2 text-[1.65rem] font-black leading-[1.12] text-white drop-shadow-sm">
                มีคอนเนกชันนักลงทุนหรือเจ้าของโรงงาน?
              </h1>
              <p className="mt-2 max-w-[20rem] text-sm leading-relaxed text-blue-50">
                แนะนำที่ดินอุตสาหกรรม EEC กับเรา ทีมงานช่วยดูแลข้อมูล การนัดหมาย และการเจรจาจนจบ
              </p>
              <p className="mt-2 text-xs font-medium text-blue-100/85">
                รับค่าตอบแทนตามเงื่อนไข เมื่อธุรกรรมสำเร็จ
              </p>
              <div className="mt-4 flex flex-col gap-2 min-[390px]:flex-row">
                <Link
                  href="/land"
                  className="btn-green justify-center px-4 text-sm"
                >
                  ดูที่ดินพร้อมแนะนำ
                </Link>
                <Link
                  href="/become-partner"
                  className="btn-white justify-center px-4 text-sm"
                >
                  สมัครเป็นผู้แนะนำ
                </Link>
              </div>
              <Link
                href="/submit-land"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-white underline-offset-2 hover:underline"
              >
                มีที่ดินต้องการขาย
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>

        {/* Benefit strip */}
        <div className="container-xl px-4 sm:px-6 lg:px-8">
          <div className="relative z-30 mt-4 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-[0_8px_32px_rgba(4,16,44,0.14)] sm:-mt-28 md:-mt-36 lg:-mt-16">
            <div className="grid grid-cols-1 divide-y divide-slate-100/80 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
              {benefits.map((b, index) => {
                const Icon = b.Icon;
                const iconStyle = [
                  "border-emerald-100 bg-emerald-50 text-emerald-600",
                  "border-sky-100 bg-sky-50 text-sky-600",
                  "border-blue-100 bg-blue-50 text-blue-600",
                  "border-amber-100 bg-amber-50 text-amber-600",
                  "border-rose-100 bg-rose-50 text-rose-600",
                ][index % 5];
                return (
                  <div key={b.label} className="flex items-center gap-3 px-4 py-3 sm:flex-col sm:items-center sm:justify-center sm:gap-2 sm:px-3 sm:py-4 sm:text-center lg:flex-row lg:justify-start lg:text-left">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${iconStyle}`}>
                      <Icon size={21} strokeWidth={2.15} />
                    </div>
                    <span className="text-xs font-semibold leading-snug text-brand-900 whitespace-pre-line">{b.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. TRUST STRIP ───────────────────────────────────────────────── */}
      <TrustStrip />

      {/* ── 3. FEATURED LISTINGS ─────────────────────────────────────────── */}
      <section id="featured-listings" className="bg-white px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="container-xl">
          <div className="mb-7 flex flex-col items-center gap-3 text-center sm:relative sm:block">
            <h2 className="text-2xl font-bold text-[#0a2a63] sm:text-[28px]">
              ที่ดินแนะนำ <b className="text-[#2f9e44]">อัปเดตทุกวัน</b>
            </h2>
            <Link
              href="/land"
              className="text-sm font-semibold text-blue-700 hover:underline sm:absolute sm:right-0 sm:bottom-1"
            >
              ดูทั้งหมด ›
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {sortedListings.map((land) => {
              const presentation = resolveListingPresentation(land);
              return (
                <ListingCard
                  key={land.id}
                  land={land}
                  ctaLabel="ดูรายละเอียดแปลง"
                  {...presentation}
                />
              );
            })}
            {showHomepageExtras && (
              <>
                <ListingCard
                  key={SEED_109_RAI_LAND.id}
                  land={SEED_109_RAI_LAND}
                  ctaLabel="ดูรายละเอียดแปลง"
                  {...resolveListingPresentation(SEED_109_RAI_LAND)}
                  rewardLabel="ค่าตอบแทนผู้แนะนำ (ดีลสำเร็จ)"
                  rewardSuffix={undefined}
                />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 4. HOW IT WORKS + WHO CAN EARN ───────────────────────────────── */}
      <section className="bg-[#eef2f9] px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="container-xl">
          <div className="grid lg:grid-cols-2 gap-5">

            {/* Steps panel */}
            <div className="rounded-[18px] border border-slate-100 bg-white p-5 shadow-[0_2px_8px_rgba(13,30,70,0.06)] sm:p-7">
              <h3 className="mb-6 text-center text-xl font-bold text-[#0a2a63] sm:text-[22px]">
                3 ขั้นตอน เริ่มแนะนำที่ดิน
              </h3>
              <div className="flex items-start justify-center gap-1">
                {howToEarnSteps.map((step, i) => (
                  <div key={step.num} className="flex items-start flex-1 min-w-0">
                    <div className="flex min-w-0 flex-1 flex-col items-center">
                      <div className="mb-2.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0f3478] text-lg font-bold text-white shadow-[0_8px_18px_rgba(15,52,120,0.32)] sm:h-11 sm:w-11 sm:text-[19px]">
                        {step.num}
                      </div>
                      <div className="text-center px-1">
                        <div className="whitespace-pre-line text-xs font-semibold leading-snug text-slate-800 sm:text-sm">
                          {step.title}
                        </div>
                      </div>
                    </div>
                    {i < howToEarnSteps.length - 1 && (
                      <div className="flex shrink-0 items-start px-0.5 pt-3 sm:px-1">
                        <ArrowRight size={18} className="mt-1.5 text-[#14409a] sm:size-5" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-7 flex gap-3 flex-wrap justify-center">
                <Link href="/become-partner" className="btn-green text-sm">
                  สมัครเป็นผู้แนะนำ
                </Link>
                <Link href="/how-it-works" className="btn-outline text-sm">
                  รับ Sale Toolkit
                </Link>
              </div>
            </div>

            {/* Who it's for panel */}
            <div className="rounded-[18px] border border-slate-100 bg-white p-5 shadow-[0_2px_8px_rgba(13,30,70,0.06)] sm:p-7">
              <h3 className="mb-6 text-center text-xl font-bold text-[#0a2a63] sm:text-[22px]">
                เหมาะสำหรับใคร
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {earnerPersonas.map((p) => {
                  const Icon = p.Icon;
                  return (
                    <div key={p.label} className="flex flex-col items-center text-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-[#0f3478]">
                        <Icon size={18} strokeWidth={1.8} />
                      </div>
                      <div className="text-sm font-semibold leading-snug text-slate-700 sm:text-[13.5px]">{p.label}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5">
                {partnerBenefits.map((b) => {
                  const Icon = b.Icon;
                  return (
                    <div key={b.label} className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <Icon size={16} strokeWidth={2} />
                      </div>
                      <span className="text-sm font-medium leading-snug text-slate-700">{b.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6">
                <Link href="/become-partner" className="btn-green w-full justify-center text-sm">
                  เข้าร่วมเป็นผู้แนะนำ
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. BUYER DEMAND ──────────────────────────────────────────────── */}
      <section className="bg-white px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="container-xl">
          <div className="mb-7 flex flex-col items-center gap-3 text-center sm:relative sm:block">
            <h2 className="text-2xl font-bold text-[#0a2a63] sm:text-[28px]">
              ความต้องการที่ดิน <b className="text-[#2f9e44]">(ผู้ซื้อกำลังหา)</b>
            </h2>
            <Link
              href="/buyer-demand"
              className="text-sm font-semibold text-blue-700 hover:underline sm:absolute sm:right-0 sm:bottom-1"
            >
              ดูทั้งหมด ›
            </Link>
          </div>

          <p className="mx-auto mb-7 max-w-2xl text-center text-sm leading-relaxed text-slate-600 sm:text-base">
            ทีมงานกำลังคัดเลือกที่ดินให้ผู้ซื้อและนักลงทุนตามเงื่อนไขด้านล่าง
            หากมีที่ดินตรงหรือใกล้เคียง ส่งข้อมูลให้ทีมตรวจสอบได้
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {demands.length > 0
              ? demands.slice(0, 4).map((d) => (
                  <Link
                    key={d.id}
                    href={`/buyer-demand/${d.slug}`}
                    className="min-h-32 rounded-[18px] p-4 pb-5 transition-shadow hover:shadow-md"
                    style={{ background: "#fdf3e5", border: "1px solid #f1ddbd" }}
                  >
                    <div className="flex min-w-0 items-center gap-1.5 text-[17px] font-bold text-[#0a2a63]">
                      <MapPin size={16} className="text-[#2f9e44]" />
                      <span className="truncate">{d.province?.name_th ?? "ทั่วไทย"}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-800 mt-2 mb-1.5">
                      ต้องการที่ดิน{" "}
                      {d.size_min_rai && d.size_max_rai
                        ? `${d.size_min_rai}–${d.size_max_rai} ไร่`
                        : d.size_min_rai
                        ? `${d.size_min_rai}+ ไร่`
                        : "ทุกขนาด"}
                    </div>
                    {d.budget_note && (
                      <div className="text-xs text-slate-500 leading-relaxed">{d.budget_note}</div>
                    )}
                    {d.land_type && (
                      <div className="mt-3 text-xs text-[#2a8a3c] font-semibold">
                        {LAND_TYPE_LABELS[d.land_type]}
                      </div>
                    )}
                  </Link>
                ))
              : fallbackDemands.map((d) => (
                  <div
                    key={d.province}
                    className="min-h-32 rounded-[18px] p-4 pb-5"
                    style={{ background: "#fdf3e5", border: "1px solid #f1ddbd" }}
                  >
                    <div className="flex min-w-0 items-center gap-1.5 text-[17px] font-bold text-[#0a2a63]">
                      <MapPin size={16} className="text-[#2f9e44]" />
                      <span className="truncate">{d.province}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-800 mt-2 mb-1.5">
                      ต้องการที่ดิน {d.size}
                    </div>
                    <div className="text-xs text-slate-500 leading-relaxed">{d.note}</div>
                    <div className="mt-3 text-xs text-[#2a8a3c] font-semibold">
                      อัปเดต {d.ago}
                    </div>
                  </div>
                ))}

          </div>

          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <Link href="/submit-land" className="btn-green px-8 text-sm">
              ส่งที่ดินให้ทีมประเมิน
            </Link>
            <p className="text-xs text-slate-500">
              ใช้เวลาแจ้งข้อมูลเบื้องต้นไม่กี่นาที
            </p>
          </div>
        </div>
      </section>

      {/* ── 6. BOTTOM CTA + TRUST STRIP ─────────────────────────────────── */}
      <section className="bg-white px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="container-xl">
          {/* CTA box — navy 3-col card */}
          <div
            className="relative grid grid-cols-1 items-center gap-7 overflow-hidden rounded-[26px] px-5 py-8 shadow-[0_14px_36px_rgba(13,30,70,0.10)] sm:px-8 sm:py-9 lg:grid-cols-[1fr_auto_auto] lg:px-10"
            style={{ background: "linear-gradient(120deg, #0f3478, #071d4a)" }}
          >
            {/* green glow decoration */}
            <div
              className="absolute -right-14 -top-14 w-64 h-64 rounded-full pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(47,158,68,0.22), transparent 70%)",
              }}
            />

            {/* Text */}
            <div className="relative z-10 text-center text-white lg:text-left">
              <h2 className="text-xl font-bold leading-snug lg:text-[26px]">
                มีคอนเนกชันที่ดินอุตสาหกรรม?
                <br />
                ทีมงานช่วยดูแลข้อมูล นัดหมาย และการเจรจา
              </h2>
            </div>

            {/* Button + note */}
            <div className="relative z-10 flex flex-col items-center gap-2">
              <Link
                href="/become-partner"
                className="btn-green w-full px-6 py-4 text-base ring-2 ring-[#33c477]/50 sm:w-auto sm:px-8"
              >
                สมัครเป็นผู้แนะนำ
              </Link>
              <small className="text-white/70 text-xs">รับค่าตอบแทนตามเงื่อนไข เมื่อธุรกรรมสำเร็จ</small>
            </div>

            {/* QR card */}
            <div className="relative z-10 hidden items-center gap-3 sm:flex">
              <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-xl bg-white p-2">
                <Image
                  src="/images/line-qr.png"
                  alt="คิวอาร์โค้ด LINE OA"
                  width={288}
                  height={288}
                  className="h-full w-full rounded-lg object-contain"
                />
              </div>
              <div>
                <small className="text-white font-semibold text-sm leading-snug block">
                  สแกนเพิ่มเพื่อน
                  <br />
                  ใน LINE OA
                </small>
                <div className="w-8 h-8 rounded-lg bg-[#06c755] flex items-center justify-center text-white mt-1.5">
                  {LINE_ICON}
                </div>
              </div>
            </div>
          </div>

          {/* Trust strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-8 pb-1">
            {trustItems.map((t) => {
              const Icon = t.Icon;
              return (
                <div key={t.label} className="flex items-center justify-center gap-2.5">
                  <div className="h-[38px] w-[38px] shrink-0 text-[#0f3478]">
                    <Icon size={38} strokeWidth={1.8} />
                  </div>
                  <div className="text-sm font-semibold text-slate-800 leading-tight whitespace-pre-line">
                    {t.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <MobileStickyCta />
    </>
  );
}
