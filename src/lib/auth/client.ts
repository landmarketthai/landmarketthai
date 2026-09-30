"use client";

import { createAuthClient } from "@neondatabase/auth/next";

export const authConfigured = true;

export const authClient = createAuthClient();
