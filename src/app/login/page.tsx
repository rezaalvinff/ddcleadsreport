import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage() {
  await connection(); // configuration is read at request time, not build time
  const configured = readEnv("supabase").ok;
  if (configured && (await getCurrentUser())) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="" width={56} height={59} priority className="h-14 w-auto" />
          <h1 className="mt-3 text-base font-semibold text-neutral-900">DDC Leads Report</h1>
          <p className="text-xs text-neutral-500">Aplikasi internal Mitsubishi DIPO</p>
        </div>
        {configured ? (
          <LoginForm />
        ) : (
          <p className="text-sm text-red-700">
            Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY
            (lihat README).
          </p>
        )}
      </div>
    </main>
  );
}
