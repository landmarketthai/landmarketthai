import { getPublicContentAvailability } from "@/lib/public-content";
import { SITE_URL } from "@/lib/constants/site";
import type { Metadata } from "next";
import Script from "next/script";
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
        {/* ponytail: dev-only. Phones opening http://<LAN IP>:<port> are not a secure context, so
            crypto.randomUUID is missing and the auth client crashes on load. Production is HTTPS. */}
        {process.env.NODE_ENV === "development" && (
          <Script id="dev-random-uuid" strategy="beforeInteractive">{`if(window.crypto&&!crypto.randomUUID){crypto.randomUUID=function(){var b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;var h=Array.from(b,function(x){return(x+256).toString(16).slice(1)}).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20)}}`}</Script>
        )}
        <AuthProvider>
          <Navbar showBlog={availability.blog !== false} />
          <main>{children}</main>
          <Footer showBlog={availability.blog !== false} showBuyerDemand={availability.buyerDemand !== false} />
        </AuthProvider>
      </body>
    </html>
  );
}
