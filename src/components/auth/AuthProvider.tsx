"use client";

import { createContext, useContext } from "react";
import { authClient, authConfigured } from "@/lib/auth/client";

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

const AuthContext = createContext<AuthContextValue>({ user: null, sessionToken: null, loading: true });

function ConfiguredAuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const user = (data?.user as AuthUser | undefined) ?? null;
  const sessionToken = (data?.session as { token?: string } | undefined)?.token ?? null;

  return (
    <AuthContext.Provider value={{ user, sessionToken, loading: isPending }}>
      {children}
    </AuthContext.Provider>
  );
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
