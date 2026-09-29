"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Mail, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export default function ProfileClient() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?next=/profile");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const displayName = user.name || user.email?.split("@")[0] || "ผู้ใช้";
  const avatarUrl = user.image ?? undefined;
  const joinedDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <div className="section">
      <div className="container-xl max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">โปรไฟล์ของฉัน</h1>

        <div className="card p-6 sm:p-8">
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
