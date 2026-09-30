import type { Land } from "@/lib/types/database";
import { isVerified } from "@/lib/verification";

export default function VerificationBadges({ land }: { land: Land }) {
  const property = isVerified(land);
  const agent = isVerified(land.agent);
  if (!property && !agent) return null;
  return (
    <div className="my-2 flex flex-wrap gap-2 text-xs font-semibold text-emerald-800">
      {property && <span className="rounded-full bg-emerald-50 px-2 py-1" title="ทีมงานตรวจข้อมูลประกาศแล้ว ไม่ใช่การรับรองกรรมสิทธิ์หรือผลตอบแทน">✓ Verified Property</span>}
      {agent && <span className="rounded-full bg-emerald-50 px-2 py-1" title="ทีมงานตรวจตัวตนผู้ดูแลประกาศแล้ว">✓ Verified Agent · {land.agent?.display_name}</span>}
    </div>
  );
}
