import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { cookies } from "next/headers";
import { allowedEmails, readEnv } from "./env";
import { createAuthClient } from "./supabase/server";

export interface AppUser {
  id: string;
  email: string;
}

/** Signed-in user verified with Supabase Auth and the ALLOWED_EMAILS allowlist. */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  await cookies(); // per-request: never prerendered
  if (!readEnv("supabase").ok) return null;
  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  const email = data.user.email.toLowerCase();
  if (!allowedEmails().has(email)) return null;
  return { id: data.user.id, email };
});

/**
 * Must be the first statement of every server action and protected page:
 * server actions are public POST endpoints, so the proxy alone is not enough.
 */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
