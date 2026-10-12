"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_TOKEN_HEADER = "x-turnstile-token";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

let scriptPromise: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing"));
    script.onerror = () => { scriptPromise = null; script.remove(); reject(new Error("turnstile load failed")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function TurnstileWidget({ onToken, action, resetKey = 0 }: { onToken: (token: string | null) => void; action?: string; resetKey?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    loadTurnstile().then((api) => {
      if (cancelled || !container.current) return;
      widgetId.current = api.render(container.current, {
        sitekey: SITE_KEY,
        action,
        appearance: "interaction-only",
        callback: (token: string) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
      });
    }).catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action]);

  // Tokens are single-use: parent bumps resetKey after every submit attempt.
  useEffect(() => {
    if (resetKey > 0 && widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={container} role="group" aria-label="Human verification" />;
}

/** Wiring helper for forms: `enabled` is false (and everything inert) when no site key is configured. */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const tokenRef = useRef<string | null>(null);
  const onToken = useCallback((value: string | null) => { tokenRef.current = value; setToken(value); }, []);
  const reset = useCallback(() => { tokenRef.current = null; setToken(null); setResetKey((key) => key + 1); }, []);
  const headers = (): Record<string, string> => tokenRef.current ? { [TURNSTILE_TOKEN_HEADER]: tokenRef.current } : {};
  return { enabled: Boolean(SITE_KEY), token, onToken, resetKey, reset, headers };
}
