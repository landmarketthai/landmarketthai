import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { AuthProvider } from "@/components/auth/AuthProvider";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landmarketthai.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LandmarketThai – ที่ดินอุตสาหกรรม EEC ทั่วไทย",
    template: "%s | LandmarketThai",
  },
  description:
    "เครือข่ายที่ดินอุตสาหกรรมและ EEC ที่ใหญ่ที่สุดในไทย ซื้อ ขาย รับค่าแนะนำ ที่ดิน Rayong Chonburi Samut Prakan",
  keywords: ["ที่ดินอุตสาหกรรม", "EEC", "ที่ดิน Rayong", "ที่ดินโรงงาน", "referral ที่ดิน"],
  openGraph: {
    type: "website",
    locale: "th_TH",
    url: SITE_URL,
    siteName: "LandmarketThai",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body>
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
