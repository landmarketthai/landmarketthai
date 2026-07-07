"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginClient() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authError = searchParams.get("error");
  const next = searchParams.get("next") ?? "/";

  const authErrorMessage =
    authError === "auth_failed"
      ? "เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง"
      : null;

  const visibleError = error ?? authErrorMessage;

  useEffect(() => {
    if (!loading && user) {
      router.replace(next === "/login" ? "/" : next);
    }
  }, [user, loading, router, next]);

  async function handleGoogleLogin() {
    if (!supabase) {
      setError("ระบบยังไม่พร้อมใช้งาน");
      return;
    }
    setIsSigningIn(true);
    setError(null);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
        : "/auth/callback";

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (signInError) {
      setError("ไม่สามารถเชื่อมต่อกับ Google ได้ กรุณาลองใหม่");
      setIsSigningIn(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="card p-8 sm:p-10">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/images/site-logo.jpg"
                alt="ตลาดที่ดินไทย.com"
                width={96}
                height={96}
                className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-200"
              />
            </Link>
          </div>

          <h1 className="text-xl font-bold text-center text-slate-900 mb-1">
            เข้าสู่ระบบ
          </h1>
          <p className="text-sm text-center text-slate-500 mb-8">
            ใช้บัญชี Google ของคุณเพื่อเข้าสู่ระบบ
          </p>

          {!supabase && (
            <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
              ยังไม่ได้ตั้งค่า Supabase — คัดลอก{" "}
              <code className="text-xs">.env.local.example</code> เป็น{" "}
              <code className="text-xs">.env.local</code> แล้วใส่ URL และ Anon Key
            </div>
          )}

          {visibleError && (
            <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {visibleError}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={isSigningIn || !supabase}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSigningIn ? (
              <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            {isSigningIn ? "กำลังเชื่อมต่อ..." : "เข้าสู่ระบบด้วย Google"}
          </button>

          <p className="mt-8 text-xs text-center text-slate-400">
            การเข้าสู่ระบบถือว่าคุณยอมรับ{" "}
            <Link href="/terms" className="text-brand-600 hover:underline">
              ข้อกำหนดการใช้งาน
            </Link>{" "}
            และ{" "}
            <Link href="/privacy" className="text-brand-600 hover:underline">
              นโยบายความเป็นส่วนตัว
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/" className="text-brand-600 hover:underline">
            ← กลับหน้าแรก
          </Link>
        </p>
      </div>
    </div>
  );
}
