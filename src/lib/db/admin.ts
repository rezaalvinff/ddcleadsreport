import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "../env";
import type { Database } from "./types";

export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

/**
 * Service-role client. Server-only: bypasses RLS, so every caller must have
 * authorised the request first (requireUser / cron secret).
 */
export function getAdminDb(): Db {
  if (cached) return cached;
  const env = requireEnv("supabase");
  cached = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Turns a PostgREST error into an exception with a readable message. */
export function dbError(context: string, error: { message: string; code?: string; details?: string | null }): Error {
  return new Error(`${context}: ${error.message}${error.details ? ` (${error.details})` : ""}`);
}
