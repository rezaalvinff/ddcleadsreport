"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { allowedEmails, readEnv } from "@/lib/env";
import { createAuthClient } from "@/lib/supabase/server";

// Login actions are the only server actions that do not call requireUser().

export interface LoginState {
  error: string | null;
  email?: string;
}

const credentials = z.object({
  email: z.email("Email tidak valid."),
  password: z.string().min(1, "Isi password."),
});

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!readEnv("supabase").ok) return { error: "Supabase belum dikonfigurasi di environment variables." };
  if (!readEnv("auth").ok) return { error: "ALLOWED_EMAILS belum diisi. Tidak ada akun yang diizinkan masuk." };

  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const typedEmail = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, email: typedEmail };
  const email = parsed.data.email.toLowerCase();

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) {
    if (error.code === "invalid_credentials" || error.status === 400) return { error: "Email atau password salah.", email };
    console.error("[login]", error);
    return { error: `Tidak dapat menghubungi Supabase Auth (${error.message}). Coba lagi.`, email };
  }
  if (!allowedEmails().has(email)) {
    await supabase.auth.signOut();
    return { error: "Akun ini tidak diizinkan mengakses aplikasi.", email };
  }
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  if (readEnv("supabase").ok) {
    const supabase = await createAuthClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
