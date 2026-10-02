import { createNeonAuth } from "@neondatabase/auth/next/server";

const DEFAULT_NEON_AUTH_URL =
  "https://ep-raspy-credit-aztfc03r.neonauth.c-3.ap-southeast-1.aws.neon.tech/landmarketthai/auth";

const baseUrl = process.env.NEON_AUTH_BASE_URL?.trim() || DEFAULT_NEON_AUTH_URL;
const configuredCookieSecret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
const isLocalDevelopment = process.env.NODE_ENV === "development"
  && !process.env.VERCEL && !process.env.VERCEL_ENV && !process.env.CI
  && !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.NETLIFY && !process.env.RENDER;
const cookieSecret =
  configuredCookieSecret ||
  (isLocalDevelopment ? `${crypto.randomUUID()}${crypto.randomUUID()}` : "");

if (cookieSecret.length < 32) {
  throw new Error("NEON_AUTH_COOKIE_SECRET must be configured with at least 32 characters.");
}

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: cookieSecret,
    sessionDataTtl: 300,
    sameSite: "lax",
  },
});
