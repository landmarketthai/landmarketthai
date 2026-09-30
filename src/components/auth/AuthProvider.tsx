"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { authConfigured } from "@/lib/auth/client";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface AuthContextValue {
  user: AuthUser | null;
  sessionToken: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  sessionToken: null,
  loading: true,
});

function ConfiguredAuthProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<AuthContextValue>({
    user: null,
    sessionToken: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    fetch("/api/auth/get-session", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active) return;
        setValue({
          user: (data?.user as AuthUser | undefined) ?? null,
          sessionToken: typeof data?.session?.token === "string" ? data.session.token : null,
          loading: false,
        });
      })
      .catch(() => {
        if (active) setValue({ user: null, sessionToken: null, loading: false });
      });

    return () => {
      active = false;
    };
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!authConfigured) {
    return (
      <AuthContext.Provider value={{ user: null, sessionToken: null, loading: false }}>
        {children}
      </AuthContext.Provider>
    );
  }

  return <ConfiguredAuthProvider>{children}</ConfiguredAuthProvider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
