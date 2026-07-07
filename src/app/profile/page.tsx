import Image from "next/image";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { User, Mail, Calendar } from "lucide-react";

export const metadata: Metadata = {
  title: "โปรไฟล์ของฉัน",
};

export default async function ProfilePage() {
  const supabase = await createSessionClient();
  if (!supabase) {
    redirect("/login?next=/profile");
  }
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "ผู้ใช้";

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  const joinedDate = new Date(user.created_at).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="section">
      <div className="container-xl max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">โปรไฟล์ของฉัน</h1>

        <div className="card p-6 sm:p-8">
          {/* Avatar + name */}
          <div className="flex items-center gap-4 mb-8">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={128}
                height={128}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-brand-100"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-brand-100 flex items-center justify-center">
                <User size={28} className="text-brand-600" />
              </div>
            )}
            <div>
              <p className="text-xl font-semibold text-slate-900">{displayName}</p>
              <p className="text-sm text-slate-500">สมาชิก LandmarketThai</p>
            </div>
          </div>

          {/* Info rows */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <Mail size={16} className="text-slate-400 shrink-0" />
              <span className="text-slate-500 w-24 shrink-0">อีเมล</span>
              <span className="text-slate-800">{user.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar size={16} className="text-slate-400 shrink-0" />
              <span className="text-slate-500 w-24 shrink-0">สมัครเมื่อ</span>
              <span className="text-slate-800">{joinedDate}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
