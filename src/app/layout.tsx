import { getPublicContentAvailability } from "@/lib/public-content";
import { SITE_URL } from "@/lib/constants/site";
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


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LandmarketThai – ค้นหาและฝากขายอสังหาริมทรัพย์",
    template: "%s | LandmarketThai",
  },
  description:
    "แพลตฟอร์มสำหรับค้นหา ฝากขาย และเชื่อมต่อผู้ซื้อ ผู้ขาย และพาร์ทเนอร์อสังหาริมทรัพย์",
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "LandmarketThai",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const availability = await getPublicContentAvailability();
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body>
        <AuthProvider>
          <Navbar showBlog={availability.blog !== false} />
          <main>{children}</main>
          <Footer showBlog={availability.blog !== false} showBuyerDemand={availability.buyerDemand !== false} />
        </AuthProvider>
      </body>
    </html>
  );
}
