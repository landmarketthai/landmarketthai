export interface PropertyDetailImage {
  src: string;
  alt: string;
}

export interface PropertyDetailVideo {
  src: string;
  title: string;
}

export interface PropertyMapEmbed {
  embedUrl: string;
  directionsUrl: string;
  description: string;
}

export interface PropertyDetail {
  slug: string;
  title: string;
  shortTitle: string;
  location: string;
  size: string;
  zoning: string;
  pricePerRai: string;
  referralReward?: string;
  soldOut?: boolean;
  frontage: string;
  access: string;
  status: string;
  nearby: string[];
  heroImage: PropertyDetailImage;
  keyHighlights: string[];
  facts: Array<{
    label: string;
    value: string;
  }>;
  highlightCards: Array<{
    title: string;
    description: string;
  }>;
  gallery: PropertyDetailImage[];
  videos?: PropertyDetailVideo[];
  mapEmbed?: PropertyMapEmbed;
}

export const propertyDetails: PropertyDetail[] = [
  {
    slug: "109-rai-eec-rayong",
    title: "ที่ดินอุตสาหกรรม EEC ระยอง 109 ไร่ ใกล้ WHA และ BYD",
    shortTitle: "109 ไร่ EEC ระยอง",
    location: "นิคมพัฒนา, ระยอง",
    size: "109 ไร่ 2 งาน 52 ตร.ว.",
    zoning: "ผังสีม่วง",
    pricePerRai: "2.75 ล้านบาท/ไร่",
    soldOut: true,
    frontage: "ประมาณ 240 เมตร",
    access: "เข้าออกได้ 2 ทาง",
    status: "Sold out",
    nearby: ["WHA", "BYD"],
    heroImage: {
      src: "/images/listings/109-rai-home-thumbnail.png",
      alt: "ภาพโดรนที่ดินอุตสาหกรรม 109 ไร่ EEC ระยอง",
    },
    keyHighlights: [
      "พื้นที่ 109 ไร่ 2 งาน 52 ตร.ว.",
      "ผังสีม่วง เหมาะสำหรับโรงงานและคลังสินค้า",
      "หน้ากว้างประมาณ 240 เมตร",
      "เข้าออกได้ 2 ทาง",
      "ใกล้ WHA และ BYD ในโซน EEC ระยอง",
    ],
    facts: [
      { label: "ขนาดที่ดิน", value: "109 ไร่ 2 งาน 52 ตร.ว." },
      { label: "ทำเล", value: "นิคมพัฒนา, ระยอง" },
      { label: "ผังเมือง", value: "ผังสีม่วง" },
      { label: "หน้ากว้าง", value: "ประมาณ 240 เมตร" },
      { label: "ทางเข้าออก", value: "เข้าออกได้ 2 ทาง" },
      { label: "ราคาเดิม", value: "2.75 ล้านบาท/ไร่" },
      { label: "ราคารวมเดิม", value: "301,482,500 บาท" },
      { label: "สถานะ", value: "Sold out" },
    ],
    highlightCards: [
      {
        title: "เหมาะสำหรับอุตสาหกรรม",
        description:
          "ที่ดินผังสีม่วงในพื้นที่ EEC เหมาะสำหรับโรงงาน คลังสินค้า และการลงทุนระยะยาว",
      },
      {
        title: "การเดินทางและโลจิสติกส์",
        description:
          "เข้าออกได้ 2 ทาง หน้ากว้างประมาณ 240 เมตร รองรับการขนส่งและรถบรรทุก",
      },
      {
        title: "ศักยภาพทำเล",
        description: "อยู่ใกล้ WHA และ BYD เหมาะกับผู้ซื้อที่ต้องการทำเลอุตสาหกรรมในระยอง",
      },
    ],
    gallery: [
      {
        src: "/images/listings/109-rai-gallery/01-drone-aerial.png",
        alt: "ภาพโดรนมุมสูงที่ดิน 109 ไร่ EEC ระยอง",
      },
      {
        src: "/images/listings/109-rai-gallery/02-drone-boundary.png",
        alt: "ภาพโดรนแสดงขอบเขตแปลงที่ดิน 109 ไร่",
      },
      {
        src: "/images/listings/109-rai-gallery/03-roadside-view.png",
        alt: "ภาพถนนหน้าแปลงที่ดิน 109 ไร่ EEC ระยอง",
      },
      {
        src: "/images/listings/109-rai-gallery/04-boundary-map.png",
        alt: "แผนที่ขอบเขตและขนาดพื้นที่ 109 ไร่ 2 งาน 52 ตร.ว.",
      },
      {
        src: "/images/listings/109-rai-gallery/05-zoning-map.png",
        alt: "แผนที่ผังสีม่วงและระยะขอบเขตแปลง 109 ไร่",
      },
      {
        src: "/images/listings/109-rai-gallery/06-overview.png",
        alt: "ภาพรวมที่ดิน 109 ไร่ ผังสีม่วง EEC ระยอง ราคาเดิม 2.75 ล้าน/ไร่",
      },
      {
        src: "/images/listings/109-rai-gallery/07-access-highlights.png",
        alt: "จุดเด่นแปลง 109 ไร่ หน้ากว้าง 240 เมตร เข้าออก 2 ทาง ใกล้ BYD",
      },
      {
        src: "/images/listings/109-rai-gallery/08-for-sale-sign.png",
        alt: "ภาพป้ายเดิมของที่ดิน EEC 109 ไร่ ระยอง",
      },
    ],
    mapEmbed: {
      embedUrl:
        "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3889.176!2d101.1035175!3d12.8964329!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3102e9004c2d1859%3A0x9818cef515e4a131!2z4Lie4Li34LmJ4LiZ4LiX4Li14LmIIDEwOSAtMiAtIDUyIOC5hOC4o-C5iCDguJnguLTguITguKHguJ7guLHguJLguJnguLI!5e0!3m2!1sth!2sth!4v1749186300000",
      directionsUrl: "https://maps.app.goo.gl/J3quUCkfN9Yi7G8U6?g_st=ic",
      description:
        "ที่ดินตั้งอยู่ในโซนอุตสาหกรรม EEC พื้นที่นิคมพัฒนา จังหวัดระยอง ใกล้ WHA Industrial Estate และโรงงาน BYD เดินทางสะดวกด้วยเส้นทางหลักในพื้นที่ EEC",
    },
  },
  {
    slug: "37-rai-eec-rayong",
    title: "ที่ดินอุตสาหกรรม EEC ระยอง 37 ไร่ ติดถนน 2026",
    shortTitle: "37 ไร่ EEC ระยอง",
    location: "ระยอง",
    size: "37 ไร่",
    zoning: "ผังสีม่วง",
    pricePerRai: "2.3 ล้านบาท/ไร่",
    referralReward: "ค่าแนะนำสูงสุด 1,200,000 บาท",
    frontage: "ประมาณ 240 เมตร",
    access: "ติดถนน 2026",
    status: "เปิดรับสอบถาม",
    nearby: ["ด้านหลังติดแหล่งน้ำ"],
    heroImage: {
      src: "/images/listings/37-rai-home-thumbnail.png",
      alt: "ภาพโดรนที่ดินอุตสาหกรรม 37 ไร่ EEC ระยอง",
    },
    keyHighlights: [
      "พื้นที่ 37 ไร่",
      "ผังสีม่วง เหมาะสำหรับอุตสาหกรรม",
      "หน้ากว้างประมาณ 240 เมตร",
      "ติดถนน 2026 เข้าออกสะดวก",
      "ด้านหลังติดแหล่งน้ำ",
    ],
    facts: [
      { label: "ขนาดที่ดิน", value: "37 ไร่" },
      { label: "ทำเล", value: "ระยอง" },
      { label: "ผังเมือง", value: "ผังสีม่วง" },
      { label: "หน้ากว้าง", value: "ประมาณ 240 เมตร" },
      { label: "ทางเข้าออก", value: "ติดถนน 2026" },
      { label: "สถานะ", value: "เปิดรับสอบถาม" },
    ],
    highlightCards: [
      {
        title: "เหมาะสำหรับอุตสาหกรรม",
        description:
          "ที่ดินผังสีม่วงในระยอง EEC เหมาะสำหรับโรงงาน คลังสินค้า และธุรกิจที่ต้องการพื้นที่อุตสาหกรรม",
      },
      {
        title: "เดินทางสะดวก",
        description: "ติดถนน 2026 พร้อมหน้ากว้างประมาณ 240 เมตร",
      },
      {
        title: "จุดเด่นของแปลง",
        description:
          "พื้นที่ขนาดเหมาะสมสำหรับผู้ซื้อที่ต้องการเริ่มโครงการอุตสาหกรรมในพื้นที่ EEC ระยอง",
      },
    ],
    gallery: [
      {
        src: "/images/listings/37-rai-gallery/01-roadside-view.png",
        alt: "ภาพถนนหน้าแปลงที่ดิน 37 ไร่ ติดถนน 2026",
      },
      {
        src: "/images/listings/37-rai-gallery/02-roadside-trench.png",
        alt: "ภาพหน้าแปลงที่ดิน 37 ไร่ ระยะริมถนน",
      },
      {
        src: "/images/listings/37-rai-gallery/03-site-prep.png",
        alt: "ภาพพื้นที่เตรียมแปลงที่ดิน 37 ไร่ EEC ระยอง",
      },
      {
        src: "/images/listings/37-rai-gallery/04-location-map.png",
        alt: "แผนที่ตำแหน่งแปลงที่ดิน 37 ไร่ ติดถนน 2026",
      },
      {
        src: "/images/listings/37-rai-gallery/05-boundary-map.png",
        alt: "แผนที่ขอบเขตและระยะรอบแปลงที่ดิน 37 ไร่",
      },
      {
        src: "/images/listings/37-rai-gallery/06-boundary-outline.png",
        alt: "แผนที่แสดงขอบเขตแปลง 37 ไร่ พร้อมระยะทางรอบแปลง",
      },
    ],
    mapEmbed: {
      embedUrl:
        "https://maps.google.com/maps?q=12.8626284,101.0948946&hl=th&z=17&output=embed",
      directionsUrl: "https://maps.app.goo.gl/PLjRadLVYJzFvtqa8?g_st=il",
      description:
        "ที่ดินตั้งอยู่ติดถนน 2026 ในพื้นที่ EEC จังหวัดระยอง เข้าถึงง่าย หน้ากว้างประมาณ 240 เมตร ด้านหลังติดแหล่งน้ำธรรมชาติ เหมาะสำหรับโครงการอุตสาหกรรมขนาดกลาง",
    },
  },
  {
    slug: "101-rai-kabin-buri",
    title: "ที่ดินอุตสาหกรรม 101 ไร่ กบินทร์บุรี ตรงข้ามสวนอุตสาหกรรมกวางตุ้ง",
    shortTitle: "101 ไร่ กบินทร์บุรี",
    location: "ต.หนองกี่, อ.กบินทร์บุรี, ปราจีนบุรี",
    size: "101 ไร่ 0 งาน 22 ตร.ว.",
    zoning: "พื้นที่อุตสาหกรรม",
    pricePerRai: "1.5 ล้านบาท/ไร่",
    referralReward: "ค่าแนะนำสูงสุด 2,275,000 บาท",
    frontage: "ประมาณ 700 เมตร",
    access: "ติดถนน อบต. ตรงข้ามสวนอุตสาหกรรมกวางตุ้ง",
    status: "เปิดรับสอบถาม",
    nearby: ["สวนอุตสาหกรรมกวางตุ้ง"],
    heroImage: {
      src: "/images/listings/kabin-buri-101-rai-gallery/01-drone-roadside.png",
      alt: "ภาพโดรนที่ดิน 101 ไร่ กบินทร์บุรี ติดถนนตรงข้ามสวนอุตสาหกรรมกวางตุ้ง",
    },
    keyHighlights: [
      "พื้นที่รวม 101 ไร่ 0 งาน 22 ตร.ว.",
      "ตั้งอยู่ตรงข้ามสวนอุตสาหกรรมกวางตุ้ง ต.หนองกี่ อ.กบินทร์บุรี",
      "หน้ากว้างติดถนน อบต. ประมาณ 700 เมตร",
      "เอกสารสิทธิ์ครบ 13 ฉบับ (12 โฉนด + ภ.บ.ท.5 จำนวน 2 แปลง)",
      "ราคา 1.5 ล้านบาท/ไร่ รวมประมาณ 151.5 ล้านบาท",
    ],
    facts: [
      { label: "ขนาดที่ดิน", value: "101 ไร่ 0 งาน 22 ตร.ว." },
      { label: "ทำเล", value: "ต.หนองกี่, อ.กบินทร์บุรี, ปราจีนบุรี" },
      { label: "จุดสังเกต", value: "ตรงข้ามสวนอุตสาหกรรมกวางตุ้ง" },
      { label: "หน้ากว้าง", value: "ประมาณ 700 เมตร" },
      { label: "ทางเข้าออก", value: "ติดถนน อบต." },
      { label: "เอกสารสิทธิ์", value: "13 ฉบับ (12 โฉนด + ภ.บ.ท.5 จำนวน 2 แปลง)" },
      { label: "ราคารวม (โดยประมาณ)", value: "151.5 ล้านบาท" },
      { label: "สถานะ", value: "เปิดรับสอบถาม" },
    ],
    highlightCards: [
      {
        title: "ทำเลอุตสาหกรรมกบินทร์บุรี",
        description:
          "ที่ดินตั้งอยู่ตรงข้ามสวนอุตสาหกรรมกวางตุ้ง ต.หนองกี่ อ.กบินทร์บุรี เหมาะสำหรับโรงงาน คลังสินค้า และธุรกิจที่ต้องการอยู่ใกล้โซนอุตสาหกรรม",
      },
      {
        title: "เอกสารสิทธิ์ครบหลายฉบับ",
        description:
          "รวม 12 โฉนดและ ภ.บ.ท.5 จำนวน 2 แปลง รวมเนื้อที่ 101 ไร่ 0 งาน 22 ตารางวา สะดวกในการเจรจาและโอนกรรมสิทธิ์",
      },
      {
        title: "เดินทางและโลจิสติกส์",
        description:
          "ติดถนน อบต. หน้ากว้างประมาณ 700 เมตร ตั้งอยู่ตรงข้ามสวนอุตสาหกรรมกวางตุ้ง เข้าถึงโซนอุตสาหกรรมได้สะดวก",
      },
    ],
    gallery: [
      {
        src: "/images/listings/kabin-buri-101-rai-gallery/01-drone-roadside.png",
        alt: "ภาพโดรนที่ดิน 101 ไร่ กบินทร์บุรี ติดถนนตรงข้ามสวนอุตสาหกรรมกวางตุ้ง",
      },
      {
        src: "/images/listings/kabin-buri-101-rai-gallery/02-drone-aerial.png",
        alt: "ภาพโดรนมุมสูงที่ดิน 101 ไร่ กบินทร์บุรี ใกล้คลังสินค้าและโรงงาน",
      },
      {
        src: "/images/listings/kabin-buri-101-rai-gallery/03-drone-overview.png",
        alt: "ภาพโดรนแสดงภาพรวมที่ดิน 101 ไร่ กบินทร์บุรี และพื้นที่โดยรอบ",
      },
      {
        src: "/images/listings/kabin-buri-101-rai-gallery/04-boundary-map.png",
        alt: "แผนที่ขอบเขตแปลงที่ดิน 101 ไร่ แบ่ง 13 แปลง พร้อมเลขโฉนด",
      },
      {
        src: "/images/listings/kabin-buri-101-rai-gallery/05-boundary-map-detail.png",
        alt: "แผนที่ขอบเขตรายละเอียด 101 ไร่ 0 งาน 22 ตารางวา ต.หนองกี่ อ.กบินทร์บุรี",
      },
      {
        src: "/images/listings/kabin-buri-101-rai-gallery/06-overview-flyer.png",
        alt: "ภาพรวมที่ดิน 101 ไร่ กบินทร์บุรี ราคา 1.5 ล้าน/ไร่ ตรงข้ามสวนอุตสาหกรรมกวางตุ้ง",
      },
    ],
    videos: [
      {
        src: "/videos/listings/kabin-buri-101-rai/01-site-video.mp4",
        title: "วิดีโอบินถ่ายที่ดิน 101 ไร่ กบินทร์บุรี (1)",
      },
      {
        src: "/videos/listings/kabin-buri-101-rai/02-site-video.mp4",
        title: "วิดีโอบินถ่ายที่ดิน 101 ไร่ กบินทร์บุรี (2)",
      },
    ],
    mapEmbed: {
      embedUrl:
        "https://maps.google.com/maps?q=14.0417619,101.8310660&hl=th&z=15&output=embed",
      directionsUrl: "https://maps.app.goo.gl/PNUTWFQ6jiVX2Yvd6?g_st=il",
      description:
        "ที่ดินตั้งอยู่ ต.หนองกี่ อ.กบินทร์บุรี จ.ปราจีนบุรี ตรงข้ามสวนอุตสาหกรรมกวางตุ้ง เข้าถึงโซนอุตสาหกรรมกบินทร์บุรีได้สะดวก",
    },
  },
];

export function getPropertyDetail(slug: string): PropertyDetail | undefined {
  return propertyDetails.find((property) => property.slug === slug);
}

export function propertyHref(slug: string): string {
  return `/property/${slug}`;
}
