"use client";

import { Share2 } from "lucide-react";

interface Props {
  title: string;
}

export default function ShareButton({ title }: Props) {
  return (
    <button
      className="btn-outline w-full text-sm flex items-center justify-center gap-2"
      onClick={() => {
        if (typeof navigator !== "undefined") {
          navigator.share?.({ title, url: window.location.href });
        }
      }}
    >
      <Share2 size={15} />
      แชร์ที่ดินนี้ · รับค่าคอม
    </button>
  );
}
