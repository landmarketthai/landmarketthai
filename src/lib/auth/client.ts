"use client";

import { createAuthClient } from "better-auth/react";

const DEFAULT_NEON_AUTH_URL =
  "https://ep-raspy-credit-aztfc03r.neonauth.c-3.ap-southeast-1.aws.neon.tech/landmarketthai/auth";

const configuredBaseUrl =
  process.env.NEXT_PUBLIC_NEON_AUTH_URL?.trim() || DEFAULT_NEON_AUTH_URL;

export const authConfigured = Boolean(configuredBaseUrl);

export const authClient = createAuthClient({
  baseURL: configuredBaseUrl,
});
